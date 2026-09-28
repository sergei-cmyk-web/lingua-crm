import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Все "сущности", которые демо-мутации могут создавать/патчить/удалять. Не обязаны совпадать
// 1:1 с моделями Prisma — это ключи внутреннего оверлея, выбранные под то, как их читают
// GET-эндпоинты (см. merge.ts).
export type EntityType =
  | 'deal' | 'contact' | 'company' | 'task' | 'field' | 'package' | 'lostReason'
  | 'automation' | 'pipeline' | 'stage' | 'emailAccount' | 'subscription' | 'lesson'
  | 'message' | 'trial' | 'payment' | 'contactPhone' | 'contactEmail'

interface OverlayData {
  created: Partial<Record<EntityType, any[]>>
  patches: Record<string, Record<string, unknown>> // key: `${entityType}:${id}`
  deletedIds: Record<string, true> // key: `${entityType}:${id}`
}

interface OverlayStore extends OverlayData {
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  addCreated: (entityType: EntityType, obj: { id: string }) => void
  addPatch: (entityType: EntityType, id: string, patch: Record<string, unknown>) => void
  markDeleted: (entityType: EntityType, id: string) => void
  unmarkDeleted: (entityType: EntityType, id: string) => void
  resetOverlay: () => void
}

const emptyData: OverlayData = { created: {}, patches: {}, deletedIds: {} }

export const patchKey = (entityType: EntityType, id: string) => `${entityType}:${id}`

export const useDemoOverlayStore = create<OverlayStore>()(
  persist(
    (set) => ({
      ...emptyData,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      addCreated: (entityType, obj) =>
        set((s) => ({
          created: { ...s.created, [entityType]: [...(s.created[entityType] ?? []), obj] },
        })),

      addPatch: (entityType, id, patch) =>
        set((s) => {
          const key = patchKey(entityType, id)
          return { patches: { ...s.patches, [key]: { ...(s.patches[key] ?? {}), ...patch } } }
        }),

      markDeleted: (entityType, id) =>
        set((s) => ({ deletedIds: { ...s.deletedIds, [patchKey(entityType, id)]: true } })),

      unmarkDeleted: (entityType, id) =>
        set((s) => {
          const next = { ...s.deletedIds }
          delete next[patchKey(entityType, id)]
          return { deletedIds: next }
        }),

      resetOverlay: () => set({ ...emptyData }),
    }),
    {
      name: 'crm-demo-overlay',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
