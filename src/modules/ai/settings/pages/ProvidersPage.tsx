import { connectionStatusLabel } from '../services/connectionPresentation'
import { useSearchParams } from 'react-router-dom'
import { useDisabledSelection } from '../hooks/useDisabledSelection'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useCompanyStore } from '@/stores/companyStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsDrawer as Drawer } from '../components/SettingsDrawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { TablePanel } from '@/components/ui/TablePanel'
import { IconPlus, IconTrash } from '@/components/icons/Icons'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import {
    createProvider,
    deleteProvider,
    deleteProviders,
    fetchProviders,
    setProviderEnabled,
    updateProvider,
} from '../services/settingsService'
import type {
    AiProvider,
    ProviderStatus,
} from '../types/settings'
import { ProviderDetails } from '../components/ProviderDetails'
import { ModelManagement } from '../components/ModelManagement'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { SettingsEditor, SettingsEditorSection } from '../components/SettingsEditor'
import { IconSettings, IconShieldCheck, IconSpark } from '@/components/icons/Icons'
import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './ProvidersPage.css'
import {
    testModelConnection,
    type ConnectionTestResult,
} from '../services/connectionService'
import {
    fetchModelCapabilities,
    type ModelCapabilities,
} from '../services/modelCapabilitiesService'

const PROVIDER_FORM_ID = 'ai-provider-form'

type StatusFilter = 'all' | ProviderStatus

