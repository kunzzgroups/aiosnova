import { create } from 'zustand'
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
   * a preview surface for that panel, so it renders only while this is true.
   * Session state only - deliberately not persisted.
   */
  panelOpen: boolean
  /**
   * True while the pointer is over the top company strip. The strip sits outside
   * the sidebar, so without this flag the panel's hover grace timer would collapse
   * the strip before the pointer ever reaches it. Can only be true while
   * `panelOpen` is true - see `setPanelOpen`.
   */
  stripHovered: boolean
  /**
   * Group the user *selected* (clicked) in the GROUP COMPANIES panel. This is
   * what keeps the top company strip on screen after the panel itself closes:
   * hovering is only a preview, selecting is a decision. `null` means "nothing
   * selected yet", and the strip then exists only while the panel is open.
   * Session state only - deliberately not persisted.
   */
  pinnedGroupId: string | null
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
  stripHovered: false,
  pinnedGroupId: null,
  setData: (companies, groups) => {
    const current = get().companyId
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
    set({ companies, groups, companyId: next })
  },
  setCompany: (companyId) => {
    try {
      window.localStorage.setItem(COMPANY_STORAGE_KEY, companyId)
    } catch {
      /* storage unavailable - keep the in-memory value */
    }
    set({ companyId })
  },
  setPreviewCompany: (previewCompanyId) => {
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
