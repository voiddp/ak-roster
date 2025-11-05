import supabase from "supabase/supabaseClient";
import AccountData, { AccountDataInsert } from "types/auth/accountData";
import { enqueueSnackbar } from "notistack";
import randomName from "util/fns/randomName";
import handlePostgrestError from "util/fns/handlePostgrestError";
import { useQueryFactory } from "util/hooks/useQueryFactory";
import { useCallback } from "react";

async function fetchAccount(): Promise<AccountData | undefined> {
  const { data: { session } } = await supabase.auth.getSession();
  const user_id = session?.user.id;
  if (!user_id) throw new Error("No user session");

  console.log("fetching account");

  const { data, error } = await supabase
    .from("krooster_accounts")
    .select()
    .eq("user_id", user_id)
    .limit(1)
    .single();
  if (error) {
    handlePostgrestError(error);
    throw error;
  }
  // If user record missing or empty username → create one
  if (!data || (!data.username && !error)) {
    const genName = randomName();
    const { data: accountData, error: upsertError } = await supabase
      .from("krooster_accounts")
      .upsert({
        user_id: user_id,
        username: genName,
        display_name: genName,
      })
      .is("username", null)
      .select()
      .limit(1)
      .single();

    handlePostgrestError(upsertError);
    enqueueSnackbar({
      message: "You have been assigned a random username. Change it in the settings!",
      variant: "info",
    });
    return accountData as AccountData;
  }

  return data as AccountData;
}

function useAccount() {

  const {
    data: account,
    isLoading,
    getCurrentData,
    useOptimisticMutation,
  } = useQueryFactory<AccountData | undefined>({
    queryKey: ["account"],
    fetchFn: fetchAccount,
  });

  const updateAccount = useOptimisticMutation<AccountDataInsert, void>({
    optimisticUpdate: {
      updateFn: (currentAccount: AccountData | undefined, newData: AccountDataInsert) => {
        return currentAccount ? { ...currentAccount, ...newData } as AccountData : undefined;
      },
    },
    mutationFn: async (accountData: AccountDataInsert) => {
      const previous = getCurrentData()
      const merged = { ...previous, ...accountData };
      const { user_id, ...rest } = merged;
      if (!user_id) throw new Error("Missing user_id");

      const { error } = await supabase
        .from("krooster_accounts")
        .update({ ...rest })
        .eq("user_id", user_id);
      if (error) throw error;
    },
  });

  //convert props
  const _updateAccount = useCallback(
    (accountData: AccountDataInsert) => {
      updateAccount.mutate(accountData);
    },
    [updateAccount]
  );


  return [account, _updateAccount, { loading: isLoading }] as const;
}

export default useAccount;
