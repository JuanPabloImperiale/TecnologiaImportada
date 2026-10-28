import { useEffect, useState } from 'react';

export function useSearchInput(initialValue = '', delayMs = 1_200) {
  const [input, setInput] = useState(initialValue);
  const [search, setSearch] = useState(initialValue);

  useEffect(() => {
    if (!input.trim()) {
      setSearch('');
      return;
    }
    const timer = setTimeout(() => setSearch(input), delayMs);
    return () => clearTimeout(timer);
  }, [input, delayMs]);

  return [input, setInput, input.trim() ? search : '', Boolean(input.trim()) && input !== search] as const;
}