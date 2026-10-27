// Directory and company adapters still require MSW until their API migration is complete.
export const mockingEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK === 'true'
let ready: Promise<void> | undefined
let starting = false
let lastRequestAt = 0

export function ensureMocking(recover = false): Promise<void> {
  if (!mockingEnabled) return Promise.resolve()
  const now = Date.now()
  const idle = lastRequestAt !== 0 && now - lastRequestAt > 60_000
  lastRequestAt = now
  if (ready && (starting || (!recover && !idle))) return ready

  const previous = ready
  starting = true
  const pending = (async () => {
    await previous
    const { worker } = await import('@/mocks/browser')
    if (previous) worker.stop()
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  })()
  ready = pending
  void pending.then(
    () => { if (ready === pending) starting = false },
    () => { if (ready === pending) { ready = undefined; starting = false } },
  )
  return pending
}
