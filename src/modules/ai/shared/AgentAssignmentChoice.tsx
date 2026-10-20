import './AgentAssignmentChoice.css'

export function AgentAssignmentChoice({ name, checked, disabled, onChange }: { name: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return <label className={`knowledge-agent-choice${checked ? ' is-selected' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
    <span className="knowledge-agent-choice__avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
    <span className="knowledge-agent-choice__body"><strong title={name}>{name}</strong></span>
  </label>
}
