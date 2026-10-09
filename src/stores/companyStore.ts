import { create } from 'zustand'
import { useAuthStore } from '@/stores/authStore'
import type { CompanyGroupRecord } from '@/mocks/data/identity'

export type CompanyOption = { value: string; label: string }

export const COMPANY_STORAGE_KEY = 'aios.companyId'

type CompanyState = {
  /** Active companies, as returned by the identity service. */
  companies: CompanyOption[]
  /** Company groups (a group has no page of its own, only member companies). */
  groups: CompanyGroupRecord[]
  companyId: string
  /**
   * Company whose group the top bar previews. Set while hovering a row in the
   * sidebar company panel; `null` means "follow the active company". A company
   * that belongs to no group previews as empty, which is the point: the strip
   * must not keep showing the previously previewed group.
   */
  previewCompanyId: string | null
  /**
   * Whether the sidebar GROUP COMPANIES panel is open. The top company strip is
   * a picker for that panel, so it exists only while this is true - the strip
   * must not sit there taking a row when nobody is switching company.
   * Session state only - deliberately not persisted.
   */
  panelOpen: boolean
  /**
   * Group whose companies the strip is holding open after the user clicked that
   * row in the panel. Clicking a level-2 row is a *step*, not a decision: it
   * lifts that group's companies into the strip and keeps them there until one
   * is picked. `null` = no pending choice. Session state only.
   */
  pinnedGroupId: string | null
  /**
   * True while the pointer is over the top company strip. The strip sits outside
   * the sidebar, so without this flag the panel's hover grace timer would
   * collapse the strip before the pointer ever reaches it. Can only be true
   * while `panelOpen` is true - see `setPanelOpen`.
   */
  stripHovered: boolean
  setData: (companies: CompanyOption[], groups: CompanyGroupRecord[]) => void
  setCompany: (companyId: string) => void
  setPreviewCompany: (companyId: string | null) => void
  setPanelOpen: (panelOpen: boolean) => void
  setStripHovered: (stripHovered: boolean) => void
  setPinnedGroup: (groupId: string | null) => void
}

function readStoredCompanyId(): string {
  try {
    return window.localStorage.getItem(COMPANY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Group that contains the given company, if any. */
export function findCompanyGroup(
  groups: CompanyGroupRecord[],
  companyId: string,
): CompanyGroupRecord | null {
  if (!companyId) {
    return null
  }
  return groups.find((group) => group.companyIds.includes(companyId)) ?? null
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  companies: [],
  groups: [],
  companyId: readStoredCompanyId(),
  previewCompanyId: null,
  panelOpen: false,
  pinnedGroupId: null,
  stripHovered: false,
  setData: (companies, groups) => {
    const current = get().companyId || readStoredCompanyId()
    const next =
      current && companies.some((item) => item.value === current)
        ? current
        : companies[0]?.value ?? ''
    if (next && next !== current) {
      try {
        window.localStorage.setItem(COMPANY_STORAGE_KEY, next)
      } catch {
        /* storage unavailable - keep the in-memory value */
      }
    }
    const allowedIds = new Set(companies.map(item => item.value))
    set({ companies, groups: groups.map(group => ({ ...group, companyIds: group.companyIds.filter(id => allowedIds.has(id)) })).filter(group => group.companyIds.length > 0), companyId: next, previewCompanyId: null, pinnedGroupId: null })
  },
  setCompany: (companyId) => {
    if (!get().companies.some(item => item.value === companyId)) return
    try {
      window.localStorage.setItem(COMPANY_STORAGE_KEY, companyId)
    } catch {
      /* storage unavailable - keep the in-memory value */
    }
    set({ companyId })
  },
  setPreviewCompany: (previewCompanyId) => {
    if (previewCompanyId && !get().companies.some(item => item.value === previewCompanyId)) return
    if (get().previewCompanyId !== previewCompanyId) {
      set({ previewCompanyId })
    }
  },
  setPanelOpen: (panelOpen) => {
    if (get().panelOpen === panelOpen) {
      return
    }
    // Closing the panel unmounts the strip, so its hover flag can never fire a
    // mouseleave afterwards - reset it here or the panel would stop auto-hiding.
    set(panelOpen ? { panelOpen } : { panelOpen, stripHovered: false })
  },
  setStripHovered: (stripHovered) => {
    if (get().stripHovered !== stripHovered) {
      set({ stripHovered })
    }
  },
  setPinnedGroup: (pinnedGroupId) => {
    if (get().pinnedGroupId !== pinnedGroupId) {
      set({ pinnedGroupId })
    }
  },
}))

useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.accessToken !== previous.accessToken) {
    useCompanyStore.getState().setData([], [])
  }
})
