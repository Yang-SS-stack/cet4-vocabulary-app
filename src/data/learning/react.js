import { createContext, createElement, useContext, useSyncExternalStore } from 'react'

const LearningStoreContext = createContext(null)

export function LearningStoreProvider({ store, children }) {
  return createElement(LearningStoreContext.Provider, { value: store }, children)
}

export function useLearningStore() {
  const store = useContext(LearningStoreContext)
  if (!store) throw new Error('Learning store is unavailable')
  return { store, snapshot: useSyncExternalStore(store.subscribe, store.getSnapshot) }
}
