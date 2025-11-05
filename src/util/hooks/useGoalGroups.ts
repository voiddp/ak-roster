import { useCallback } from "react";
import supabase from "supabase/supabaseClient";
import { GroupsDataInsert } from "types/groupData";
import handlePostgrestError from "util/fns/handlePostgrestError";
import useLocalStorage from "./useLocalStorage";
import { useQueryFactory } from "util/hooks/useQueryFactory";

export interface GoalGroupsHook {
  readonly groups: string[];
  readonly putGroups: (goalGroupInsert: GroupsDataInsert[]) => void;
  readonly renameGroup: (oldName: string, newName: string) => void;
  readonly removeGroup: (groupName: string) => void;
}

function useGoalGroups() {
  const [localGroups, setLocalGroups, lastFetchedAt] = useLocalStorage<string[]>("v3_groups", []);

  const {
    data: queryGroups,
    useOptimisticMutation,
    queryClient,
  } = useQueryFactory<string[]>({
    queryKey: ["groups"],
    queryOptions: {
      initialData: localGroups,
      initialDataUpdatedAt: new Date(lastFetchedAt ?? 0).getTime(),
    },
    fetchFn: useCallback(async (): Promise<string[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) throw new Error("No user session"); 

      const { data, error } = await supabase.from("groups").select("group_name, sort_order").eq("user_id", user_id);
      if (error) {
        handlePostgrestError(error);
        throw error;
      }

      let names: string[] = [];
      if (data) {
        names = data.sort((a, b) => a.sort_order - b.sort_order).map((x) => x.group_name);
      }
      console.log("fetchGroups called");
      setLocalGroups(names, new Date().toISOString());
      return names;
    }, [setLocalGroups]
    ),
  });

  const putGroups = useOptimisticMutation<GroupsDataInsert[], void>({
    optimisticUpdate: {
      updateFn: (currentGroups, inserts) => {
        const groupsMap = new Map(
          currentGroups.map((group, idx) => [group, idx])
        );

        inserts.forEach(insert => {
          const sortOrder = insert.sort_order ?? groupsMap.get(insert.group_name) ?? groupsMap.size;
          groupsMap.set(insert.group_name, sortOrder);
        });

        const newGroups = Array.from(groupsMap.entries())
          .sort(([, orderA], [, orderB]) => orderA - orderB)
          .map(([groupName]) => groupName);

        setLocalGroups(newGroups, null);
        return newGroups;
      },
    },
    mutationFn: async (goalGroupInsert: GroupsDataInsert[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      const { error } = await supabase.from("groups").upsert(goalGroupInsert).eq("user_id", user_id);
      if (error) throw error;
    },
  });

  const renameGroup = useOptimisticMutation<{ oldName: string; newName: string }, void>({
    optimisticUpdate: {
      updateFn: (currentGroups, { oldName, newName }) => {
        const newGroups = currentGroups.map((group) => oldName === group ? newName : group);

        setLocalGroups(newGroups, null);
        return newGroups;
      }
    },
    mutationFn: async ({ oldName, newName }) => {
      if (!oldName || !newName || oldName === newName) return;

      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      const { error } = await supabase.from("groups").update({ group_name: newName }).eq("user_id", user_id).eq("group_name", oldName)
      if (error) throw error;
    },
  });

  const removeGroup = useOptimisticMutation<string, void>({
    optimisticUpdate: {
      updateFn: (currentGroups, groupName) => {
        const newGroups = currentGroups.filter((x) => x !== groupName);

        setLocalGroups(newGroups, null);
        return newGroups;
      }
    },
    mutationFn: async (groupName: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      const { error } = await supabase.from("groups").delete().eq("user_id", user_id).eq("group_name", groupName);
      if (error) throw error;
    },
  });

  //convert props
  const _renameGroup = useCallback((oldName: string, newName: string) => {
    renameGroup.mutate({ oldName, newName });
  }, [renameGroup]);

  return {
    groups: queryGroups || localGroups,
    putGroups: putGroups.mutate,
    renameGroup: _renameGroup,
    removeGroup: removeGroup.mutate,
  } as GoalGroupsHook;
}

export default useGoalGroups;
