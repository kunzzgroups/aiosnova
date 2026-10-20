import { fetchSecurityPolicy } from '../services/securityService'
import { fetchUsageRecords, usagePeriod as selectUsagePeriod, usageTotals, usageDaily, type UsageRecord } from '../services/usageService'
import { usageMoney, usageDate } from '../components/UsageTrend'
import { fetchTools } from '../services/toolsService'
import { fetchMcpServers } from '../services/mcpService'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useNavigate } from 'react-router-dom'

import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { Button } from '@/components/ui/Button'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { useCompanyStore } from '@/stores/companyStore'

import {
  fetchProviders,
  fetchSettingsSummary,
  fetchRuntimeDefaults,
} from '../services/settingsService'

import type {
  AiProvider,
  AiSettingsSummary,
} from '../types/settings'

import { AiSettingsShell } from '../components/AiSettingsShell'

import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './OverviewPage.css'


/* ==========================================================================
   SUMMARY
   ========================================================================== */

const EMPTY_SUMMARY: AiSettingsSummary = {
  providers: 0,
  connectedProviders: 0,
  models: 0,
  enabledModels: 0,
}


/* ==========================================================================
   USAGE PERIOD
   ========================================================================== */

type UsagePeriod =
  | '7d'
  | '30d'
  | '60d'


const USAGE_PERIOD_OPTIONS: Array<{
  value: UsagePeriod
  label: string
}> = [
  {
    value: '7d',
    label: 'Last 7 days',
  },
  {
    value: '30d',
    label: 'Last 30 days',
  },
  {
    value: '60d',
    label: 'Last 60 days',
  },
]


/* ==========================================================================
   PAGE
   ========================================================================== */

