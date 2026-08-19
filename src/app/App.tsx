import { AppRouter } from '@/routes/router'
import { ToastHost } from '@/components/ui/Toast'

export function App() {
  return (
    <>
      <AppRouter />
      <ToastHost />
    </>
  )
}
