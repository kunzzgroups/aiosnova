import { useEffect } from 'react'
import { notifyError, notifySuccess } from '@/stores/toastStore'

type FlashToastsProps = {
  error?: string | null
  message?: string | null
  onClearError?: () => void
  onClearMessage?: () => void
}

export function FlashToasts({ error, message, onClearError, onClearMessage }: FlashToastsProps) {
  useEffect(() => {
    if (!message) {
      return
    }
    notifySuccess(message)
    onClearMessage?.()
  }, [message, onClearMessage])

  useEffect(() => {
    if (!error) {
      return
    }
    notifyError(error)
    onClearError?.()
  }, [error, onClearError])

  return null
}