export function AiSettingsPage() {
  const companyId = useCompanyStore(state => state.companyId)
  return <OverviewWorkspace key={companyId} companyId={companyId}/>
}
type OverviewActivity = {id:string; title:string; detail:string; time:string; status:'success'|'error'|'neutral'}
function OverviewWorkspace({companyId}:{companyId:string}) {
  const navigate = useNavigate()
  const [mcpCounts,setMcpCounts] = useState({servers:0,connected:0,errors:0})
  const [toolCounts, setToolCounts] = useState({ available: 0, active: 0, disabled: 0 })




  /* ------------------------------------------------------------------------
     Data
     ------------------------------------------------------------------------ */

  const [
    summary,
    setSummary,
  ] =
    useState<AiSettingsSummary>(
      EMPTY_SUMMARY,
    )


  const [
    providers,
    setProviders,
  ] =
    useState<AiProvider[]>([])


  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true)


  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    )


  /* ------------------------------------------------------------------------
     Usage chart state
     ------------------------------------------------------------------------ */

  const [
    activeUsageIndex,
    setActiveUsageIndex,
  ] =
    useState(
      0,
    )





  /* ------------------------------------------------------------------------
     Usage period dropdown
     ------------------------------------------------------------------------ */

  const [
    usagePeriod,
    setUsagePeriod,
  ] =
    useState<UsagePeriod>(
      '30d',
    )


  const [usageRecords,setUsageRecords]=useState<UsageRecord[]>([])
  const [healthIssues,setHealthIssues]=useState<Array<{id:string;name:string;kind:string;path:string}>>([])
  const [recentActivity,setRecentActivity]=useState<OverviewActivity[]>([])
  const requestId=useRef(0)
  const usage=useMemo(()=>{
    const days=parseInt(usagePeriod),current=selectUsagePeriod(usageRecords,days),totals=usageTotals(current),previous=usageTotals(selectUsagePeriod(usageRecords,days,true))
    const change=(value:number,before:number)=>before?((value-before)/before*100>=0?'+':'')+((value-before)/before*100).toFixed(1)+'%':'No previous usage'
    const daily=usageDaily(current)
    return {
      preview:{requests:totals.requests.toLocaleString(),agentRuns:totals.runs.toLocaleString(),toolCalls:totals.calls.toLocaleString(),cost:usageMoney(totals.cost)},
      changes:{requests:change(totals.requests,previous.requests),agentRuns:change(totals.runs,previous.runs),toolCalls:change(totals.calls,previous.calls),cost:change(totals.cost,previous.cost)},
      chart:daily.map((point,index)=>({label:usageDate(point.date),value:point.requests,change:index?change(point.requests,daily[index-1].requests):'—'}))
    }
  },[usageRecords,usagePeriod])
  const USAGE_PREVIEW=usage.preview,USAGE_CHANGE=usage.changes,USAGE_CHART=usage.chart
  const USAGE_MAX=Math.max(1,...USAGE_CHART.map(point=>point.value))
  const activeUsagePoint=USAGE_CHART[Math.min(activeUsageIndex,USAGE_CHART.length-1)]??{label:'No usage',value:0,change:'—'}
  const [RUNTIME_DEFAULTS,setRuntimeDefaults]=useState({provider:'Not configured',model:'Not configured',fallbackModel:'Not configured',routing:'Not configured'})
  const RECENT_ACTIVITY=recentActivity
  useEffect(()=>setActiveUsageIndex(Math.max(0,usage.chart.length-1)),[usage.chart])

  /* ------------------------------------------------------------------------
     Load settings
     ------------------------------------------------------------------------ */

  const load =
    useCallback(
      async () => {
        const currentRequest=++requestId.current
        setIsLoading(true)
        setError(null)

        try {
          const [
            nextSummary,
            providerResult,
            toolResult,
            mcpResult,
            usageResult,
            securityResult,
            runtimeResult,
          ] =
            await Promise.all([
              fetchSettingsSummary(
                companyId,
              ),

              fetchProviders(
                companyId,
              ),
              fetchTools(companyId),
              fetchMcpServers(companyId),
              fetchUsageRecords(companyId),
              fetchSecurityPolicy(companyId),
              fetchRuntimeDefaults(companyId),
            ])

          if(currentRequest!==requestId.current)return
          setUsageRecords(usageResult)
          setRuntimeDefaults(runtimeResult)
          setHealthIssues([
            ...providerResult.items.filter(item=>item.status==='error').map(item=>({id:'provider-'+item.id,name:item.name,kind:'Provider',path:'/ai/ai/ai-settings/models/providers?'+new URLSearchParams({providerId:item.id,companyId}).toString()})),
            ...toolResult.filter(item=>item.status==='error').map(item=>({id:'tool-'+item.id,name:item.name,kind:'Tool',path:'/ai/ai/ai-settings/tools/'+item.id})),
            ...mcpResult.filter(item=>item.status==='error').map(item=>({id:'mcp-'+item.id,name:item.name,kind:'MCP',path:'/ai/ai/ai-settings/mcp?'+new URLSearchParams({serverId:item.id,companyId}).toString()}))
          ])
          const activities:OverviewActivity[]=[
            ...providerResult.items.filter(provider=>provider.lastTestedAt).map(provider=>({id:'provider-'+provider.id,time:provider.lastTestedAt!,title:provider.name+' · Connection tested',detail:'Provider',status:provider.status==='error'?'error' as const:'neutral' as const})),
            ...toolResult.flatMap(tool=>tool.activity.map(item=>({id:'tool-'+tool.id+'-'+item.id,time:item.time,title:tool.name,detail:item.message,status:item.status==='error'?'error' as const:item.status==='success'?'success' as const:'neutral' as const}))),
            ...mcpResult.flatMap(server=>server.activity.map(item=>({id:'mcp-'+server.id+'-'+item.id,time:item.time,title:server.name,detail:item.message,status:'neutral' as const}))),
            ...securityResult.changes.map(item=>({id:'policy-'+item.id,time:item.time,title:item.field+' updated',detail:item.before+' → '+item.after+' · '+item.actor,status:'neutral' as const}))
          ]
          setRecentActivity(activities.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,3))
          setToolCounts({ available: toolResult.length, active: toolResult.filter(tool => tool.status === 'active').length, disabled: toolResult.filter(tool => tool.status === 'disabled').length })
          setMcpCounts({servers:mcpResult.length,connected:mcpResult.filter(s=>s.status==='connected').length,errors:mcpResult.filter(s=>s.status==='error').length})

          setSummary(
            nextSummary,
          )

          setProviders(
            providerResult.items,
          )
        } catch (caught) {
          if(currentRequest!==requestId.current)return
          setUsageRecords([]);setHealthIssues([]);setRecentActivity([]);setRuntimeDefaults({provider:'Not configured',model:'Not configured',fallbackModel:'Not configured',routing:'Not configured'})
          setSummary(
            EMPTY_SUMMARY,
          )

          setProviders([])
          setToolCounts({ available: 0, active: 0, disabled: 0 })
          setMcpCounts({servers:0,connected:0,errors:0})

          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load AI settings.',
          )
        } finally {
          if(currentRequest===requestId.current)setIsLoading(false)
        }
      },
      [companyId],
    )


  useEffect(() => {
    void load()
    return()=>{requestId.current++}
  }, [load])


  return (
    <AiSettingsShell>
      <FlashToasts
        error={error}
        onClearError={() =>
          setError(null)
        }
      />


      <div className="ai-settings-overview">
        {/* =====================================================
            CAPABILITY CARDS
            ===================================================== */}

        <section
          className="ai-settings-capability-grid"
          aria-label="AI capabilities"
        >
          {/* Models */}
          <article className="ai-settings-capability-card">
            <div
              className="
                ai-settings-capability-card__icon
                ai-settings-capability-card__icon--models
              "
              aria-hidden="true"
            >
              M
            </div>


            <div className="ai-settings-capability-card__body">
              <div className="ai-settings-capability-card__header">
                <div>
                  <h2>
                    Models
                  </h2>
                </div>

                <span className="ai-settings-capability-card__badge">
                  {isLoading?'—':summary.enabledModels>0?'Active':'No enabled models'}
                </span>
              </div>


              <dl className="ai-settings-capability-stats">
                <div>
                  <dt>
                    Providers
                  </dt>

                  <dd>
                    {isLoading
                      ? '—'
                      : summary.providers}
                  </dd>
                </div>

                <div>
                  <dt>
                    Models
                  </dt>

                  <dd>
                    {isLoading
                      ? '—'
                      : summary.models}
                  </dd>
                </div>

                <div>
                  <dt>
                    Enabled
                  </dt>

                  <dd>
                    {isLoading
                      ? '—'
                      : summary.enabledModels}
                  </dd>
                </div>
              </dl>


              <div className="ai-settings-capability-card__footer">
                <Button
                  type="button"
                  variant="ghost"
                  className="ai-settings-provider-entry"
                  onClick={() =>
                    void navigate(
                      '/ai/ai/ai-settings/models/providers',
                    )
                  }
                >
                  Providers →
                </Button>
                <Button type="button" variant="ghost" className="ai-settings-capability-entry" disabled={isLoading||!providers.length} onClick={()=>navigate(`/ai/ai/ai-settings/models/providers/${providers[0]?.id}/models`)}>Manage Models →</Button>
              </div>
            </div>
          </article>


          {/* Tools */}
          <article className="ai-settings-capability-card">
            <div
              className="
                ai-settings-capability-card__icon
                ai-settings-capability-card__icon--tools
              "
              aria-hidden="true"
            >
              T
            </div>


            <div className="ai-settings-capability-card__body">
              <div className="ai-settings-capability-card__header">
                <div>
                  <h2>
                    Tools
                  </h2>
                </div>

                <span
                  className="
                    ai-settings-capability-card__badge
                  "
                >
                  {isLoading?'—':toolCounts.active>0?'Active':'No active tools'}
                </span>
              </div>


              <dl className="ai-settings-capability-stats">
                <div>
                  <dt>
                    Total
                  </dt>

                  <dd>
                    {isLoading ? '—' : toolCounts.available}
                  </dd>
                </div>

                <div>
                  <dt>
                    Active
                  </dt>

                  <dd>
                    {isLoading ? '—' : toolCounts.active}
                  </dd>
                </div>

                <div>
                  <dt>
                    Disabled
                  </dt>

                  <dd>
                    {isLoading ? '—' : toolCounts.disabled}
                  </dd>
                </div>
              </dl>


              <div className="ai-settings-capability-card__footer">
                <Button
                  type="button"
                  variant="ghost"
                  className="ai-settings-capability-entry"
                  onClick={() => navigate('/ai/ai/ai-settings/tools')}
                >
                  Manage Tools →
                </Button>
              </div>
            </div>
          </article>


          {/* MCP */}
          <article className="ai-settings-capability-card">
            <div
              className="
                ai-settings-capability-card__icon
                ai-settings-capability-card__icon--mcp
              "
              aria-hidden="true"
            >
              MCP
            </div>


            <div className="ai-settings-capability-card__body">
              <div className="ai-settings-capability-card__header">
                <div>
                  <h2>
                    MCP
                  </h2>
                </div>

                <span
                  className="
                    ai-settings-capability-card__badge
                    ai-settings-capability-card__badge--muted
                  "
                >
                  Local demo
                </span>
              </div>


              <dl className="ai-settings-capability-stats">
                <div>
                  <dt>
                    Servers
                  </dt>

                  <dd>
                    {isLoading ? '—' : mcpCounts.servers}
                  </dd>
                </div>

                <div>
                  <dt>
                    Connected
                  </dt>

                  <dd>
                    {isLoading ? '—' : mcpCounts.connected}
                  </dd>
                </div>

                <div>
                  <dt>
                    Errors
                  </dt>

                  <dd className={!isLoading&&mcpCounts.errors>0?'is-warning':undefined}>
                    {isLoading ? '—' : mcpCounts.errors}
                  </dd>
                </div>
              </dl>


              <div className="ai-settings-capability-card__footer">
                <Button
                  type="button"
                  variant="ghost"
                  className="ai-settings-capability-entry"
                  onClick={() => navigate('/ai/ai/ai-settings/mcp')}
                >
                  Manage MCP →
                </Button>
              </div>
            </div>
          </article>
        </section>


        {/* =====================================================
            OVERVIEW BODY
            ===================================================== */}

        <section className="ai-settings-overview-body">
          {/* ===================================================
              USAGE
              =================================================== */}

          <article className="console-panel ai-settings-usage-panel">
            <div className="ai-settings-section-header">
              <h2>
                Usage
              </h2>


              <div className="ai-settings-usage-actions"><div className="ai-settings-period-filter">
                <SidebarSelect menuPortal
                  id="ai-settings-usage-period"
                  label="Usage period"
                  hideLabel
                  value={usagePeriod}
                  options={USAGE_PERIOD_OPTIONS}
                  onChange={(value) => setUsagePeriod(value as UsagePeriod)}
                />
              </div></div>
            </div>


            <p className="ai-settings-overview-note">Sample usage · estimated cost in MYR · changes compared with the previous period</p>
            {/* Summary */}
            <div className="ai-settings-usage-grid">
              <div className="ai-settings-usage-stat">
                <span>
                  Requests
                </span>

                <strong>
                  {
                    isLoading?'—':USAGE_PREVIEW.requests
                  }
                </strong>

                <small>
                  {
                    isLoading?'—':USAGE_CHANGE.requests
                  }
                </small>
              </div>


              <div className="ai-settings-usage-stat">
                <span>
                  Agent Runs
                </span>

                <strong>
                  {
                    USAGE_PREVIEW.agentRuns
                  }
                </strong>

                <small>
                  {
                    USAGE_CHANGE.agentRuns
                  }
                </small>
              </div>


              <div className="ai-settings-usage-stat">
                <span>
                  Tool Calls
                </span>

                <strong>
                  {
                    USAGE_PREVIEW.toolCalls
                  }
                </strong>

                <small>
                  {
                    USAGE_CHANGE.toolCalls
                  }
                </small>
              </div>


              <div className="ai-settings-usage-stat ai-settings-usage-stat--cost">
                <span>
                  Cost
                </span>

                <strong>
                  {
                    USAGE_PREVIEW.cost
                  }
                </strong>

                <small>
                  {
                    USAGE_CHANGE.cost
                  }
                </small>
              </div>
            </div>


            {/* Chart */}
            <div className="ai-settings-usage-preview">
              <div className="ai-settings-usage-preview__header">
                <span>
                  Daily requests
                </span>
              </div>


              <div
                className="ai-settings-usage-chart-area"
                onMouseLeave={() =>
                  setActiveUsageIndex(
                    Math.max(0,USAGE_CHART.length - 1),
                  )
                }
              >
                {/* Current point */}
                <div
                  className="ai-settings-usage-tooltip"
                  aria-live="polite"
                >
                  <span>
                    {
                      activeUsagePoint.label
                    }
                  </span>

                  <strong>
                    {
                      activeUsagePoint.value.toLocaleString()
                    }{' '}
                    requests
                  </strong>

                  <small
                    className={
                      activeUsagePoint.change.startsWith(
                        '-',
                      )
                        ? 'is-negative'
                        : ''
                    }
                  >
                    {
                      activeUsagePoint.change
                    }{' '}
                    vs previous day
                  </small>
                </div>


                {/* Bars */}
                <div className="ai-settings-usage-chart">
                  {USAGE_CHART.map(
                    (
                      point,
                      index,
                    ) => {
                      const height =
                        (
                          point.value /
                          USAGE_MAX
                        ) *
                        100

                      return (
                        <button
                          key={
                            point.label
                          }
                          type="button"
                          className={[
                            'ai-settings-usage-bar',
                            index ===
                            activeUsageIndex
                              ? 'is-active'
                              : '',
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              ' ',
                            )}
                          style={{
                            height:
                              `${height}%`,
                          }}
                          onMouseEnter={() =>
                            setActiveUsageIndex(
                              index,
                            )
                          }
                          onFocus={() =>
                            setActiveUsageIndex(
                              index,
                            )
                          }
                          aria-label={`${point.label}: ${point.value.toLocaleString()} requests, ${point.change} versus previous day`}
                        />
                      )
                    },
                  )}
                </div>


                {/* Axis */}
                <div className="ai-settings-usage-axis">
                  <span>
                    {
                      USAGE_CHART[0]?.label??'—'
                    }
                  </span>

                  <span>
                    {
                      USAGE_CHART[
                        Math.floor(
                          USAGE_CHART.length /
                            2,
                        )
                      ]?.label??'—'
                    }
                  </span>

                  <span>
                    {
                      USAGE_CHART[
                        USAGE_CHART.length -
                          1
                      ]?.label??'—'
                    }
                  </span>
                </div>
              </div>
            </div>
          </article>


          {/* ===================================================
              STATUS RAIL
              =================================================== */}

          <aside className="ai-settings-status-rail">
            {/* Health */}
            <article className="console-panel ai-settings-rail-panel ai-settings-health-panel">
              <div className="ai-settings-section-header">
                <div className="ai-settings-health-heading"><h2>Configuration Health</h2>
                {!isLoading&&!error?<span className="ai-settings-health-count" role="status">{healthIssues.length} {healthIssues.length===1?'issue':'issues'}</span>:null}</div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void load()
                  }
                  disabled={
                    isLoading
                  }
                >
                  Refresh
                </Button>
              </div>


              {isLoading?<p className="ai-settings-health-empty">Loading configuration…</p>:error?<p role="alert">Unable to check configuration. Use Refresh to retry.</p>:healthIssues.length?
                <ul className="ai-settings-health-list">{healthIssues.map(issue=><li key={issue.id}><Button variant="ghost" fullWidth className="ai-settings-health-row" title={issue.name+' · '+issue.kind+' · Error'} aria-label={'Review '+issue.name+' '+issue.kind+' error'} onClick={()=>navigate(issue.path)}><span className="ai-settings-health-dot ai-settings-health-dot--error" aria-hidden="true"/><strong>{issue.name}</strong><span className="ai-settings-health-kind">{issue.kind}</span><span aria-hidden="true">›</span></Button></li>)}</ul>
              :<p className="ai-settings-health-empty"><span className="ai-settings-health-dot" aria-hidden="true"/>{summary.providers+toolCounts.available+mcpCounts.servers?'No configuration errors':'No configuration added yet.'}</p>}
            </article>


            {/* Runtime */}
            <article className="console-panel ai-settings-rail-panel ai-settings-runtime-panel">
              <div className="ai-settings-section-header">
                <h2>
                  Runtime Defaults
                </h2>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void navigate(
                      '/ai/ai/ai-settings/models/providers',
                    )
                  }
                >
                  Configure
                </Button>
              </div>


              <dl className="ai-settings-default-list">
                <div>
                  <dt>
                    Provider
                  </dt>

                  <dd title={RUNTIME_DEFAULTS.provider}>
                    {
                      RUNTIME_DEFAULTS.provider
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Model
                  </dt>

                  <dd title={RUNTIME_DEFAULTS.model}>
                    {
                      RUNTIME_DEFAULTS.model
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Fallback
                  </dt>

                  <dd title={RUNTIME_DEFAULTS.fallbackModel}>
                    {
                      RUNTIME_DEFAULTS.fallbackModel
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Routing
                  </dt>

                  <dd title={RUNTIME_DEFAULTS.routing}>
                    {
                      RUNTIME_DEFAULTS.routing
                    }
                  </dd>
                </div>
              </dl>
            </article>


            {/* Recent Activity */}
            <article className="console-panel ai-settings-rail-panel">
              <div className="ai-settings-section-header">
                <h2>
                  Recent Activity
                </h2>
              </div>



              <ul className="ai-settings-activity-list">
                {!isLoading&&!RECENT_ACTIVITY.length?<li>No recent activity.</li>:null}
                {RECENT_ACTIVITY.map(
                  (
                    activity,
                  ) => (
                    <li
                      key={
                        activity.id
                      }
                    >
                      <span
                        className={`ai-settings-activity-dot ai-settings-activity-dot--${activity.status}`}
                        aria-hidden="true"
                      />

                      <div className="ai-settings-activity-copy">
                        <strong title={activity.title}>
                          {
                            activity.title
                          }
                        </strong>

                        <small title={activity.detail+' · '+new Date(activity.time).toLocaleString()}>
                          {
                            activity.detail+' · '+new Date(activity.time).toLocaleString()
                          }
                        </small>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </AiSettingsShell>
  )
}
