import { Button } from '@/components/ui/Button'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import type { MockConnectionOutcome } from '../types/connection'
import './MockConnectionControls.css'

export function MockConnectionControls({id,value,onChange,onCheck,busy,disabled}:{id:string;value:MockConnectionOutcome;onChange:(value:MockConnectionOutcome)=>void;onCheck:()=>void;busy:boolean;disabled:boolean}) {
  return <div className="ai-mock-connection-controls">
    <SidebarSelect menuPortal id={id} label="Mock result" hideLabel value={value} options={[{value:'validate',label:'Validate only'},{value:'success',label:'Mock success'},{value:'failure',label:'Mock failure'}]} disabled={busy||disabled} onChange={value=>onChange(value as MockConnectionOutcome)}/>
    <Button variant="secondary" disabled={busy||disabled} onClick={onCheck}>{busy?'Testing…':'Test Connection'}</Button>
  </div>
}
