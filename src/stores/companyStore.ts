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
  setData: (companies: CompanyOption[], groups: CompanyGroupRecord[]) => void
  setCompany: (companyId: string) => void
  setPreviewCompany: (companyId: string | null) => void
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
}))
