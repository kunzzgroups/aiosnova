import { useEffect, useRef, useState } from 'react'
import { IconChevron } from '@/components/navigation/SidebarIcons'
import { IconCircleCheck, IconX } from '@/components/icons/Icons'
import { TextField } from './TextField'
import { IconButton } from './IconButton'
import type { SelectFieldProps } from './SelectField'
import './SearchableSelectField.css'

type Option=SelectFieldProps['options'][number]
type Row={ option:Option; depth:number; group?:string; children:boolean }

export function SearchableSelectField({ id,label,value,options,disabled,onChange,picker }:SelectFieldProps) {
  const [open,setOpen]=useState(false)
  const [search,setSearch]=useState('')
  const [expanded,setExpanded]=useState<Set<string>>(new Set())
  const [bounds,setBounds]=useState({ left:0,top:0,width:0,height:320,up:false })
  const root=useRef<HTMLDivElement>(null)
  const popup=useRef<HTMLDivElement>(null)
  const trigger=useRef<HTMLButtonElement>(null)
  const input=useRef<HTMLInputElement | null>(null)
  const list=useRef<HTMLDivElement>(null)
  const query=search.trim().toLocaleLowerCase()
  const tree=Boolean(picker?.tree)
  const none=options.find(option=>option.value==='')
  const entries=options.filter(option=>option.value!=='')
  const byValue=new Map(entries.map(option=>[option.value,option]))
  const included=new Set<string>()
  for(const option of entries) if(!query||option.label.toLocaleLowerCase().includes(query)||(option.groups||[]).some(group=>group.toLocaleLowerCase().includes(query))) {
    included.add(option.value)
    let parent=option.parentValue
    const visited=new Set<string>()
    while(parent&&!visited.has(parent)) { visited.add(parent);included.add(parent);parent=byValue.get(parent)?.parentValue }
  }
  const rows:Row[]=[]
  if(tree) {
    const visited=new Set<string>()
    function append(option:Option,depth:number) {
      if(visited.has(option.value)||!included.has(option.value)) return
      visited.add(option.value)
      const children=entries.filter(child=>child.parentValue===option.value)
      rows.push({ option,depth,children:children.length>0 })
      if(query||expanded.has(option.value)) children.forEach(child=>append(child,depth+1))
    }
    entries.filter(option=>!option.parentValue||!byValue.has(option.parentValue)).forEach(option=>append(option,0))
  } else {
    const groups=new Map<string,Option[]>()
    for(const option of entries) for(const group of option.groups||['']) {
      if(query&&!option.label.toLocaleLowerCase().includes(query)&&!group.toLocaleLowerCase().includes(query)) continue
      groups.set(group,[...(groups.get(group)||[]),option])
    }
    for(const [group,items] of groups) for(const option of items) rows.push({ option,depth:0,children:false,group })
  }

  function close(restore=false) { setOpen(false);if(restore) trigger.current?.focus() }
  function toggle(option:Option) { setExpanded(current=>{const next=new Set(current);if(next.has(option.value)) next.delete(option.value);else next.add(option.value);return next}) }
  function choose(option:Option) { if(!option.disabled){onChange(option.value);close(true)} }
  function focusRows() { return Array.from(list.current?.querySelectorAll<HTMLElement>('[data-picker-row]:not([aria-disabled="true"])')||[]) }

  useEffect(()=>{
    if(!open) return
    setSearch('')
    setExpanded(current=>{
      const next=new Set(current);let parent=options.find(option=>option.value===value)?.parentValue
      while(parent&&!next.has(parent)){next.add(parent);parent=options.find(option=>option.value===parent)?.parentValue}
      return next
    })
    popup.current?.showPopover()
    function position() {
      const rect=trigger.current?.getBoundingClientRect();if(!rect) return
      const viewport=window.visualViewport
      const bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)
      const right=(viewport?.offsetLeft||0)+(viewport?.width||window.innerWidth)
      const below=bottom-rect.bottom-16,above=rect.top-(viewport?.offsetTop||0)-16
      const down=below>=Math.min(320,above)
      const height=Math.max(0,Math.min(320,down?below:above))
      const width=Math.min(rect.width,right-16)
      setBounds({left:Math.max(8,Math.min(rect.left,right-width-8)),top:down?rect.bottom+8:rect.top-8,width,height,up:!down})
    }
    position();input.current?.focus()
    function outside(event:PointerEvent) { if(!root.current?.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown',outside)
    window.addEventListener('resize',position)
    window.addEventListener('scroll',position,true)
    window.visualViewport?.addEventListener('resize',position)
    return ()=>{popup.current?.hidePopover();document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.visualViewport?.removeEventListener('resize',position)}
  },[open])
  useEffect(()=>{if(disabled) setOpen(false)},[disabled])

  function renderRow(row:Row,index:number) {
    const { option,depth,children }=row,selected=option.value===value,isExpanded=Boolean(query)||expanded.has(option.value)
    return <div key={option.value+'-'+index} className="ui-picker__row" role={tree?'treeitem':'option'} aria-label={!tree&&row.group ? option.label+' — '+row.group : option.label} aria-level={tree?depth+1:undefined} aria-expanded={tree&&children?isExpanded:undefined} aria-selected={selected} aria-disabled={option.disabled||undefined} tabIndex={selected?0:-1} data-picker-row data-value={option.value} style={{paddingLeft:12+depth*18}} onClick={()=>choose(option)} onKeyDown={event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(option)}
      if(tree&&event.key==='ArrowRight'){event.preventDefault();if(children&&!isExpanded) toggle(option);else if(children){const items=focusRows();items[items.indexOf(event.currentTarget)+1]?.focus()}}
      if(tree&&event.key==='ArrowLeft'){event.preventDefault();if(children&&isExpanded&&!query) toggle(option);else focusRows().find(item=>item.dataset.value===option.parentValue)?.focus()}
    }}>
      {tree ? children ? <button type="button" className="ui-picker__expand" tabIndex={-1} aria-label={(isExpanded?picker!.collapseLabel:picker!.expandLabel)+' '+option.label} aria-expanded={isExpanded} onClick={event=>{event.stopPropagation();if(!query) toggle(option);event.currentTarget.closest<HTMLElement>('[data-picker-row]')?.focus()}}><IconChevron style={{transform:isExpanded?'rotate(90deg)':undefined}} aria-hidden="true" /></button> : <span className="ui-picker__spacer" /> : null}
      <span className="ui-picker__copy"><span>{option.label}</span>{!tree&&row.group?<small>{row.group}</small>:null}</span>{selected?<IconCircleCheck className="ui-picker__check" aria-hidden="true" />:null}
    </div>
  }

  return <div className="ui-select-field" ref={root}>
    <button type="button" id={id} ref={trigger} className="ui-select-field__trigger" aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={id+'-picker'} disabled={disabled} onClick={()=>setOpen(current=>!current)} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true)}}}><span>{options.find(option=>option.value===value)?.label||value}</span><IconChevron aria-hidden="true" /></button>
    {open?<div ref={popup} id={id+'-picker'} popover="manual" role="dialog" aria-label={label} className="ui-picker" style={{left:bounds.left,top:bounds.top,width:bounds.width,maxHeight:bounds.height,transform:bounds.up?'translateY(-100%)':undefined}} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}
      else if(event.key==='Tab'&&((!event.shiftKey&&(event.target as HTMLElement).hasAttribute('data-picker-row'))||(event.shiftKey&&event.target===input.current))){trigger.current?.focus();close()}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&event.target!==input.current){event.preventDefault();const items=focusRows(),index=items.indexOf(document.activeElement as HTMLElement);const next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowDown'?1:-1)));items[next]?.focus()}
    }}>
      <div className="ui-picker__search" ref={node=>{input.current=node?.querySelector('input')||null}}><TextField value={search} aria-label={picker!.searchLabel} placeholder={picker!.searchLabel} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();focusRows()[0]?.focus()}}} /><IconButton variant="ghost" label={picker!.clearLabel} disabled={!search} onClick={()=>{setSearch('');input.current?.focus()}}><IconX aria-hidden="true" /></IconButton></div>
      <div className="ui-picker__results" ref={list} role={tree?'tree':'listbox'} aria-label={label}>
        {none?<div className="ui-picker__none" role="presentation">{renderRow({option:none,depth:0,children:false},-1)}</div>:null}
        {rows.map((row,index)=><div key={row.option.value+'-'+index} role="presentation">{!tree&&!picker?.hideGroupHeadings&&row.group&&row.group!==rows[index-1]?.group?<div className="ui-picker__group" role="presentation">{row.group}</div>:null}{renderRow(row,index)}</div>)}
        {!rows.length?<p className="ui-picker__empty" role="status">{picker!.emptyLabel}</p>:null}
      </div>
    </div>:null}
  </div>
}
