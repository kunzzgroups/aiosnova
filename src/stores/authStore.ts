import { create } from 'zustand'
import type { AuthUser } from '@/modules/core/auth/types/auth'

type AuthState = {
  accessToken: string | null
  user: AuthUser | null
  mfaTicket: string | null
  isHydrated: boolean
  setSession: (accessToken: string, user: AuthUser) => void
  setMfaTicket: (mfaTicket: string | null) => void
  setUser: (user: AuthUser) => void
  clearSession: () => void
  setHydrated: (isHydrated: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  mfaTicket: null,
  isHydrated: false,
  setSession: (accessToken, user) =>
    set({
      accessToken,
      user,
      mfaTicket: null,
    }),
  setMfaTicket: (mfaTicket) => set({ mfaTicket }),
  setUser: (user) => set({ user }),
  clearSession: () =>
    set({
      accessToken: null,
      user: null,
      mfaTicket: null,
    }),
  setHydrated: (isHydrated) => set({ isHydrated }),
}))
