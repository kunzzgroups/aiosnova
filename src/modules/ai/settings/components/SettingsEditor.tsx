import type { ComponentProps, ReactNode } from 'react'
import { SettingsDrawer as Drawer } from './SettingsDrawer'
import './SettingsEditor.css'

export function SettingsEditor({className='',...props}:ComponentProps<typeof Drawer>) {
  return <Drawer {...props} className={`ai-settings-editor ${className}`} />
}
export function SettingsEditorSection({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}) {
  return <section className="ai-settings-editor-section"><h3>{icon}{title}</h3>{children}</section>
}
