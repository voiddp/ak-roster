import { useState, useCallback } from "react";

// Helper types for metadata
type StoredValue<T> =
  | (T & WithMetadata)
  | ArrayWithMetadata<T>
  | PrimitiveWithMetadata<T>;

interface WithMetadata {
  __metadata?: {
    lastFetchedAt?: string;
  };
}

interface ArrayWithMetadata<T> extends Array<T | WithMetadata> {
  // Metadata is stored as the last element
  [length: number]: T | WithMetadata;
}

interface PrimitiveWithMetadata<T> extends WithMetadata {
  data: T;
}

// Helper function to conditionally wrap value with timestamp
function wrapWithTimestamp<T>(value: T, timestamp?: string): StoredValue<T> {
  if (timestamp === undefined) {
    return value as StoredValue<T>;
  }
  const metadata = {
    __metadata: {
      ...(value as any).__metadata,
      lastFetchedAt: timestamp
    }
  };

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // For objects, add __metadata property
    return {
      ...value,
      ...metadata,
    };
  } else if (Array.isArray(value)) {
    return [...value, metadata];
  } else {
    // For primitives, wrap in object
    return {
      data: value,
      ...metadata,
    };
  }
}

// Helper function to extract value and timestamp
function extractValueAndTimestamp<T>(storedValue: any): { value: T; timestamp?: string } {
  if (storedValue === null || storedValue === undefined) {
    return { value: storedValue };
  }

  // Check if it's a wrapped primitive
  if (typeof storedValue === 'object'
    && 'data' in storedValue
    && storedValue.__metadata?.lastFetchedAt
    && Object.keys(storedValue).length === 2
  ) {
    return {
      value: storedValue.data,
      timestamp: storedValue.__metadata.lastFetchedAt,
    };
  }

  // Check if it's an object with __metadata
  if (typeof storedValue === 'object' && !Array.isArray(storedValue)) {
    const { __metadata, ...valueWithoutMetadata } = storedValue;
    if (__metadata?.lastFetchedAt) {
      return {
        value: valueWithoutMetadata as T,
        timestamp: __metadata.lastFetchedAt,
      };
    };
  }

  // Check if it's an array with __metadata as last element
  if (Array.isArray(storedValue) && storedValue.length > 0) {
    const lastItem = storedValue[storedValue.length - 1];
    if (lastItem.__metadata?.lastFetchedAt) {
      const valueWithoutMetadata = storedValue.slice(0, -1);
      return {
        value: valueWithoutMetadata as T,
        timestamp: lastItem.__metadata.lastFetchedAt,
      };
    };
  }

  // Regular value without timestamp
  return { value: storedValue };
}

// Hook
/**
 * A custom hook for using localStorage with React state management and optional timestamp tracking
 * @returns {[T, SetValueFunction<T>, string | undefined]} A tuple containing:
 *   - The current value
 *   - The setter function SetValue(value, timestamp?: string | null | undefined)
 *   - The current timestamp (if available)
 *     - Setter `timestamp` options:
 *       - `string` (preferably ISO): sets timestamp, data gets wrapped if needed
 *       - `null`: deletes timestamp/unwraps value in storage  
 *       - `undefined`: default - re-use previous state of timestamp if available
 */
function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [state, setState] = useState<{ value: T; timestamp?: string }>(() => {
    if (typeof window === "undefined") {
      return { value: initialValue };
    }
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      if (!item) return { value: initialValue };
      // Parse stored json or if none return initialValue
      const parsed = JSON.parse(item);
      return extractValueAndTimestamp<T>(parsed);
    } catch (error) {
      console.log(error);
      return { value: initialValue };
    }
  });
  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = useCallback((value: T | ((val: T) => T), timestamp?: string | null) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(state.value) : value;

      // Determine the timestamp to use
      let finalTimestamp: string | undefined;

      if (timestamp === undefined) {
        // Use previous timestamp if available
        finalTimestamp = state.timestamp;
      } else if (timestamp === null) {
        // Explicitly remove timestamp
        finalTimestamp = undefined;
      } else {
        // Use provided timestamp
        finalTimestamp = timestamp;
      }

      // Prepare value for storage
      const valueForStorage = wrapWithTimestamp(valueToStore, finalTimestamp);

      // Save state
      setState({
        value: valueToStore,
        timestamp: finalTimestamp
      });

      // Save to local storage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueForStorage));
      }
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.log(error);
    }
  }, [key, state.value, state.timestamp]);

  return [state.value, setValue, state.timestamp] as const;
}

export default useLocalStorage;
