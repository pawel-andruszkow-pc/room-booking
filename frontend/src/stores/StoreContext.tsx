import { createContext, useContext, type ReactNode } from 'react';
import { RootStore } from './RootStore';

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ store, children }: { store: RootStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStores(): RootStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStores must be used within <StoreProvider>');
  return store;
}
