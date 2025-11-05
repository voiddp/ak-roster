import { useCallback } from "react";
import supabase from "supabase/supabaseClient";
import GoalData, { getPlannerGoals, GoalDataInsert, plannerGoalToGoalData } from "types/goalData";
import handlePostgrestError from "util/fns/handlePostgrestError";
import useLocalStorage from "./useLocalStorage";
import { useQueryFactory } from "util/hooks/useQueryFactory";

export interface GoalsHook {
  readonly goals: GoalData[];
  readonly updateGoals: (goalsData: GoalDataInsert[]) => void;
  readonly removeAllGoals: () => void;
  readonly removeAllGoalsFromGroup: (groupName: string, cleanLocal?: boolean) => void;
  readonly removeAllGoalsFromOperator: (opId: string, groupName: string) => void;
  readonly changeLocalGoalGroup: (oldGoalGroup: string, newGoalGroup: string) => void;
}

export const GOALS_QUERY_KEY = ["goals"];

const fillNull = (goal: GoalDataInsert, index: number): GoalDataInsert => {
  const {
    op_id,
    group_name,
    elite_from,
    elite_to,
    level_from,
    level_to,
    masteries_from,
    masteries_to,
    modules_from,
    modules_to,
    skill_level_from,
    skill_level_to,
    sort_order,
  } = goal;
  return {
    op_id,
    group_name,
    elite_from: elite_from ?? null,
    elite_to: elite_to ?? null,
    level_from: level_from ?? null,
    level_to: level_to ?? null,
    masteries_from: masteries_from ?? null,
    masteries_to: masteries_to ?? null,
    modules_from: modules_from ?? null,
    modules_to: modules_to ?? null,
    skill_level_from: skill_level_from ?? null,
    skill_level_to: skill_level_to ?? null,
    sort_order: sort_order ?? index,
  };
};

