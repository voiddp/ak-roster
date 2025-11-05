import { useCallback } from "react";
import supabase from "supabase/supabaseClient";
import { OperatorSupport } from "types/operators/supports";
import handlePostgrestError from "util/fns/handlePostgrestError";
import useLocalStorage from "./useLocalStorage";
import { useQueryFactory } from "util/hooks/useQueryFactory";

function useSupports() {
  const [localSupports, setLocalSupports, lastFetchedAt] = useLocalStorage<OperatorSupport[]>("v3_supports", []);

  const {
    data: querySupports,
    useOptimisticMutation,
  } = useQueryFactory<OperatorSupport[]>({
    queryKey: ["supports"],
    queryOptions: {
      initialData: localSupports,
      initialDataUpdatedAt: new Date(lastFetchedAt ?? 0).getTime(),
    },
    fetchFn: useCallback(async (): Promise<OperatorSupport[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;

      if (!user_id) throw new Error("No user session"); 

      const { data, error } = await supabase.from("supports").select().eq("user_id", user_id);
      if (error) {
        handlePostgrestError(error);
        throw error;
      }

      const supportsData = (data || []).map(({ user_id, ...rest }) => rest); //remove user_id from LS
      console.log("Fetched supports:");
      setLocalSupports(supportsData, new Date().toISOString());

      return supportsData;
    }, [setLocalSupports]),
  });

  const setSupport = useOptimisticMutation<OperatorSupport, void>({
    optimisticUpdate: {
      updateFn: (currentSupports, newSupport) => {
        const newSupports = [...currentSupports];
        const index = newSupports.findIndex((x) => x.slot === newSupport.slot);
        if (index === -1) {
          newSupports.push(newSupport);
        } else {
          newSupports[index] = newSupport;
        }

        setLocalSupports(newSupports, null);
        return newSupports;
      },
    },
    mutationFn: async (newSupport: OperatorSupport) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      const { error } = await supabase.from("supports").upsert(newSupport).eq("user_id", user_id);
      if (error) throw error;
    },
  });

  const removeSupport = useOptimisticMutation<number, void>({
    optimisticUpdate: {
      updateFn: (currentSupports, slot) => {
        const supportsCopy = currentSupports.filter((x) => x.slot !== slot);

        setLocalSupports(supportsCopy, null);
        return supportsCopy;
      },
    },
    mutationFn: async (slot: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      const { error } = await supabase.from("supports").delete().eq("user_id", user_id).eq("slot", slot);
      if (error) throw error;
    },
  });

  //convert props
  const _setSupport = useCallback(
    (newSupport: OperatorSupport) => {
      setSupport.mutate(newSupport);
    },
    [setSupport]
  );

  const _removeSupport = useCallback(
    (slot: number) => {
      removeSupport.mutate(slot);
    },
    [removeSupport]
  );

  return [
    querySupports || localSupports,
    _setSupport,
    _removeSupport,
  ] as const;
}

export default useSupports;