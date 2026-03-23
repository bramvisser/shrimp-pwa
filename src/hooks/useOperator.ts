import { useState, useCallback } from 'react';

const STORAGE_KEY = 'operator_name';

export function useOperator() {
  const [name, setNameState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const setName = useCallback((newName: string) => {
    localStorage.setItem(STORAGE_KEY, newName);
    setNameState(newName);
  }, []);

  const clearName = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setNameState(null);
  }, []);

  return { name, setName, clearName };
}
