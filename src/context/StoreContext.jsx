import { createContext, useContext } from 'react';
import { useStore } from '../store/useStore';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const store = useStore();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  return useContext(StoreContext);
}