function useGoals() {
  const [localGoals, setLocalGoals, lastFetchedAt] = useLocalStorage<GoalData[]>("v3_goals", []);

  const {
    data: queryGoals,
    useOptimisticMutation,
    getCurrentData,
  } = useQueryFactory<GoalData[]>({
    queryKey: GOALS_QUERY_KEY,
    queryOptions: {
      initialData: localGoals,
      initialDataUpdatedAt: new Date(lastFetchedAt ?? 0).getTime(),
    },
    fetchFn: useCallback(async (): Promise<GoalData[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) throw new Error("No user session"); 

      let _goals: GoalData[] = [];

      const { data: dbGoals, error } = await supabase.from("goals").select().eq("user_id", user_id);

      if (error) {
        handlePostgrestError(error);
        throw error;
      }
      if (dbGoals?.length) {
        _goals = dbGoals.map(({ user_id, ...rest }) => rest) as GoalData[]; //remove user_id from LS
      }
      console.log("fetchGoals called");
      setLocalGoals(_goals, new Date().toISOString());

      return _goals;
    }, [setLocalGoals])
  });

  const updater = useOptimisticMutation<any, void>({
    mutationFn: async ({ mutationFn, variables }) => {
      try {
        await mutationFn(variables);
      } catch (error) {
        // re-throw for React Query
        throw error;
      }
    },
    optimisticUpdate: {
      updateFn: (currentData, { optimisticUpdate, variables }) => {
        const newData = optimisticUpdate(variables, currentData);

        setLocalGoals(newData, null);
        return newData;
      },
    },
  });

  const updateGoals = useCallback((goalsData: GoalDataInsert[]) => {
    type dbOperations = Array<{ goal: GoalDataInsert; substantial: boolean }>;
    type Variables = { goalsData: GoalDataInsert[]; operations: dbOperations, currentGoals: GoalDataInsert[] };

    const processGoalsUpdate = (goalsData: GoalDataInsert[], currentGoals: GoalData[]) => {
      const operations: dbOperations = [];
      const _goals = [...currentGoals];
      const maxGroupIndex: Record<string, number> = {};
      _goals.forEach(g => {
        maxGroupIndex[g.group_name] = Math.max(maxGroupIndex[g.group_name] ?? 0, g.sort_order ?? 0);
      });
      const nulledGoalsData = goalsData.map((g) => fillNull(g, (maxGroupIndex[g.group_name] ?? -1) + 1));
      nulledGoalsData.forEach((goalInsert) => {
        const substantial = getPlannerGoals(goalInsert).length > 0;
        const index = _goals.findIndex((x) => x.op_id === goalInsert.op_id && x.group_name === goalInsert.group_name);
        //save db operations
        operations.push({ goal: goalInsert, substantial });
        //update object
        if (!substantial) {
          if (index !== -1) _goals.splice(index, 1);
        } else {
          if (index !== -1) {
            _goals[index] = { ..._goals[index], ...goalInsert } as GoalData;
          } else {
            _goals.push(goalInsert as GoalData);
          }
        }
      });

      return { updatedGoals: _goals, operations };
    };

    const optimisticUpdate = (variables: Variables, currentGoals: GoalData[]): GoalData[] => {
      const result = processGoalsUpdate(variables.goalsData, currentGoals);
      // Store operations in variables for mutationFn
      variables.operations = result.operations;
      return result.updatedGoals;
    };

    const mutationFn = async (variables: Variables): Promise<void> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      for (const { goal, substantial } of variables.operations) {
        if (!substantial) {
          const { error } = await supabase.from("goals").delete()
            .eq("user_id", user_id)
            .eq("op_id", goal.op_id)
            .eq("group_name", goal.group_name);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("goals").upsert(goal).eq("user_id", user_id);
          if (error) throw error;
        }
      }
    };

    updater.mutate({
      variables: { goalsData, operations: [] }, // Initial empty operations, will be filled in optimisticUpdate
      optimisticUpdate,
      mutationFn,
    });
  }, [updater]);


  const removeAllGoals = useCallback(() => {
    updater.mutate({
      variables: {},
      optimisticUpdate: (): GoalData[] => [],
      mutationFn: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user_id = session?.user.id;
        if (!user_id) return;

        const { error } = await supabase.from("goals").delete().eq("user_id", user_id)
        if (error) throw error;
      },
    });
  }, [updater]);

  const removeAllGoalsFromGroup = useCallback((groupName: string, cleanLocal?: boolean) => {
    type Variables = { groupName: string; cleanLocal?: boolean };

    const filterGoals = (variables: Variables, goals: GoalData[]) =>
      goals.filter(goal => goal.group_name !== variables.groupName);

    updater.mutate({
      variables: { groupName, cleanLocal },
      optimisticUpdate: filterGoals,
      mutationFn: async (variables: Variables) => {
        const { data: { session } } = await supabase.auth.getSession();
        const user_id = session?.user.id;
        if (!user_id) return;

        if (variables.cleanLocal) return;

        const { error } = await supabase.from("goals").delete().eq("user_id", user_id).eq("group_name", variables.groupName);
        if (error) throw error;
      },
    });
  }, [updater]);

  const removeAllGoalsFromOperator = useCallback((opId: string, groupName: string) => {
    type Variables = { opId: string, groupName: string };

    const filterGoals = (variables: Variables, goals: GoalData[]) =>
      goals.filter(goal => goal.group_name !== variables.groupName || goal.op_id !== variables.opId);

    updater.mutate({
      variables: { opId, groupName },
      optimisticUpdate: filterGoals,
      mutationFn: async (variables: Variables) => {
        const { data: { session } } = await supabase.auth.getSession();
        const user_id = session?.user.id;
        if (!user_id) return;

        const { error } = await supabase.from("goals").delete()
          .eq("user_id", user_id)
          .eq("op_id", variables.opId)
          .eq("group_name", variables.groupName);
        if (error) throw error;
      },
    });
  }, [updater]);

  const changeLocalGoalGroup = useCallback((oldGoalGroup: string, newGoalGroup: string) => {
    type Variables = { oldGoalGroup: string, newGoalGroup: string };

    const updateGroup = (variables: Variables, goals: GoalData[]) => goals.map(goal =>
      goal.group_name === variables.oldGoalGroup ? { ...goal, group_name: variables.newGoalGroup } : goal
    );

    updater.mutate({
      variables: { oldGoalGroup, newGoalGroup },
      optimisticUpdate: updateGroup,
      mutationFn: async () => { }, //local only
    });
  }, [updater]);

  return {
    goals: queryGoals || localGoals,
    updateGoals,
    removeAllGoals,
    removeAllGoalsFromGroup,
    removeAllGoalsFromOperator,
    changeLocalGoalGroup,
  } as GoalsHook;
}

export default useGoals;
