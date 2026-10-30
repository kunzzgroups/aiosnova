import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Popover } from '@/components/ui/Popover'
import { SettingsDrawer as Drawer } from './SettingsDrawer'
import { IconArrowLeft, IconInfo, IconPencil, IconPower, IconSpark, IconTrash } from '@/components/icons/Icons'
import { ToolRisk, ToolStatus, type ToolAction } from './ToolControls'
import { ToolUsage } from './ToolUsage'
import { ToolAgentsDrawer } from './ToolAgentsDrawer'
import { displayConfigurationValue, toolConfigurationFields } from '../services/toolConfiguration'
import { TOOL_TYPES } from '../services/toolTypes'
import type { AiTool, ToolActivity } from '../types/tools'
import './ToolConfiguration.css'

type Props = { tool: AiTool; onEdit: () => void; onAction: (action: ToolAction) => void; onSaved: (tool: AiTool) => void }

function ActivityList({ items }: { items: ToolActivity[] }) {
  return <ul className="ai-settings-tool-list">{items.map(item => <li key={item.id}>
    <span className={`ai-settings-health-dot ai-settings-tool-event--${item.status}`} aria-hidden="true" />
    <div><span>{item.message}</span><time dateTime={item.time}>{new Date(item.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
  </li>)}</ul>
}

export function ToolOverview({ tool, onEdit, onAction, onSaved }: Props) {
  const { t } = useTranslation()
  const support = tool.executionSupport ?? 'unknown'
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const configurationFields = toolConfigurationFields(tool.action).filter(field => tool.configuration[field.key] !== undefined)
  const hasConfiguration = Object.keys(tool.configuration).length > 0
  const typeLabel = TOOL_TYPES.find(type => type.action === tool.action)?.label ?? 'Custom tool'
  return <>
    <header className="ai-tool-identity">
      <Link to="/ai/ai/ai-settings/tools" className="ai-tool-back"><IconArrowLeft /><span>Tools</span></Link>
      <span className="ai-tool-identity-icon" aria-hidden="true"><IconSpark /></span>
      <div className="ai-tool-identity-copy">
        <div className="ai-tool-name"><h2 title={tool.name}>{tool.name}</h2><Popover label={`Information about ${tool.name}`} trigger={<IconInfo />}>
          <dl className="ai-tool-information"><div><dt>Module</dt><dd>{tool.module}</dd></div><div><dt>Action</dt><dd><code>{tool.action}</code></dd></div><div><dt>Risk</dt><dd><ToolRisk risk={tool.risk} /></dd></div><div><dt>Updated</dt><dd>{tool.updatedAt && Number.isFinite(Date.parse(tool.updatedAt))
            ? new Date(tool.updatedAt).toLocaleString()
            : '—'}</dd></div></dl>
        </Popover></div>
        <div className="ai-tool-identity-meta"><span>{tool.module}</span><span aria-hidden="true">·</span><code>{tool.action}</code><ToolRisk risk={tool.risk} /></div>
      </div>
      <div className="ai-tool-identity-actions"><ToolStatus status={tool.status} />{tool.status === 'disabled' ? <IconButton label="Delete tool" variant="danger" disabled={tool.agents.length > 0} title={tool.agents.length ? 'Remove agent assignments before deleting.' : undefined} onClick={() => onAction({ tool, kind: 'delete' })}><IconTrash /></IconButton> : <IconButton label="Edit tool" onClick={onEdit}><IconPencil /></IconButton>}<IconButton label={tool.status === 'disabled' ? 'Enable tool' : 'Disable tool'} onClick={() => onAction({ tool, kind: 'toggle' })}><IconPower /></IconButton></div>
    </header>
    <div className={`ai-tool-overview-content${!hasConfiguration && tool.status !== 'error' ? ' ai-tool-overview-content--simple' : ''}`}>
      <div className="ai-settings-tool-detail-grid">
        <section className="console-panel ai-tool-config-card">
          <header className="ai-tool-card-header"><h2>Configuration</h2></header>
          <div className="ai-tool-card-body">
            <dl className="ai-tool-config-summary"><div><dt>Timeout</dt><dd>{tool.timeoutSeconds} seconds</dd></div><div><dt>Confirmation</dt><dd>{tool.requiresConfirmation ? 'Required' : 'Not required'}</dd></div><div><dt>{t('ai.tools.executionSupport.label')}</dt><dd className="ai-tool-support-value">{t(`ai.tools.executionSupport.${support}`)}<Popover label={t('ai.tools.executionSupport.label')} trigger={<IconInfo />}>
              <p>{t(`ai.tools.executionSupport.${support}Description`)}</p>
            </Popover></dd></div></dl>
            {configurationFields.length ? <><div className="ai-tool-advanced-heading"><h3>{typeLabel} settings</h3></div><dl className="ai-tool-parameters">{configurationFields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{displayConfigurationValue(field, tool.configuration[field.key])}</dd></div>)}</dl></> : null}
            {hasConfiguration ? <details className="ai-tool-json-details"><summary>Advanced JSON</summary><pre className="ai-tool-json-preview">{JSON.stringify(tool.configuration, null, 2)}</pre></details> : null}
            {tool.status === 'error' ? <p role="status" className="ai-settings-tool-error">This tool has an error. Review its configuration; saving alone does not confirm recovery.</p> : null}
          </div>
        </section>
        <div className="ai-settings-tool-detail-rail">
          <section className="console-panel ai-tool-agents-card">
            <header className="ai-tool-card-header"><h2>Assigned Agents</h2><Button variant="secondary" onClick={() => setAgentsOpen(true)}>Manage agents</Button></header>
            <div className="ai-tool-card-body">{tool.agents.length ? <ul className="ai-settings-tool-agents">{tool.agents.map(name => <li key={name}><span className="ai-settings-provider-mark" aria-hidden="true">{name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span><div><strong title={name}>{name}</strong></div></li>)}</ul> : <p className="console-table__muted">No agents assigned.</p>}</div>
          </section>
          <section className="console-panel ai-tool-activity-card">
            <header className="ai-tool-card-header"><h2>Recent Activity</h2><Button variant="secondary" onClick={() => setRecentOpen(true)}>View recent</Button></header>
            <div className="ai-tool-card-body">{tool.activity.length ? <ActivityList items={tool.activity.slice(0, 5)} /> : <p className="console-table__muted">No activity recorded yet.</p>}</div>
          </section>
        </div>
      </div>
      <ToolUsage usage={tool.usage} />
    </div>
    {agentsOpen ? <ToolAgentsDrawer tool={tool} onClose={() => setAgentsOpen(false)} onSaved={saved => { onSaved(saved); setAgentsOpen(false) }} /> : null}
    <Drawer open={recentOpen} title="Recent Activity" closeLabel="Close recent activity" onClose={() => setRecentOpen(false)}><div className="ai-tool-all-activity">{tool.activity.length ? <ActivityList items={tool.activity} /> : <p>No activity recorded yet.</p>}
      {tool.previousActions?.length ? <section aria-label="Previous actions"><h3>Previous actions</h3><p className="console-table__muted">Archived usage belongs to the Action shown here, not the current Action.</p>{tool.previousActions.map((revision, index) => <details className="ai-tool-json-details" key={`${revision.changedAt}-${index}`}><summary>{revision.name} · {revision.action}</summary><p className="console-table__muted">Archived {new Date(revision.changedAt).toLocaleString()}</p><pre className="ai-tool-json-preview">{JSON.stringify({ configuration: revision.configuration, usage: revision.usage ?? { points: [] } }, null, 2)}</pre></details>)}</section> : null}
    </div></Drawer>
  </>
}
