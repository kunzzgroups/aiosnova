import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { deleteTool, setToolEnabled } from '../services/toolsService'
import type { AiTool } from '../types/tools'
export function ToolStatus({ status }: { status: AiTool['status'] }) {
  return <span className={'console-status console-status--' + status}>{status}</span>
}
export function ToolRisk({ risk }: { risk: AiTool['risk'] }) {
  return <span className={'console-status ai-settings-tool-risk ai-settings-tool-risk--' + risk}>{risk}</span>
}
export type ToolAction = { tool: AiTool; kind: 'toggle' | 'delete' }
export function ToolActionDialog({ action, companyId, onClose, onDone }: { action: ToolAction; companyId: string; onClose: () => void; onDone: (deleted: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleting = action.kind === 'delete'
  const disabling = action.tool.status !== 'disabled'
  const blocked = deleting && (action.tool.status !== 'disabled' || action.tool.agents.length > 0)
  async function confirm() {
    if (busy || blocked) return
    setBusy(true); setError(null)
    try {
      if (deleting) await deleteTool(companyId, action.tool.id)
      else await setToolEnabled(companyId, action.tool, !disabling)
      onDone(deleting)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update tool.') }
    finally { setBusy(false) }
  }
  return <ConfirmDialog open className="ai-settings-delete-dialog" title={(deleting ? 'Delete ' : disabling ? 'Disable ' : 'Enable ') + action.tool.name + '?'} description={deleting ? 'Permanently remove this tool configuration.' : disabling ? 'Assigned agents will no longer be able to call this tool.' : 'Make this tool available to assigned agents.'} warning={blocked ? 'Remove agent assignments and disable this tool before deleting it.' : deleting ? 'This cannot be undone.' : undefined} busy={busy} error={error} confirmDisabled={blocked} confirmLabel={deleting ? 'Delete' : disabling ? 'Disable' : 'Enable'} cancelLabel="Cancel" onConfirm={confirm} onCancel={onClose} />
}
