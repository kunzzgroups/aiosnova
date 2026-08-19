import { IconShieldCheck, IconX } from '@/components/icons/Icons'
import { useToastStore, type ToastItem } from '@/stores/toastStore'
import './Toast.css'

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className={`ui-toast ui-toast--${item.variant}`} role="status">
      <div className="ui-toast__badge" aria-hidden>
        {item.variant === 'success' ? <IconShieldCheck /> : <IconX />}
      </div>
      <div className="ui-toast__copy">
        <p className="ui-toast__title">{item.title}</p>
        <p className="ui-toast__description">{item.description}</p>
      </div>
      <button type="button" className="ui-toast__close" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
        <IconX />
      </button>
    </div>
  )
}

export function ToastHost() {
  const items = useToastStore((state) => state.items)

  if (items.length === 0) {
    return null
  }

  return (
    <div className="ui-toast-host">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}
