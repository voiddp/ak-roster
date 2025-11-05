import {
    useQuery,
    useMutation,
    useQueryClient,
    QueryKey,
    UseQueryOptions,
} from '@tanstack/react-query';
import { debounce } from 'lodash';
import { enqueueSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PostgrestError } from "@supabase/supabase-js";
import handlePostgrestError from 'util/fns/handlePostgrestError';

interface UseQueryFactoryOptions<TData> {
    queryKey: QueryKey;
    fetchFn: () => Promise<TData>;
    queryOptions?: Partial<UseQueryOptions<TData>>;
}

interface OptimisticUpdateConfig<TData, TVariables> {
    updateFn: (currentData: TData, variables: TVariables) => TData;
}

interface MutationConfig<TData, TVariables, TMutationData = TData> {
    mutationKey?: string[];
    mutationFn: (variables: TVariables) => Promise<TMutationData>;
    optimisticUpdate?: OptimisticUpdateConfig<TData, TVariables>;
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: (data: TMutationData, variables: TVariables) => void;
    onError?: (error: any, variables: TVariables, context: any) => void;
    invalidateDelay?: number | null;
}

export function useQueryFactory<TData>({
    queryKey,
    fetchFn,
    queryOptions = {},
}: UseQueryFactoryOptions<TData>) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey,
        queryFn: fetchFn,
        staleTime: 7 * 24 * 60 * 60 * 1000,
        retry: 2,
        retryDelay: 1000,
        ...queryOptions,
    });

    const updateQueryData = useCallback((updater: (old: TData) => TData) => {
        queryClient.setQueryData(queryKey, updater);
    }, [queryClient, queryKey]);

    const getCurrentData = useCallback((): TData => {
        return queryClient.getQueryData(queryKey) as TData;
    }, [queryClient, queryKey]);

    // Ref with latest invalidation function
    const invalidationRef = useRef(() => {
        queryClient.invalidateQueries({ queryKey });
    });

    // Update the ref from deps
    useEffect(() => {
        invalidationRef.current = () => {
            queryClient.invalidateQueries({ queryKey });
        };
    }, [queryClient, queryKey]);

    const useOptimisticMutation = <TVariables, TMutationData = TData>({
        mutationKey,
        mutationFn,
        optimisticUpdate,
        successMessage,
        errorMessage = `Failed to save changes to ${queryKey}`,
        onSuccess,
        onError,
        invalidateDelay = 60 * 60 * 1000,
    }: MutationConfig<TData, TVariables, TMutationData>) => {

        const debouncedInvalidation = useMemo(() => {
            const func = () => {
                invalidationRef.current();
            };
            return invalidateDelay !== null
                ? debounce(func, invalidateDelay)
                : null;
        }, [invalidateDelay]);

        return useMutation({
            mutationKey,
            mutationFn: async (variables: TVariables) => {
                try {
                    const result = await mutationFn(variables);
                    return result;
                } catch (error) {
                    // re-throw for React Query
                    throw error;
                }
            },
            onMutate: async (variables: TVariables) => {
                await queryClient.cancelQueries({ queryKey });
                const previousData = getCurrentData();

                if (optimisticUpdate?.updateFn) {
                    const newData = optimisticUpdate.updateFn(previousData, variables as any);
                    updateQueryData(() => newData);
                }

                return { previousData };
            },
            onSuccess: (data, variables) => {
                if (successMessage) {
                    enqueueSnackbar(successMessage, { variant: 'success' });
                }
                onSuccess?.(data, variables);
            },
            retry: 2,
            retryDelay: 1000,
            onError: (error: unknown, variables, context: any) => {
                console.error(errorMessage, error);
                if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
                    handlePostgrestError(error as PostgrestError);
                } else {
                    enqueueSnackbar(errorMessage, { variant: 'error' });
                }
                // Rollback optimistic update
                if (context?.previousData) {
                    updateQueryData(() => context.previousData);
                }

                onError?.(error, variables, context);
            },
            onSettled: () => {
                debouncedInvalidation?.();
            },
        });
    };

    const useSimpleMutation = <TVariables, TMutationData = TData>({
        mutationKey,
        mutationFn,
        successMessage,
        errorMessage = `Failed to save changes to ${queryKey}`,
        onSuccess,
        onError,
        invalidateDelay = 60 * 60 * 1000,
    }: Omit<MutationConfig<TData, TVariables, TMutationData>, 'optimisticUpdate'>) => {

        const debouncedInvalidation = useMemo(() => {
            const func = () => {
                invalidationRef.current();
            };
            return invalidateDelay !== null
                ? debounce(func, invalidateDelay)
                : null;
        }, [invalidateDelay]);

        return useMutation({
            mutationKey,
            mutationFn: async (variables: TVariables) => {
                try {
                    const result = await mutationFn(variables);
                    return result;
                } catch (error) {
                    // re-throw for React Query
                    throw error;
                }
            },
            onSuccess: (data, variables) => {
                if (successMessage) {
                    enqueueSnackbar(successMessage, { variant: 'success' });
                }
                onSuccess?.(data, variables);
                debouncedInvalidation?.();
            },
            retry: 2,
            retryDelay: 1000,
            onError: (error: unknown, variables) => {
                console.error(errorMessage, error);
                if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
                    handlePostgrestError(error as PostgrestError);
                } else {
                    enqueueSnackbar(errorMessage, { variant: 'error' });
                }
                onError?.(error, variables, undefined);
            },
        });
    };

    return {
        // Query data and state
        data: query.data,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,

        // Data management helpers
        updateQueryData,
        getCurrentData,

        // Mutation creators
        useOptimisticMutation,
        useSimpleMutation,

        // Query client for advanced operations
        queryClient,
    };
}