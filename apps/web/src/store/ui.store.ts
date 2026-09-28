import { create } from 'zustand'

interface UiStore {
  activeDealId: string | null
  setActiveDeal: (id: string | null) => void
  sidebarOpen: boolean
  toggleSidebar: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  activeDealId: null,
  setActiveDeal: (id) => set({ activeDealId: id }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
