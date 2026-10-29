import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { fetchActivityDetail, fetchActivityFilters, fetchActivityPage } from '../services/activityService'
import type { ActivityEvent, ActivityFilterOptions, ActivityPageResult, ActivityQuery } from '../types/activity'

type ReadState<T> = { key: string; data: T | null; error: unknown; status: 'loading' | 'ready' | 'error' }
function useActivityRead<T>(requestKey: string, enabled: boolean, load: (signal: AbortSignal) => Promise<T>) {
  const token = useAuthStore(state => state.accessToken)
  const userId = useAuthStore(state => state.user?.id)
  const [generation, setGeneration] = useState(0)
  const key = JSON.stringify([requestKey, token, userId, generation])
  const [state, setState] = useState<ReadState<T> | null>(null)
  useEffect(() => {
    if (!enabled) return
    let current = true
    const controller = new AbortController()
    setState({ key, data: null, error: null, status: 'loading' })
    load(controller.signal).then(data => {
      if (current && !controller.signal.aborted) setState({ key, data, error: null, status: 'ready' })
    }).catch(error => {
      if (current && !controller.signal.aborted) setState({ key, data: null, error, status: 'error' })
    })
    return () => { current = false; controller.abort() }
    // The key describes every request parameter and auth identity. A result from
    // any other key is hidden immediately, before effect cleanup runs.
  }, [key, enabled])
  const result = enabled && state?.key === key ? state : null
  return {
    data: result?.data ?? null, error: result?.error ?? null,
    status: !enabled ? 'idle' as const : result?.status ?? 'loading' as const,
    retry: () => setGeneration(value => value + 1),
  }
}
export function useActivityPage(query: ActivityQuery) {
  return useActivityRead<ActivityPageResult>(JSON.stringify(query), Boolean(query.companyId), signal => fetchActivityPage(query, signal))
}
export function useActivityFilters(companyId: string) {
  return useActivityRead<ActivityFilterOptions>('filters:' + companyId, Boolean(companyId), signal => fetchActivityFilters(companyId, signal))
}
export function useActivityDetail(companyId: string, id: string) {
  return useActivityRead<ActivityEvent>('detail:' + JSON.stringify([companyId, id]), Boolean(companyId && id), signal => fetchActivityDetail(companyId, id, signal))
}
