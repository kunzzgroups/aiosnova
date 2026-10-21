import { useEffect, useMemo, useRef, useState } from 'react'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import type { AiTool } from '../types/tools'
import { toolUsageSeries } from '../services/toolUsageSeries'
import { usageToday } from '../services/usageService'
import { compactUsage, usageDate } from './UsageTrend'

export function ToolUsage({ usage }: { usage: AiTool['usage'] }) {
  const [period, setPeriod] = useState('30')
  const [size,setSize]=useState({width:600,height:160})
  const chartRef=useRef<HTMLDivElement>(null)
  const [inspected,setInspected]=useState<number|null>(null)
  const today=usageToday()
  const {points,hasData}=useMemo(()=>toolUsageSeries(usage?.points??[],Number(period),today),[usage?.points,period,today])
  useEffect(()=>setInspected(null),[usage,period])
  useEffect(()=>{
    const chart=chartRef.current
    if(!chart)return
    const measure=()=>{
      const width=Math.max(1,chart.clientWidth),height=Math.max(1,chart.clientHeight)
      setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height})
    }
    const observer=new ResizeObserver(measure)
    observer.observe(chart);measure()
    return()=>observer.disconnect()
  },[hasData])
  const requests=points.reduce((sum,point)=>sum+point.requests,0)
  const errors=points.reduce((sum,point)=>sum+point.errors,0)
  const activeDays=points.filter(point=>point.requests>0).length
  const peak=points.reduce((best,point)=>point.requests>best.requests?point:best,points[0])
  const latency=requests?Math.round(points.reduce((sum,point)=>sum+point.latencyMs*point.requests,0)/requests):null
  const {width,height}=size,left=52,right=14,top=14,bottom=28
  const maximum=Math.max(2,Math.ceil(Math.max(0,...points.map(point=>point.requests))*1.15/2)*2)
  const stepWidth=Math.max(1,width-left-right)/Math.max(1,points.length-1)
  const x=(index:number)=>left+index*stepWidth
  const y=(value:number)=>height-bottom-value/maximum*Math.max(1,height-top-bottom)
  const linePoints=points.map((point,index)=>`${x(index)},${y(point.requests)}`).join(' ')
  const areaPath=`M ${x(0)},${y(0)} L ${linePoints} L ${x(points.length-1)},${y(0)} Z`
  const ticks=width<380?[0,points.length-1]:[0,Math.floor((points.length-1)/2),points.length-1]
  const current=inspected===null?null:points[inspected]
  return <section className="console-panel ai-tool-usage-card" data-has-usage={hasData}>
    <header className="ai-tool-card-header"><h2>Usage</h2>{usage?.sample?<small>Sample data</small>:null}<SidebarSelect menuPortal id="tool-usage-period" label="Usage period" hideLabel value={period} options={[{value:'30',label:'Last 30 days'},{value:'7',label:'Last 7 days'}]} onChange={value=>{setPeriod(value);setInspected(null)}}/></header>
    {hasData?<div className="ai-tool-usage-body">
      <dl className="ai-tool-usage-metrics"><div><dt>Requests</dt><dd>{requests.toLocaleString()}</dd></div><div><dt>Success rate</dt><dd>{requests?((requests-errors)/requests*100).toFixed(2)+'%':'No requests'}</dd></div><div><dt>Avg latency</dt><dd>{latency===null?'No requests':latency+' ms'}</dd></div><div><dt>Errors</dt><dd>{errors}</dd></div></dl>
      <div className="ai-tool-chart-caption"><span>Daily requests</span><span aria-live="polite">{current?usageDate(current.date)+' · '+current.requests.toLocaleString()+' requests':'Historical usage'}</span></div>
      <div className="ai-tool-usage-chart" ref={chartRef}>
        <svg viewBox={`0 0 ${width} ${height}`} tabIndex={0} role="img" aria-label="Daily tool requests. Use left and right arrow keys to inspect dates."
          onPointerLeave={()=>setInspected(null)}
          onBlur={()=>setInspected(null)}
          onPointerMove={event=>{const bounds=event.currentTarget.getBoundingClientRect();if(!bounds.width)return;const position=(event.clientX-bounds.left)/bounds.width*width;setInspected(Math.max(0,Math.min(points.length-1,Math.round((position-left)/stepWidth))))}}
          onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setInspected(previous=>Math.max(0,Math.min(points.length-1,(previous??(event.key==='ArrowLeft'?points.length:-1))+(event.key==='ArrowRight'?1:-1))))}}}>
          <title>{'Daily tool requests'+(usage?.sample?' (sample data)':'')}</title>
          {[0,maximum/2,maximum].map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="var(--color-border)"/><text x={left-8} y={y(value)+4} textAnchor="end">{compactUsage(value)}</text></g>)}
          <path className="ai-tool-usage-area" d={areaPath} fill="var(--color-brand)" fillOpacity={.09}/>
          <polyline className="ai-tool-usage-line" points={linePoints} fill="none" stroke="var(--color-brand)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          {current&&inspected!==null?<g><line x1={x(inspected)} x2={x(inspected)} y1={top} y2={height-bottom} stroke="var(--color-border)" strokeDasharray="3 3"/><circle cx={x(inspected)} cy={y(current.requests)} r={4} fill="var(--color-brand)" stroke="var(--color-bg)" strokeWidth={1.5}><title>{usageDate(current.date)+': '+current.requests.toLocaleString()+' requests'}</title></circle></g>:null}
          {ticks.map((index,position)=><text key={index} x={x(index)} y={height-6} textAnchor={position===0?'start':index===points.length-1?'end':'middle'}>{usageDate(points[index].date)}</text>)}
        </svg>
      </div>
      <div className="ai-tool-usage-summary"><span>Active days <strong>{activeDays} / {points.length}</strong></span><span>Daily average <strong>{Math.round(requests/points.length).toLocaleString()}</strong></span><span>Peak <strong>{peak.requests.toLocaleString()}</strong> · {usageDate(peak.date)}</span><span>Missing dates = 0 calls</span></div>
    </div>:<div className="ai-tool-usage-empty" role="status"><strong>{usage?.points.length?'No usage in this period':'No executions recorded yet'}</strong><p>{usage?.points.length?'No calls recorded for the selected date range.':'Usage will appear after an agent calls this tool.'}</p></div>}
  </section>
}
