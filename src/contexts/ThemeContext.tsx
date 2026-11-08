import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';
interface ThemeContextValue { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void; }
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSavedTheme(): Theme {
  try {
    return localStorage.getItem('master-calendar-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('master-calendar-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme: () => setTheme((t) => t === 'dark' ? 'light' : 'dark') }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
