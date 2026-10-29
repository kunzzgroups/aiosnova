export type ToolStatus = 'active' | 'disabled' | 'error'
export type ToolRisk = 'low' | 'medium' | 'high'
export const TOOL_MODULES = ['Retrieval', 'Utility', 'Data', 'Communication', 'Files'] as const
export type ToolModule = typeof TOOL_MODULES[number]
export type ToolActivity = { id: string; time: string; message: string; status: 'success' | 'error' | 'info' }
export type ToolUsagePoint = { date: string; requests: number; errors: number; latencyMs: number }
export type AiTool = {
  id: string; companyId: string; name: string; description: string; module: ToolModule
  action: string; risk: ToolRisk; status: ToolStatus; timeoutSeconds: number
  requiresConfirmation: boolean; configuration: Record<string, unknown>
  agents: string[]; activity: ToolActivity[]; updatedAt: string
  usage?: { sample?: boolean; points: ToolUsagePoint[] }
  previousActions?: { action: string; name: string; changedAt: string; configuration: Record<string, unknown>; usage?: { sample?: boolean; points: ToolUsagePoint[] } }[]
  agentIds?: string[]
  version?: number
  executorType?: string
  executionSupport?: ToolExecutionSupport
  executionSupportReason?: string
}
export type SaveToolPayload = Pick<AiTool, 'name' | 'description' | 'module' | 'action' | 'risk' | 'timeoutSeconds' | 'requiresConfirmation' | 'configuration'> & { enabled: boolean }
export type ToolExecutionSupport =
  | 'supported'
  | 'not_implemented'
  | 'unsupported_configuration'
