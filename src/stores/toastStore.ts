import { create } from 'zustand'

export type ToastVariant = 'success' | 'error'

export type ToastItem = {
  id: string
  variant: ToastVariant
  title: string
  description: string
}

type ToastState = {
  items: ToastItem[]
  push: (item: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

let lastFingerprint = ''
let lastAt = 0

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (item) => {
    const fingerprint = `${item.variant}:${item.title}:${item.description}`
    const now = Date.now()
    if (fingerprint === lastFingerprint && now - lastAt < 600) {
      return
    }
    lastFingerprint = fingerprint
    lastAt = now
    const id = crypto.randomUUID()
    set((state) => ({ items: [...state.items.slice(-2), { ...item, id }] }))
    window.setTimeout(() => {
      get().dismiss(id)
    }, 800)
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}))

function successTitle(description: string) {
  const text = description.toLowerCase()
  if (text.includes('deleted')) {
    return 'Successfully deleted'
  }
  if (text.includes('created') || text.includes('invited')) {
    return 'Successfully created'
  }
  if (text.includes('updated') || text.includes('saved') || text.includes('activated') || text.includes('disabled')) {
    return 'Successfully updated'
  }
  return 'Success'
}

export function notifySuccess(description: string) {
  useToastStore.getState().push({
    variant: 'success',
    title: successTitle(description),
    description,
  })
}

export function notifyError(description: string) {
  useToastStore.getState().push({
    variant: 'error',
    title: 'Something went wrong',
    description,
  })
}
