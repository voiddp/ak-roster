import { useCallback } from "react";
import { Operator, OperatorV2 } from "types/operators/operator";
import operatorJson from "data/operators";
import useLocalStorage from "./useLocalStorage";
import Roster from "types/operators/roster";
import supabase from "supabase/supabaseClient";
import handlePostgrestError from "util/fns/handlePostgrestError";
import { repair } from "util/fns/convertLegacyOperator";
import { enqueueSnackbar } from "notistack";
import { useQueryFactory } from "util/hooks/useQueryFactory";

function useOperators() {
  const [localOperators, setLocalOperators, lastFetchedAt] = useLocalStorage<Roster>("v3_roster", {});
  const [legacyOperators, setLegacyOperators] = useLocalStorage<null | Record<string, OperatorV2>>("operators", null);

  const {
    data: queryOperators,
    useOptimisticMutation,
  } = useQueryFactory<Roster>({
    queryKey: ["operators"],
    queryOptions: {
      initialData: localOperators,
      initialDataUpdatedAt: new Date(lastFetchedAt ?? 0).getTime(),
    },
    fetchFn: useCallback(async (): Promise<Roster> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) throw new Error("No user session");

      const { data: dbOperators, error } = await supabase.from("operators").select().eq("user_id", user_id);
      if (error) {
        handlePostgrestError(error);
        throw error;
      }

      let _roster: Roster = {};

      if (dbOperators?.length) {
        dbOperators.forEach(({ user_id, ...op }) => { //remove user_id from LS
          if (op.op_id in operatorJson) _roster[op.op_id] = { ...op } as Operator;
        });
      } else if (!Object.keys(localOperators).length && legacyOperators) {
        enqueueSnackbar("Loading cached roster data...", { variant: "info" });
        _roster = repair(legacyOperators);

        const { error } = await supabase.from("operators").insert(Object.values(_roster));
        if (error) {
          handlePostgrestError(error);
        } else {
          enqueueSnackbar("Finished loading data.", { variant: "success" });
          setLegacyOperators(null);
          localStorage.removeItem("operators");
        }
      }
      //local storage & update timestamp
      console.log("fetchOperators called");
      setLocalOperators(_roster, new Date().toISOString());

      return _roster;
    }, [localOperators, legacyOperators, setLegacyOperators, setLocalOperators])
  });

  const updateOperator = useOptimisticMutation<Operator, void>({
    optimisticUpdate: {
      updateFn: (currentRoster: Roster, op: Operator) => {
        const newRoster = { ...currentRoster };

        if (op.potential) {
          newRoster[op.op_id] = op;
        } else {
          delete newRoster[op.op_id];
        }

        setLocalOperators(newRoster, null);
        return newRoster;
      },
    },
    mutationFn: async (op: Operator) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      if (op.potential) {
        const { error } = await supabase.from("operators").upsert(op).eq("user_id", user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("operators").delete().eq("user_id", user_id).eq("op_id", op.op_id);
        if (error) throw error;
      }
    },
  });

  //upsert or delete whole roster
  const updateRoster = useOptimisticMutation<Operator[], void>({
    optimisticUpdate: {
      updateFn: (currentRoster: Roster, operators: Operator[]) => {
        const roster: Roster = {};
        operators.forEach((op)=> roster[op.op_id] = op);
        
        setLocalOperators(roster, null);
        return roster;
      },
    },
    mutationFn: async (operators: Operator[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      if (operators.length > 0) {
        const { error } = await supabase.from("operators").upsert(operators).eq("user_id", user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("operators").delete().eq("user_id", user_id);
        if (error) throw error;
      }
    }
  });

  //convert props
  const onChange = useCallback(
    (op: Operator) => {
      updateOperator.mutate(op);
    },
    [updateOperator]
  );

  const putOperators = useCallback(
    (operators: Operator[]) => {
      updateRoster.mutate(operators);
    },
    [updateRoster]
  );

  return [queryOperators || localOperators, onChange, putOperators] as const;
}
export default useOperators;
