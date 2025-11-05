import { useCallback, useRef, useState } from "react";
import supabase from "supabase/supabaseClient";
import DepotItem from "types/depotItem";
import handlePostgrestError from "util/fns/handlePostgrestError";
import itemJson from "data/items.json";
import useLocalStorage from "util/hooks/useLocalStorage";
import debounce from "lodash/debounce";
import { useQueryFactory } from "util/hooks/useQueryFactory";

type Depot = Record<string, DepotItem>;

const DEPOT_QUERY_KEY = ["depot"];

function useDepot() {
  const [localDepot, setLocalDepot, lastFetchedAt] = useLocalStorage<Depot>("v3_depot", {});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const depotTrackers = useRef({
    rawUpdate: {} as Depot,
    ogValues: {} as Depot,
  });
  const debounceSyncDelay = 5000; //5s of no changes before updating db

  const {
    data: queryDepot,
    useOptimisticMutation,
    getCurrentData,
    queryClient,
  } = useQueryFactory<Depot>({
    queryKey: DEPOT_QUERY_KEY,
    queryOptions: {
      initialData: localDepot,
      initialDataUpdatedAt: new Date(lastFetchedAt ?? 0).getTime(),
    },
    fetchFn: useCallback(async (): Promise<Depot> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) throw new Error("No user session");

      const { data: _depot, error } = await supabase.from("depot").select().eq("user_id", user_id);
      if (error) {
        handlePostgrestError(error);
        throw error;
      }

      const depotResult: Depot = {};
      const depotTrash: string[] = [];

      if (_depot?.length) {
        _depot.forEach(({ user_id, ...x }) => { //remove user_id from LS
          if (x.material_id in itemJson) {
            depotResult[x.material_id] = { ...x };
          } else {
            depotTrash.push(x.material_id);
          }
        });
      }

      // Clean up invalid items
      if (depotTrash.length) await supabase.from("depot").delete().eq("user_id", user_id).in("material_id", depotTrash);
      console.log("fetched Depot");
      // Update localStorage with timestamp
      setLocalDepot(depotResult, new Date().toISOString());

      return depotResult;
    }, [setLocalDepot]),
  });

  //Function for direct upsert to db and reset change trackers
  const syncDepotToDB = useCallback(async (items: DepotItem[]) => {
    if (items.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user_id = session?.user.id;
    if (!user_id) return;

    const { error } = await supabase.from("depot").upsert(items).eq("user_id", user_id);
    if (error) {
      throw error
    } else {
      depotTrackers.current = { rawUpdate: {}, ogValues: {} };
      setHasUnsavedChanges(false);
    }
  }, []);

  //Debounced call of syncDepotToDB
  const debouncedSyncDepot = useCallback(
    debounce((items: DepotItem[]) => {
      syncDepotToDB(items);
    }, debounceSyncDelay),
    [syncDepotToDB]
  );

  //update local storage and agregate depot changes into rawDepotUpdate
  //immediate - to sync depot to db without debounce
  const putDepot = useOptimisticMutation<{ items: DepotItem[]; immediate?: boolean }, void>({
    optimisticUpdate: {
      updateFn: (currentDepot, { items }) => {
        //clean user_id
        //mixing items with/w/o user_id, provokes row-level security error in upsert
        const newDepot: Depot = {};
        for (const key in currentDepot) {
          const { user_id, ...rest } = currentDepot[key];
          newDepot[key] = rest;
        }
        const _rawDepotUpdate = { ...depotTrackers.current.rawUpdate };
        const _ogDepotValues = { ...depotTrackers.current.ogValues };

        items.forEach((item) => {
          //need to create item in OG storage, if it didnt exist
          //if exist - agregate only changes
          if ((newDepot[item.material_id]?.stock ?? 0) !== item.stock) {
            //keep og item before first change.
            if (!_ogDepotValues[item.material_id] && newDepot[item.material_id])
              _ogDepotValues[item.material_id] = { ...newDepot[item.material_id] };
            //ignore user_id
            newDepot[item.material_id] = {
              material_id: item.material_id,
              stock: item.stock,
            };
            //ensure stock change from og value
            if (newDepot[item.material_id].stock !== (_ogDepotValues[item.material_id]?.stock ?? 0)) {
              _rawDepotUpdate[item.material_id] = { ...newDepot[item.material_id] };
            } else if (_rawDepotUpdate[item.material_id]) {
              //remove change if stock returned
              delete _rawDepotUpdate[item.material_id];
            }
          }
        });
        const hasChanges = Object.keys(_rawDepotUpdate).length > 0;
        // Update trackers
        depotTrackers.current = {
          rawUpdate: _rawDepotUpdate,
          ogValues: _ogDepotValues,
        };
        setHasUnsavedChanges(hasChanges);

        setLocalDepot(newDepot, null);
        return newDepot;
      },
    },
    mutationFn: async ({ items, immediate }) => {
      const { rawUpdate } = depotTrackers.current;

      // Sync to DB
      const itemsToSync = Object.values(rawUpdate);
      immediate ? await syncDepotToDB(itemsToSync) : debouncedSyncDepot(itemsToSync);
    },
  });

  const resetDepot = useOptimisticMutation<void, void>({
    optimisticUpdate: {
      updateFn: (currentDepot) => {
        const zeroDepot: Depot = {};

        for (const key in currentDepot) {
          const { user_id, ...rest } = currentDepot[key];
          zeroDepot[key] = { ...rest, stock: 0 };
        }

        setLocalDepot(zeroDepot, null);
        return zeroDepot;
      },
    },
    mutationFn: async () => {
      const zeroDepot = getCurrentData();
      await syncDepotToDB(Object.values(zeroDepot));
    },
  });

  //export function to refresh debounce timer with current changes data
  const refreshDebounce = useCallback(() => {
    //not do anything without active debounce
    if (hasUnsavedChanges) {
      debouncedSyncDepot(Object.values(depotTrackers.current.rawUpdate));
    }
  }, [debouncedSyncDepot, hasUnsavedChanges]);

  // convert props
  const _putDepot = useCallback((items: DepotItem[], immediate?: boolean) => {
    putDepot.mutate({ items, immediate });
  }, [putDepot]);

  const _resetDepot = useCallback(() => {
    resetDepot.mutate();
  }, [resetDepot]);

  return [
    queryDepot || localDepot,
    _putDepot,
    _resetDepot,
    hasUnsavedChanges,
    refreshDebounce
  ] as const;
}

export default useDepot;
