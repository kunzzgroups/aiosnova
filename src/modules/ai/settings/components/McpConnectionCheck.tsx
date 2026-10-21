import { useState } from 'react'
import { MockConnectionControls } from './MockConnectionControls'
import type { MockConnectionOutcome } from '../types/connection'
import type { McpServer } from '../services/mcpService'

export function McpConnectionCheck({server,busy,checking,error,onCheck}:{server:McpServer;busy:boolean;checking:boolean;error?:string;onCheck:(outcome:MockConnectionOutcome)=>void}) {
  const [outcome,setOutcome]=useState<MockConnectionOutcome>('validate')
  const result = server.lastCheck?.outcome === 'validate'
    ? 'Validation recorded · connection status unchanged. No live connection was tested.'
    : server.lastCheck?.outcome === 'success'
      ? 'Mock success · Connected is a simulated result.'
      : server.lastCheck?.outcome === 'failure'
        ? 'Mock failure · Error is a simulated result.'
        : server.lastCheck?.message ?? 'Local demo only. Live MCP transport is not connected.'
  return <section className="ai-mcp-connection-check" aria-label="Simulated connection check" aria-busy={checking}>
    <div className="ai-mcp-connection-check__copy"><div><strong>Connection check</strong><span>Simulated</span></div>
      <small>{server.lastCheck?'Last checked · '+new Date(server.lastCheck.time).toLocaleString():'No simulated check run yet'}</small>
      <p role={error?'alert':'status'} className={error?'ai-mcp-error':undefined}>{error??(checking?'Recording simulated check…':result)}</p>
      {server.status==='not_verified'?<small>Choose Mock success or Mock failure to demonstrate connection states. No live service is contacted.</small>:null}
      {server.status==='disabled'?<small>Enable this connection before testing.</small>:null}
    </div>
    <MockConnectionControls id={'mcp-mock-result-'+server.id} value={outcome} onChange={setOutcome} onCheck={()=>onCheck(outcome)} busy={checking} disabled={busy||server.status==='disabled'}/>
  </section>
}
