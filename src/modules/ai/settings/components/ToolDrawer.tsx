import { useRef, useState, type FormEvent } from 'react'
import { SettingsEditor, SettingsEditorSection } from './SettingsEditor'
import { IconSettings, IconShieldCheck, IconSpark } from '@/components/icons/Icons'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { saveTool } from '../services/toolsService'
import { TOOL_TYPES, toolTypeDescription } from '../services/toolTypes'
import { configurationDrafts, defaultToolConfiguration, parseToolConfiguration, setConfigurationField, toolConfigurationFields, validateToolConfiguration, type ToolConfigurationField } from '../services/toolConfiguration'
import { TOOL_MODULES, type AiTool, type ToolModule, type ToolRisk } from '../types/tools'
import './ToolConfiguration.css'

type Props = { companyId: string; tool: AiTool | null; onClose: () => void; onSaved: (tool: AiTool) => void }
export function ToolDrawer({ companyId, tool, onClose, onSaved }: Props) {
  return <ToolEditor key={companyId+':'+(tool?.id??'new')} companyId={companyId} tool={tool} onClose={onClose} onSaved={onSaved}/>
}
function ToolEditor({ companyId, tool, onClose, onSaved }: Props) {
  const [name, setName] = useState(tool?.name ?? '')
  const [description, setDescription] = useState(tool?.description ?? '')
  const [module, setModule] = useState<ToolModule>(tool?.module ?? 'Utility')
  const [action, setAction] = useState(tool?.action ?? '')
  const [toolType, setToolType] = useState(tool ? TOOL_TYPES.find(type => type.action === tool.action)?.action ?? 'custom' : '')
  const lastSuggestedName = useRef('')
  const [risk, setRisk] = useState<ToolRisk>(tool?.risk ?? 'low')
  const [enabled, setEnabled] = useState(tool ? tool.status !== 'disabled' : false)
  const [timeout, setTimeoutValue] = useState(String(tool?.timeoutSeconds ?? 30))
  const [confirmation, setConfirmation] = useState(tool?.requiresConfirmation ?? false)
  const [configuration, setConfiguration] = useState(JSON.stringify({...defaultToolConfiguration(tool?.action??''),...tool?.configuration}, null, 2))
  const [fieldDrafts,setFieldDrafts]=useState(()=>configurationDrafts(tool?.action??'',{...defaultToolConfiguration(tool?.action??''),...tool?.configuration}))
  const typeDrafts=useRef(new Map<string,{action:string;raw:string;fields:Record<string,string>;module:ToolModule;risk:ToolRisk;timeout:string;confirmation:boolean;advanced:boolean}>())
  const fields=toolConfigurationFields(action)
  const parsedConfiguration=parseToolConfiguration(configuration)
  const fieldErrors=parsedConfiguration?validateToolConfiguration(action,parsedConfiguration):{}
  function changeAction(value:string){
    setAction(value);setError(null)
    if(parsedConfiguration)setFieldDrafts(configurationDrafts(value,parsedConfiguration))
  }
  function changeRaw(value:string){
    setConfiguration(value)
    setError(null)
    const parsed=parseToolConfiguration(value)
    if(parsed)setFieldDrafts(configurationDrafts(action,parsed))
  }
  function changeType(value: string) {
    if(value===toolType)return
    typeDrafts.current.set(toolType,{action,raw:configuration,fields:fieldDrafts,module,risk,timeout,confirmation,advanced})
    const type = TOOL_TYPES.find(item => item.action === value)
    const draft=typeDrafts.current.get(value)
    const nextAction=draft?.action??type?.action??''
    const nextConfiguration=defaultToolConfiguration(nextAction)
    setToolType(value)
    setAction(nextAction);setOpenSelect(null);setError(null)
    setConfiguration(draft?.raw??JSON.stringify(nextConfiguration,null,2))
    setFieldDrafts(draft?.fields??configurationDrafts(nextAction,nextConfiguration))
    setModule(draft?.module??type?.module ?? 'Utility')
    setRisk(draft?.risk??type?.risk ?? 'low')
    setTimeoutValue(draft?.timeout??String(tool?.timeoutSeconds??30))
    setConfirmation(draft?.confirmation??false)
    setAdvanced(draft?.advanced??false)
    if (!name.trim() || name === lastSuggestedName.current) setName(type?.label ?? '')
    lastSuggestedName.current = type?.label ?? ''
  }
  function changeField(field:ToolConfigurationField,value:string){
    if(!parsedConfiguration)return
    setFieldDrafts(previous=>({...previous,[field.key]:value}))
    setConfiguration(JSON.stringify(setConfigurationField({...defaultToolConfiguration(action),...parsedConfiguration},field,value),null,2))
    setError(null)
  }
  const [openSelect, setOpenSelect] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const selectState = (id: string) => ({ open: openSelect === id, onOpenChange: (open: boolean) => setOpenSelect(open ? id : null), hideLabel: true, className: 'console-form-select--down', disabled: busy })
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!toolType) { setError('Choose a tool type.'); return }
    setError(null)
    let parsed: unknown
    try { parsed = JSON.parse(configuration) } catch { setAdvanced(true); setError('Configuration must contain valid JSON.'); return }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { setAdvanced(true); setError('Configuration must be a JSON object.'); return }
    parsed={...defaultToolConfiguration(action),...parsed as Record<string,unknown>}
    const validation=validateToolConfiguration(action,parsed as Record<string,unknown>)
    if(Object.keys(validation).length){setError(Object.values(validation)[0]);return}
    setBusy(true)
    try {
      const saved = await saveTool(companyId, { name, description, module, action, risk, enabled, timeoutSeconds: Number(timeout), requiresConfirmation: risk === 'high' || confirmation, configuration: parsed as Record<string, unknown> }, tool?.id)
      onSaved(saved)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save tool.') }
    finally { setBusy(false) }
  }
  return <SettingsEditor open title={tool ? 'Edit Tool' : 'Add Tool'} description="Configure an action available to your agents." busy={busy} onClose={onClose} closeLabel="Close" footer={<><Button type="submit" form="ai-tool-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button></>}>
    <form id="ai-tool-form" className="ai-settings-form ai-settings-tool-form" onSubmit={event => void submit(event)} onKeyDownCapture={event => { if (event.key === 'Escape' && openSelect) { event.preventDefault(); event.stopPropagation(); setOpenSelect(null) } }}>
      <SettingsEditorSection title="Basic Information" icon={<IconSpark />}>
        <FormField label="Tool type" htmlFor="tool-type" hint="The same type can be used for multiple tools. Give each tool a descriptive name and its own configuration."><SidebarSelect menuPortal id="tool-type" label="Tool type" value={toolType} options={[{value:'',label:'Select tool type'},...TOOL_TYPES.map(type=>({value:type.action,label:type.label})),{value:'custom',label:'Custom tool'}]} onChange={changeType} {...selectState('type')} /></FormField>
        <FormField label="Tool Name" htmlFor="tool-name"><TextField id="tool-name" value={name} onChange={event => setName(event.target.value)} disabled={busy} required /></FormField>
        <FormField label="Description" htmlFor="tool-description"><TextField id="tool-description" value={description} onChange={event => setDescription(event.target.value)} disabled={busy} /></FormField>
      </SettingsEditorSection>
      <SettingsEditorSection title="Tool Configuration" icon={<IconSettings />}>
        <div className="ai-settings-editor-row">
        <FormField label="Module" htmlFor="tool-module"><SidebarSelect menuPortal id="tool-module" label="Module" value={module} options={[...TOOL_MODULES]} onChange={value => setModule(value as ToolModule)} {...selectState('module')} /></FormField>
        <FormField label="Risk" htmlFor="tool-risk"><SidebarSelect menuPortal id="tool-risk" label="Risk" value={risk} options={[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'}]} onChange={value => setRisk(value as ToolRisk)} {...selectState('risk')} /></FormField>
        </div>
        <FormField label="Action" htmlFor="tool-action" hint={toolType==='custom'?'Enter the action supported by your custom integration, for example custom.run.':'Set by the selected tool type.'}><TextField id="tool-action" value={action} onChange={event => changeAction(event.target.value)} readOnly={toolType!=='custom'} disabled={busy} required placeholder={toolType==='custom'?'custom.run':''} /></FormField>
        {toolType?<p className="console-table__muted">{toolType==='custom'?'Use the action identifier and JSON required by your custom integration.':toolTypeDescription(action)}</p>:null}
        {tool && tool.action !== action.trim() ? <p role="status" className="console-table__muted">Changing Action archives the previous configuration and usage in Recent Activity. Usage starts fresh for this Action. Assigned agents stay assigned; review their access after saving.</p> : null}
        {fields.length?<div className="ai-tool-action-settings"><h4>Action settings</h4>
          {!parsedConfiguration?<p role="status" className="ai-settings-tool-error">Fix the JSON in Advanced to edit these fields.</p>:null}
          {fields.map(field=>{
            const id='tool-config-'+field.key,value=fieldDrafts[field.key]??''
            return <FormField key={field.key} label={field.label} htmlFor={id} error={fieldErrors[field.key]} hint={field.hint}>
              {field.type==='boolean'?<label className="ai-tool-config-toggle"><input id={id} type="checkbox" checked={value==='true'} disabled={busy||!parsedConfiguration} onChange={event=>changeField(field,String(event.target.checked))}/><span>{value==='true'?'Enabled':'Disabled'}</span></label>
              :field.type==='select'?<SidebarSelect menuPortal id={id} label={field.label} options={field.options!} value={value} onChange={value=>changeField(field,value)} {...selectState(id)} disabled={busy||!parsedConfiguration}/>
              :<TextField id={id} type={field.type==='number'?'number':'text'} value={value} min={field.min} max={field.max} step={field.step===1?1:'any'} hasError={!!fieldErrors[field.key]} disabled={busy||!parsedConfiguration} onChange={event=>changeField(field,event.target.value)} aria-describedby={fieldErrors[field.key]?id+'-error':undefined}/>}
            </FormField>
          })}
        </div>:null}
        <details className="ai-settings-editor-advanced" open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)}><summary>Advanced</summary><div>
        <FormField label="Timeout (seconds)" htmlFor="tool-timeout"><TextField id="tool-timeout" type="number" min="1" max="600" step="1" required value={timeout} onChange={event => setTimeoutValue(event.target.value)} onInvalid={()=>setAdvanced(true)} disabled={busy} /></FormField>
        <FormField label="Configuration (JSON)" htmlFor="tool-configuration" hint="Optional overrides and custom fields. Form fields and JSON stay synchronized. Omitted fields use defaults."><textarea id="tool-configuration" className="ui-text-field ai-settings-tool-json" value={configuration} onChange={event => changeRaw(event.target.value)} spellCheck={false} disabled={busy} rows={7} /></FormField>
        </div></details>
      </SettingsEditorSection>
      <SettingsEditorSection title="Execution & Availability" icon={<IconShieldCheck />}>
        <FormField label="Status" htmlFor="tool-status"><SidebarSelect menuPortal id="tool-status" label="Status" value={enabled ? 'active' : 'disabled'} options={[{value:'active',label:'Active'},{value:'disabled',label:'Disabled'}]} onChange={value => setEnabled(value === 'active')} {...selectState('status')} /></FormField>
      <label className="ai-settings-tool-confirmation"><input type="checkbox" checked={risk === 'high' || confirmation} disabled={busy || risk === 'high'} onChange={event => setConfirmation(event.target.checked)} />Require confirmation before execution</label>
      {risk === 'high' ? <p className="console-table__muted">Confirmation is required for high-risk actions.</p> : null}
      </SettingsEditorSection>
      {error ? <p className="ai-settings-tool-error" role="alert">{error}</p> : null}
    </form>
  </SettingsEditor>
}
