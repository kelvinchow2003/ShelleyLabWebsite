import { createContext, useContext, type ReactNode } from 'react';

export type PageKey = 'home' | 'projects' | 'equipment' | 'logs' | 'deleted';

interface NavigationContextValue {
  currentPage: PageKey;
  navigateTo: (page: PageKey) => void;
  viewProject: (projectId: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationContextValue;
  children: ReactNode;
}) {
  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