export function ProvidersPage() {
    const companyId = useCompanyStore((state) => state.companyId)
    return <ProvidersWorkspace key={companyId} companyId={companyId} />
}
function ProvidersWorkspace({ companyId }: { companyId: string }) {
    const [searchParams] = useSearchParams()
    const targetProvider = searchParams.get('companyId') === companyId ? searchParams.get('providerId') : null
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
    const [managerProvider, setManagerProvider] = useState<AiProvider | null>(null)
    const [managerStartCreate, setManagerStartCreate] = useState(false)
    const [managerBusy, setManagerBusy] = useState(false)
    const [managerTarget, setManagerTarget] = useState<HTMLDivElement | null>(null)
    const [modelsRevision, setModelsRevision] = useState(0)
    const [isUpdating, setIsUpdating] = useState(false)
    const providerMutationRef = useRef(false)
    const [providers, setProviders] = useState<AiProvider[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [query, setQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [pendingBulk, setPendingBulk] = useState<{ ids: string[]; scope: string; companyId: string } | null>(null)
    const [bulkError, setBulkError] = useState<string | null>(null)
    const bulkSubmittingRef = useRef(false)
    const currentScopeRef = useRef(companyId)
    currentScopeRef.current = companyId
    useEffect(() => { setPendingBulk(null); setBulkError(null); setPendingDelete(null); setSelectedProviderId(null); setManagerProvider(null); setManagerBusy(false) }, [companyId])
    const [pendingDelete, setPendingDelete] = useState<AiProvider | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [formOpen, setFormOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [baseUrl, setBaseUrl] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [modelId, setModelId] = useState('')
    const [enabled, setEnabled] = useState(true)
    const [statusMenuOpen, setStatusMenuOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [capabilities, setCapabilities] =
        useState<ModelCapabilities | null>(null)

    const [capabilityError, setCapabilityError] =
        useState<string | null>(null)

    const [isLoadingCapabilities, setIsLoadingCapabilities] =
        useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [testResult, setTestResult] =
        useState<ConnectionTestResult | null>(null)

    useEffect(() => { if (targetProvider) { setSelectedProviderId(targetProvider); setQuery(''); setStatusFilter('all') } }, [targetProvider, companyId])

    useEffect(() => {
        setCapabilities(null)
        setCapabilityError(null)
    }, [modelId, baseUrl, formOpen])

    const loadSequence = useRef(0)
    const load = useCallback(async (background = false) => {
        const request = ++loadSequence.current
        if (!background) setIsLoading(true)
        setError(null)
        try {
            const result = await fetchProviders(companyId)
            if (request !== loadSequence.current || currentScopeRef.current !== companyId) return
            setProviders(result.items)
        } catch (caught) {
            if (request !== loadSequence.current || currentScopeRef.current !== companyId) return
            setProviders([])
            setError(caught instanceof Error ? caught.message : 'Unable to load providers.')
        } finally {
            if (request === loadSequence.current && currentScopeRef.current === companyId) setIsLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        void load()
    }, [load])

    const visibleProviders = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return providers
            .filter(
                (provider) =>
                    provider.companyId === companyId && (statusFilter === 'all' || provider.status === statusFilter),
            )
            .filter(
                (provider) =>
                    !needle ||
                    provider.name.toLowerCase().includes(needle) ||
                    provider.baseUrl.toLowerCase().includes(needle),
            )
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [providers, query, statusFilter, companyId])

    const selection = useDisabledSelection(visibleProviders, visibleProviders, statusFilter, query, companyId)
    const bulkItems = providers.filter(item => pendingBulk?.ids.includes(item.id))
    const selectedProvider = visibleProviders.find(provider => provider.id === selectedProviderId) ?? visibleProviders[0] ?? null

    function resetForm() {
        setEditingId(null)
        setName('')
        setBaseUrl('')
        setApiKey('')
        setModelId('')
        setEnabled(true)
        setStatusMenuOpen(false)
        setTestResult(null)
        setError(null)
    }

    function openCreate() {
        resetForm()
        setFormOpen(true)
    }

    function openEdit(provider: AiProvider) {
        setEditingId(provider.id)
        setName(provider.name)
        setBaseUrl(provider.baseUrl)
        setApiKey('')
        setModelId('')
        setEnabled(provider.enabled)
        setStatusMenuOpen(false)
        setTestResult(null)
        setError(null)
        setFormOpen(true)
    }

    function closeForm() {
        if (isSaving || isTesting || isLoadingCapabilities) return
        setFormOpen(false)
        resetForm()
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault()

        if (!name.trim()) {
            setError('Provider name is required.')
            return
        }

        if (!/^https?:\/\/\S+/i.test(baseUrl.trim())) {
            setError('Enter a valid HTTP or HTTPS Base URL.')
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            if (editingId) {
                await updateProvider(editingId, {
                    companyId,
                    name,
                    baseUrl,
                    apiKey: apiKey.trim() || undefined,
                    enabled,
                })
                setMessage('Provider updated successfully.')
            } else {
                await createProvider({
                    companyId,
                    name,
                    baseUrl,
                    apiKey: apiKey.trim() || undefined,
                    enabled,
                })
                setMessage('Provider created successfully.')
            }

            setFormOpen(false)
            resetForm()
            await load()
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to save provider.')
        } finally {
            setIsSaving(false)
        }
    }

    async function handleTestConnection() {
        setTestResult(null)
        setError(null)

        if (!baseUrl.trim() || !apiKey.trim() || !modelId.trim()) {
            setError('请填写服务地址、API Key 和测试模型 ID。')
            return
        }

        setIsTesting(true)

        try {
            const result = await testModelConnection({
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim(),
                modelId: modelId.trim(),
            })

            setTestResult(result)

            if (!result.ok) {
                setError(result.message)
            }
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : '无法完成模型连接测试。'
            )
        } finally {
            setIsTesting(false)
        }
    }

    async function handleLoadCapabilities() {
        setCapabilities(null)
        setCapabilityError(null)

        if (!modelId.trim()) {
            setCapabilityError('请先填写模型 ID。')
            return
        }

        if (baseUrl.trim() !== 'https://openrouter.ai/api/v1') {
            setCapabilityError('目前只支持读取 OpenRouter 模型能力。')
            return
        }

        setIsLoadingCapabilities(true)

        try {
            const result = await fetchModelCapabilities(modelId.trim())
            setCapabilities(result)
        } catch (caught) {
            setCapabilityError(
                caught instanceof Error
                    ? caught.message
                    : '无法读取模型能力。'
            )
        } finally {
            setIsLoadingCapabilities(false)
        }
    }

    async function toggleProvider(provider: AiProvider) {
        if (providerMutationRef.current || isDeleting || provider.companyId !== currentScopeRef.current) return
        providerMutationRef.current = true
        setIsUpdating(true)
        try {
            await setProviderEnabled(provider.id, !provider.enabled)
            await load(true)
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : 'Unable to update provider.',
            )
        } finally { providerMutationRef.current = false; setIsUpdating(false) }
    }

    function closeManager() {
        if (managerBusy) return
        setManagerProvider(null)
        setManagerBusy(false)
        setModelsRevision(revision => revision + 1)
        void load(true)
    }

    async function handleDelete() {
        if (!pendingDelete || isDeleting || pendingDelete.companyId !== currentScopeRef.current || pendingDelete.enabled || pendingDelete.status !== 'disabled') return
        setIsDeleting(true)
        setDeleteError(null)
        try {
            await deleteProvider(pendingDelete.id)
            setPendingDelete(null)
            setMessage('Provider deleted successfully.')
            await load()
        } catch (caught) {
            setDeleteError(caught instanceof Error ? caught.message : 'Unable to delete provider.')
        } finally {
            setIsDeleting(false)
        }
    }

    async function removeSelectedProviders() {
        if (!pendingBulk || useCompanyStore.getState().companyId !== pendingBulk.companyId || pendingBulk.ids.length < 2 || bulkSubmittingRef.current || isDeleting || useCompanyStore.getState().companyId !== pendingBulk.scope) return
        if (bulkItems.length !== pendingBulk.ids.length || bulkItems.some(item => item.status !== 'disabled')) {
            setBulkError('The selection has changed. Select disabled items again.')
            return
        }
        bulkSubmittingRef.current = true
        const deletingScope = pendingBulk.scope
        const deletingCompanyId = pendingBulk.companyId
        setBulkError(null)
        setIsDeleting(true)
        try {
            await deleteProviders(deletingScope, pendingBulk.ids)
            if (useCompanyStore.getState().companyId !== deletingCompanyId || currentScopeRef.current !== deletingScope || useCompanyStore.getState().companyId !== deletingScope) return
            const deleted = new Set(pendingBulk.ids)
            setProviders(current => current.filter(item => !deleted.has(item.id)))
            selection.clear()
            setPendingBulk(null)
            setMessage(`Removed ${deleted.size} providers successfully.`)
        } catch (caught) {
            if (useCompanyStore.getState().companyId === deletingCompanyId && currentScopeRef.current === deletingScope) setBulkError(caught instanceof Error ? caught.message : 'Unable to remove selected providers.')
        } finally {
            bulkSubmittingRef.current = false
            setIsDeleting(false)
        }
    }

    return (
        <AiSettingsShell>
            <FlashToasts
                error={error}
                message={message}
                onClearError={() => setError(null)}
                onClearMessage={() => setMessage(null)}
            />

            <div ref={setManagerTarget} className="console-page console-page--internal-table-scroll ai-settings-providers-page">
                <TablePanel inert={managerProvider?.companyId === companyId}>
                    <TableToolbar
                        actions={<>{selection.selected.length > 1 ? <Button variant="danger" disabled={isDeleting || isLoading} onClick={() => { setBulkError(null); setPendingBulk({ ids: selection.selected.map(item => item.id), scope: companyId, companyId }) }}><IconTrash aria-hidden="true" />Remove</Button> : null}<Button onClick={openCreate} disabled={isDeleting || isLoading}><IconPlus />Add Provider</Button></>}
                        search={
                            <TextField
                                className="ui-table-toolbar__search"
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search providers…"
                                aria-label="Search providers"
                            />
                        }
                        filters={
                            <SidebarSelect
                                id="provider-status-filter"
                                label="Provider status"
                                hideLabel
                                value={statusFilter}
                                options={[
                                    { value: 'all', label: 'All status' },
                                    { value: 'connected', label: 'Connected' },
                                    { value: 'not_verified', label: 'Not verified' },
                                    { value: 'disabled', label: 'Disabled' },
                                    { value: 'error', label: 'Error' },
                                ]}
                                onChange={(value) => setStatusFilter(value as StatusFilter)}
                            />
                        }
                    />

                    {isLoading ? (
                        <p className="console-empty ai-settings-providers-empty">Loading providers…</p>
                    ) : visibleProviders.length === 0 ? (
                        <div className="ai-settings-empty ai-settings-providers-empty">
                            <strong>No providers found</strong>
                            <p>Try a different filter or add a provider.</p>
                            <Button onClick={openCreate}>Add Provider</Button>
                        </div>
                    ) : (
                        <div className="ai-provider-workspace">
                            <div className="ai-provider-list-column">
                                {selection.enabled ? (
                                    <label className="ai-provider-select-all">
                                        <input ref={selection.selectAllRef} type="checkbox" className="ai-settings-selection-checkbox" aria-label="Select all filtered disabled providers" disabled={isDeleting || !selection.hasSelectablePage} checked={selection.allSelected} onChange={event => selection.togglePage(event.target.checked)} />
                                        Select all{selection.selected.length ? ` (${selection.selected.length} selected)` : ''}
                                    </label>
                                ) : null}
                                <div className="ai-provider-list" aria-label="Providers">
                                    {visibleProviders.map(provider => (
                                        <div className={`ai-provider-card${selectedProvider?.id === provider.id ? ' is-selected' : ''}`} key={provider.id}>
                                            {selection.enabled ? <input type="checkbox" className="ai-settings-selection-checkbox" aria-label={`Select ${provider.name}`} disabled={isDeleting || provider.status !== 'disabled'} checked={selection.ids.includes(provider.id)} onChange={event => selection.toggle(provider.id, event.target.checked)} /> : null}
                                            <button type="button" className="ai-provider-card-select" aria-pressed={selectedProvider?.id === provider.id} onClick={() => setSelectedProviderId(provider.id)}>
                                                <span className={`ai-settings-provider-mark ai-settings-provider-mark--${provider.slug}`} aria-hidden="true">{provider.name.slice(0, 2).toUpperCase()}</span>
                                                <span className="ai-provider-card-name"><strong>{provider.name}</strong><small>{provider.modelCount} models</small></span>
                                                <span className={`console-status console-status--${provider.status}`}>{connectionStatusLabel(provider.status)}</span>
                                                <span className="ai-provider-card-chevron" aria-hidden="true">›</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {selectedProvider ? <ProviderDetails
                                key={`${companyId}:${selectedProvider.id}`}
                                provider={selectedProvider}
                                companyId={companyId}
                                busy={isDeleting || isLoading || isUpdating}
                                onEdit={() => openEdit(selectedProvider)}
                                onToggle={() => void toggleProvider(selectedProvider)}
                                onDelete={() => { setDeleteError(null); setPendingDelete(selectedProvider) }}
                                onConnectionTested={() => load(true)}
                                onManageModels={() => { setManagerStartCreate(false); setManagerBusy(true); setManagerProvider(selectedProvider) }}
                                onAddModel={() => { setManagerStartCreate(true); setManagerBusy(true); setManagerProvider(selectedProvider) }}
                                modelsRevision={modelsRevision}
                            /> : null}
                        </div>
                    )}
                </TablePanel>
                {managerProvider?.companyId === companyId && managerTarget ? (
                    <Drawer
                        open
                        hideHeader
                        title="Manage Models"
                        description={managerProvider.name}
                        closeLabel="Close model manager"
                        onClose={closeManager}
                        busy={managerBusy}
                        portalTarget={managerTarget}
                        className="ai-provider-management-drawer"
                    >
                        <ModelManagement key={`${companyId}:${managerProvider.id}`} providerId={managerProvider.id} initialCreate={managerStartCreate} onBusyChange={setManagerBusy} onClose={closeManager} />
                    </Drawer>
                ) : null}
            </div>

            <ConfirmDialog
                variant="deletion"
                className="ai-settings-delete-dialog"
                open={pendingBulk !== null}
                title={`Remove ${bulkItems.length} providers?`}
                description={<div className="ai-settings-bulk-delete-copy"><p>The selected providers and their model configurations will be permanently removed.</p><ul className="ai-settings-bulk-delete-list">{bulkItems.map(item => <li key={item.id}>{item.name}</li>)}</ul></div>}
                warning="This cannot be undone."
                error={bulkError}
                busy={isDeleting}
                confirmDisabled={bulkItems.length < 2 || bulkItems.length !== pendingBulk?.ids.length || bulkItems.some(item => item.status !== 'disabled')}
                confirmLabel="Remove"
                cancelLabel="Cancel"
                busyLabel="Removing…"
                onConfirm={removeSelectedProviders}
                onCancel={() => { if (!isDeleting) { setPendingBulk(null); setBulkError(null) } }}
            />

            <ConfirmDialog
                open={pendingDelete !== null}
                className="ai-settings-delete-dialog"
                title={`Delete ${pendingDelete?.name ?? 'provider'}?`}
                description="This will permanently delete this provider and its model configurations."
                warning="This cannot be undone."
                confirmLabel="Delete"
                cancelLabel="Cancel"
                busyLabel="Deleting…"
                busy={isDeleting}
                error={deleteError}
                onConfirm={handleDelete}
                onCancel={() => { if (!isDeleting) { setPendingDelete(null); setDeleteError(null) } }}
            />

            <SettingsEditor
                open={formOpen}
                title={editingId ? 'Edit Provider' : 'Add Provider'}
                description="Configure the model provider connection used by AI Agents."
                onClose={closeForm}
                busy={isSaving || isTesting || isLoadingCapabilities}
                closeLabel="Close"
                footer={
                    <>
                        <Button
                            type="submit"
                            form={PROVIDER_FORM_ID}
                            disabled={isSaving || isTesting || isLoadingCapabilities}
                        >
                            {isSaving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={closeForm}
                            disabled={isSaving || isTesting || isLoadingCapabilities}
                        >
                            Cancel
                        </Button>
                    </>
                }
            >
                <form
                    className="ai-settings-form"
                    id={PROVIDER_FORM_ID}
                    onSubmit={(event) => void handleSubmit(event)}
                    onKeyDownCapture={(event) => {
                        if (event.key === 'Escape' && statusMenuOpen) {
                            event.preventDefault()
                            event.stopPropagation()
                            setStatusMenuOpen(false)
                        }
                    }}
                >
                    <SettingsEditorSection title="Basic Information" icon={<IconSpark />}>
                        <FormField label="Provider Name" htmlFor="provider-name">
                            <TextField
                                id="provider-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="OpenAI"
                                disabled={isSaving || isTesting || isLoadingCapabilities}
                                autoFocus
                            />
                        </FormField>

                    </SettingsEditorSection>
                    <SettingsEditorSection title="Connection" icon={<IconSettings />}>
                        <FormField label="Base URL" htmlFor="provider-base-url">
                            <TextField
                                id="provider-base-url"
                                value={baseUrl}
                                onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null) }}
                                placeholder="https://api.example.com"
                                disabled={isSaving || isTesting || isLoadingCapabilities}
                            />
                        </FormField>

                        <FormField label="API Key" htmlFor="provider-api-key">
                            <TextField
                                id="provider-api-key"
                                type="password"
                                value={apiKey}
                                onChange={(event) => { setApiKey(event.target.value); setTestResult(null) }}
                                placeholder={editingId ? 'Leave blank to keep current key' : 'Enter API key'}
                                autoComplete="new-password"
                                disabled={isSaving || isTesting || isLoadingCapabilities}
                            />
                        </FormField>

                        <FormField label="Test Model ID" htmlFor="provider-test-model-id">
                            <TextField
                                id="provider-test-model-id"
                                value={modelId}
                                onChange={(event) => {
                                    setModelId(event.target.value)
                                    setTestResult(null)
                                }}
                                placeholder="deepseek/deepseek-v4.1-flash-1017"
                                disabled={isSaving || isTesting || isLoadingCapabilities}
                            />
                        </FormField>

                    </SettingsEditorSection>
                    <SettingsEditorSection title="Availability" icon={<IconShieldCheck />}>
                        <FormField label="Status" htmlFor="provider-status">
                            <SidebarSelect menuPortal
                                id="provider-status"
                                open={statusMenuOpen}
                                onOpenChange={setStatusMenuOpen}
                                label="Status"
                                hideLabel
                                className="console-form-select--down"
                                value={enabled ? 'enabled' : 'disabled'}
                                options={[
                                    { value: 'enabled', label: 'Enabled' },
                                    { value: 'disabled', label: 'Disabled' },
                                ]}
                                onChange={(value) => setEnabled(value === 'enabled')}
                                disabled={isSaving || isTesting || isLoadingCapabilities}
                            />
                        </FormField>
                    </SettingsEditorSection>

                    <SettingsEditorSection title="Model Connection Test" icon={<IconSettings />}>
                        <p>发送真实模型请求，可能产生 API 使用费用。测试时需要重新填写 API Key。</p>

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleTestConnection()}
                            disabled={isSaving || isTesting || isLoadingCapabilities || !baseUrl.trim()}
                        >
                            {isTesting ? 'Testing…' : 'Test Connection'}
                        </Button>

                        {testResult ? (
                            <div
                                className={`ai-settings-connection-result${testResult.ok ? '' : ' is-error'
                                    }`}
                                role="status"
                            >
                                <strong>{testResult.message}</strong>
                                {testResult.reply ? (
                                    <p>模型回答：{testResult.reply}</p>
                                ) : null}
                            </div>
                        ) : null}
                    </SettingsEditorSection>

                    <SettingsEditorSection
                        title="Model Capabilities"
                        icon={<IconSettings />}
                    >
                        <p>读取 OpenRouter 目录声明的能力，不需要 API Key。</p>

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleLoadCapabilities()}
                            disabled={
                                isSaving ||
                                isTesting ||
                                isLoadingCapabilities ||
                                !modelId.trim()
                            }
                        >
                            {isLoadingCapabilities ? '读取中…' : '读取能力'}
                        </Button>

                        {capabilityError ? (
                            <p role="alert">{capabilityError}</p>
                        ) : null}

                        {capabilities ? (
                            <div role="status">
                                <p>模型：{modelId.trim()}</p>
                                <dl>
                                    <dt>文字聊天</dt>
                                    <dd>{capabilities.chat ? '支持' : '不支持'}</dd>

                                    <dt>图片输入</dt>
                                    <dd>{capabilities.vision ? '支持' : '不支持'}</dd>

                                    <dt>工具调用</dt>
                                    <dd>{capabilities.toolCalling ? '支持' : '不支持'}</dd>

                                    <dt>上下文容量</dt>
                                    <dd>
                                        {capabilities.contextWindow === null
                                            ? '未知'
                                            : `${capabilities.contextWindow.toLocaleString()} Token`}
                                    </dd>
                                </dl>
                            </div>
                        ) : null}
                    </SettingsEditorSection>

                </form>
            </SettingsEditor>
        </AiSettingsShell>
    )
}
