import Preset from "types/operators/presets";
import { useCallback } from "react";
import supabase from "supabase/supabaseClient";
import handlePostgrestError from "util/fns/handlePostgrestError";
import useLocalStorage from "./useLocalStorage";
import { useQueryFactory } from "util/hooks/useQueryFactory";

interface PresetsHook {
  readonly presets: Preset[];
  readonly putPreset: (preset: Preset) => void;
  readonly deletePreset: (index: number) => void;
}

function usePresets(): PresetsHook {
  const [localPresets, setLocalPresets, lastFetchedAt] = useLocalStorage<Preset[]>("v3_presets", []);

  const {
    data: presets,
    useOptimisticMutation,
    getCurrentData,
  } = useQueryFactory<Preset[]>({
    queryKey: ["presets"],
    queryOptions: {
      initialData: localPresets,
      initialDataUpdatedAt: lastFetchedAt ? new Date(lastFetchedAt).getTime() : new Date(0).getTime(),
    },
    fetchFn: useCallback(async (): Promise<Preset[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) throw new Error("No user session");

      const { data: dbPresets, error } = await supabase.from("presets").select().eq("user_id", user_id);
      if (error) {
        handlePostgrestError(error);
        throw error;
      }

      let _presets = (dbPresets || []).map(({ user_id, ...rest }) => rest) //remove user_id from LS
        .sort((a, b) => a.index - b.index) as Preset[];

      if (_presets.length > 0 && !_presets.every(({ index }, i) => index === i)) {
        _presets = _presets.map((p, index) => ({ ...p, index }));

        // Update database with correct indices
        const { error } = await supabase
          .from("presets")
          .upsert(_presets)
          .eq("user_id", user_id);

        if (error) {
          handlePostgrestError(error);
          throw error;
        }
      }

      setLocalPresets(_presets, new Date().toISOString());
      return _presets;
    }, [setLocalPresets]),
  });

  // Mutation to add or update a preset
  const putPreset = useOptimisticMutation<Preset, void>({
    optimisticUpdate: {
      updateFn: (currentPresets, preset) => {
        const newPresets = currentPresets.map(({ user_id, ...rest }) => rest); //copy + clear user_ids

        if (preset.index === newPresets.length) {
          newPresets.push({ ...preset });
        } else if (preset.index < newPresets.length) {
          newPresets[preset.index] = { ...preset };
        }

        setLocalPresets(newPresets, null);
        return newPresets;
      },
    },
    mutationFn: async (preset: Preset) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      const { error } = await supabase
        .from("presets")
        .upsert({ ...preset })
        .eq("user_id", user_id);
      if (error) throw error;
    },
  });

  // Mutation for deleting a preset
  const deletePreset = useOptimisticMutation<number, void>({
    optimisticUpdate: {
      updateFn: (currentPresets, index) => {
        const remainingPresets = currentPresets.filter((_, i) => i !== index);
        const reindexedPresets = remainingPresets.map(({ user_id, ...rest }, newIndex) => ({ ...rest, index: newIndex }));  //reindex + clean user_id

        setLocalPresets(reindexedPresets, null);
        return reindexedPresets;
      },
    },
    mutationFn: async (index: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user.id;
      if (!user_id) return;

      //get reindexed presets
      const currentPresets = getCurrentData();

      if (currentPresets.length > 0) {
        //upsert once
        const { error } = await supabase
          .from("presets")
          .upsert(currentPresets)
          .eq("user_id", user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("presets")
          .delete()
          .eq("user_id", user_id);
        if (error) throw error;
      }
    },
  });

  return {
    presets: presets || localPresets,
    putPreset: putPreset.mutate,
    deletePreset: deletePreset.mutate,
  } as PresetsHook;
}

export default usePresets;