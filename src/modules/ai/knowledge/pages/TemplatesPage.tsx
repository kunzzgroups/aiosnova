import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Drawer } from '@/components/ui/Drawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { useCompanyStore } from '@/stores/companyStore'
import { ApiError } from '@/services/httpClient'
import { IconPencil, IconTrash } from '@/components/icons/Icons'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TablePagination } from '@/components/ui/TablePagination'
import {
    deleteKnowledgeTemplate,
    fetchTemplatesForCompany,
    updateKnowledgeTemplate,
    userCanDeleteTemplate,
    userCanEditTemplate,
    type TemplateListItem,
} from '../services/templateService'
import type { KnowledgeBaseKind } from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './TemplatesPage.css'
const FORM_ID = 'template-edit-form'
const KIND_LABEL_KEY: Record<KnowledgeBaseKind, string> = {
    document: 'ai.knowledge.kindDocument',
    skill: 'ai.knowledge.kindSkill',
    data: 'ai.knowledge.kindData',
}
export function TemplatesPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const companyId = useCompanyStore((state) => state.companyId)
    const companies = useCompanyStore((state) => state.companies)
    const [templates, setTemplates] = useState<TemplateListItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    // Pagination mirrors AgentsPage / shared TablePagination behaviour.
    // pageSize === 0 means Auto.
    const [pageSize, setPageSize] = useState(0)
    const [autoPageSize, setAutoPageSize] = useState(10)
    const [page, setPage] = useState(1)
    const tableRef = useRef<HTMLDivElement>(null)
    const autoFitRowMeasurement = useRef({ width: 0, height: 0 })
    const [editOpen, setEditOpen] = useState(false)
    const [editing, setEditing] = useState<TemplateListItem | null>(null)
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [editCategory, setEditCategory] = useState('')
    const [editVisibility, setEditVisibility] = useState<string[]>([])
    const [editSearch, setEditSearch] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [pendingDelete, setPendingDelete] =
        useState<TemplateListItem | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    const loadRequest = useRef(0)
    useEffect(() => { setEditOpen(false); setEditing(null); setPendingDelete(null) }, [companyId])
    const load = useCallback(async () => {
        const request = ++loadRequest.current
        setIsLoading(true)
        setError(null)
        try {
            const result = await fetchTemplatesForCompany(companyId)
            if (request !== loadRequest.current) return
            setTemplates(result.items)
        } catch {
            if (request !== loadRequest.current) return
            setTemplates([])
            setError(t('ai.knowledge.errLoadTemplates', 'Unable to load templates.'))
        } finally {
            if (request === loadRequest.current) setIsLoading(false)
        }
    }, [companyId, t])
    useEffect(() => {
        void load()
    }, [load])
    const visibleTemplates = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase()
        const list = needle
            ? templates.filter((template) =>
                template.name.toLowerCase().includes(needle),
            )
            : templates
        return list
            .slice()
            .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: 'base',
                }),
            )
    }, [templates, searchQuery])
    const effectivePageSize = pageSize || autoPageSize
    const pageCount = Math.max(
        1,
        Math.ceil(visibleTemplates.length / effectivePageSize),
    )
    const currentPage = Math.min(page, pageCount)
    const paginatedTemplates = visibleTemplates.slice(
        (currentPage - 1) * effectivePageSize,
        currentPage * effectivePageSize,
    )
    useEffect(() => {
        setPage(1)
    }, [searchQuery, effectivePageSize])
    // Auto page size: fit as many rows as the shared table area can display.
    useEffect(() => {
        if (isLoading || !visibleTemplates.length) return
        const container = tableRef.current
        const table = container?.querySelector('table')
        if (!container || !table) return
        let frame = 0
        function measureRows() {
            if (!container || !table) return
            const rows = Array.from(
                table.querySelectorAll<HTMLTableRowElement>('tbody tr'),
            )
            if (!rows.length) return
            rows.forEach((row) => row.style.removeProperty('height'))
            const headerHeight =
                table.querySelector('thead')?.getBoundingClientRect().height ?? 0
            const availableHeight = container.clientHeight - headerHeight
            if (availableHeight <= 0) return
            const width = container.clientWidth
            if (autoFitRowMeasurement.current.width !== width) {
                autoFitRowMeasurement.current = { width, height: 0 }
            }
            if (currentPage === 1 || !autoFitRowMeasurement.current.height) {
                const naturalHeight = Math.max(
                    1,
                    ...rows.map((row) => row.getBoundingClientRect().height),
                )
                autoFitRowMeasurement.current.height = Math.max(
                    autoFitRowMeasurement.current.height,
                    naturalHeight,
                )
            }
            const naturalHeight = autoFitRowMeasurement.current.height
            if (pageSize === 0) {
                const limit = Math.max(
                    1,
                    Math.floor(availableHeight / naturalHeight),
                )
                setAutoPageSize((current) =>
                    current === limit ? current : limit,
                )
                const uniformHeight = Math.max(
                    naturalHeight,
                    availableHeight / limit,
                )
                rows.forEach((row) => {
                    row.style.height = `${uniformHeight}px`
                })
                return
            }
            // Explicit page sizes (10 / 25 / ...):
            // fill the available body only when this is a full page.
            // A short last page keeps its natural row height.
            if (rows.length === pageSize) {
                const uniformHeight = Math.max(
                    naturalHeight,
                    availableHeight / rows.length,
                )
                rows.forEach((row) => {
                    row.style.height = `${uniformHeight}px`
                })
            }
        }
        function scheduleMeasure() {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(measureRows)
        }
        const observer = new ResizeObserver(scheduleMeasure)
        observer.observe(container)
        observer.observe(table)
        scheduleMeasure()
        return () => {
            observer.disconnect()
            cancelAnimationFrame(frame)
            table
                .querySelectorAll<HTMLTableRowElement>('tbody tr')
                .forEach((row) => row.style.removeProperty('height'))
        }
    }, [
        isLoading,
        visibleTemplates.length,
        pageSize,
        currentPage,
        effectivePageSize,
    ])
    function openEdit(template: TemplateListItem) {
        setEditing(template)
        setEditName(template.name)
        setEditDescription(template.description)
        setEditCategory(template.category)
        setEditVisibility([...template.allowedCompanyIds])
        setEditSearch('')
        setError(null)
        setEditOpen(true)
    }
    function closeEdit() {
        setEditOpen(false)
        setEditing(null)
    }
    async function handleSave() {
        if (!editing) return
        if (!editName.trim()) {
            setError(t('ai.knowledge.errNameRequired'))
            return
        }
        if (editVisibility.length === 0) {
            setError(t('ai.knowledge.errTemplateNoVisibility', 'Pick at least one company.'))
            return
        }
        setIsSaving(true)
        setError(null)
        try {
            await updateKnowledgeTemplate({
                templateId: editing.id,
                version: editing.version,
                name: editName.trim(),
                description: editDescription.trim(),
                category: editCategory.trim(),
                allowedCompanyIds: editVisibility,
            })
            setMessage(t('ai.knowledge.msgTemplateUpdated', 'Template updated.'))
            closeEdit()
            await load()
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : t('ai.knowledge.errTemplateUpdate', 'Could not update this template.'),
            )
        } finally {
            setIsSaving(false)
        }
    }
    async function handleDelete() {
        if (!pendingDelete || isDeleting) return
        setIsDeleting(true)
        setDeleteError(null)
        try {
            await deleteKnowledgeTemplate(pendingDelete.id, pendingDelete.version)
            setMessage(t('ai.knowledge.msgTemplateDeleted', 'Template deleted.'))
            setPendingDelete(null)
            await load()
        } catch (caught) {
            setDeleteError(
                caught instanceof ApiError
                    ? caught.message
                    : t('ai.knowledge.errTemplateDelete', 'Could not delete this template.'),
            )
        } finally {
            setIsDeleting(false)
        }
    }
    const orderedCompanies = useMemo(() => {
        if (!editing) return companies
        const ownerId = editing.ownerCompanyId
        const owner = companies.find((c) => c.value === ownerId)
        const rest = companies
            .filter((c) => c.value !== ownerId)
            .slice()
            .sort((a, b) => a.label.localeCompare(b.label))
        return owner ? [owner, ...rest] : companies
    }, [companies, editing])
    const visibleEditCompanies = useMemo(() => {
        const needle = editSearch.trim().toLowerCase()
        if (!needle) return orderedCompanies
        return orderedCompanies.filter((c) =>
            c.label.toLowerCase().includes(needle),
        )
    }, [orderedCompanies, editSearch])
    function toggleEditCompany(id: string) {
        const ownerId = editing?.ownerCompanyId
        if (id === ownerId) return
        setEditVisibility((current) =>
            current.includes(id)
                ? current.filter((x) => x !== id)
                : [...current, id],
        )
    }
    function editSelectAll() {
        const ownerId = editing?.ownerCompanyId
        const next = new Set(editVisibility)
        for (const c of visibleEditCompanies) next.add(c.value)
        if (ownerId) next.add(ownerId)
        setEditVisibility([...next])
    }
    function editSelectNone() {
        const ownerId = editing?.ownerCompanyId
        setEditVisibility(ownerId ? [ownerId] : [])
    }
    const isEmpty = !isLoading && visibleTemplates.length === 0
    return (
        <div className="console-page console-page--internal-table-scroll templates-page">
            <FlashToasts
                error={error}
                message={message}
                onClearError={() => setError(null)}
                onClearMessage={() => setMessage(null)}
            />
            <TablePanel>
                <TableToolbar
                    search={
                        <TextField
                            className="ui-table-toolbar__search"
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={t(
                                'ai.knowledge.searchTemplates',
                                'Search templates…',
                            )}
                            aria-label={t(
                                'ai.knowledge.searchTemplates',
                                'Search templates',
                            )}
                        />
                    }
                    actions={
                        <Button
                            variant="secondary"
                            onClick={() => void navigate('/ai/ai/knowledge')}
                        >
                            {t('ai.knowledge.back', 'Back')}
                        </Button>
                    }
                />
                {isLoading ? (
                    <p
                        className="console-empty"
                        style={{ padding: '0 24px 24px' }}
                    >
                        {t('ai.knowledge.loading', 'Loading…')}
                    </p>
                ) : isEmpty ? (
                    <p
                        className="console-empty"
                        style={{ padding: '0 24px 24px' }}
                    >
                        {templates.length === 0
                            ? t(
                                'ai.knowledge.templatesEmptyForCompany',
                                'No templates are visible to this company yet.',
                            )
                            : t(
                                'ai.knowledge.templatesEmptyFiltered',
                                'No templates match your search.',
                            )}
                    </p>
                ) : (
                    <>
                        <div className="console-table-wrap" ref={tableRef}>
                            <table className="console-table console-table--fixed console-table--templates">
                                <colgroup>
                                    <col style={{ width: '18%' }} />
                                    <col style={{ width: '12%' }} />
                                    <col style={{ width: '24%' }} />
                                    <col style={{ width: '20%' }} />
                                    <col style={{ width: '14%' }} />
                                    <col style={{ width: '12%' }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>{t('ai.knowledge.colName', 'Name')}</th>
                                        <th>{t('ai.knowledge.colKind', 'Kind')}</th>
                                        <th>
                                            {t(
                                                'ai.knowledge.colDescription',
                                                'Description',
                                            )}
                                        </th>
                                        <th>
                                            {t(
                                                'ai.knowledge.colVisibility',
                                                'Visible to',
                                            )}
                                        </th>
                                        <th>{t('ai.knowledge.colOwner', 'Owner')}</th>
                                        <th className="console-table__actions identity-table__actions">
                                            {t(
                                                'ai.knowledge.colActions',
                                                'Actions',
                                            )}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTemplates.map((template) => {
                                        const canEdit = userCanEditTemplate(
                                            template.id,
                                            companyId,
                                        )
                                        const canDelete = userCanDeleteTemplate(
                                            template.id,
                                            companyId,
                                        )
                                        const ownerLabel =
                                            companies.find(
                                                (company) =>
                                                    company.value ===
                                                    template.ownerCompanyId,
                                            )?.label ?? template.ownerCompanyId
                                        return (
                                            <tr key={template.id}>
                                                <td>
                                                    <span className="console-table__name">
                                                        <span>{template.name}</span>
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="console-chip console-chip--muted templates-table__kind-chip">
                                                        {t(
                                                            KIND_LABEL_KEY[
                                                            template.kind
                                                            ],
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="console-table__muted">
                                                    <span
                                                        className="templates-table__description"
                                                        title={
                                                            template.description ||
                                                            undefined
                                                        }
                                                    >
                                                        {template.description || '—'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className="console-chips templates-table__visibility"
                                                        title={template.allowedCompanyIds
                                                            .map(
                                                                (id) =>
                                                                    companies.find(
                                                                        (company) =>
                                                                            company.value ===
                                                                            id,
                                                                    )?.label ?? id,
                                                            )
                                                            .join(', ')}
                                                    >
                                                        {template.allowedCompanyIds
                                                            .slice(0, 2)
                                                            .map((id) => {
                                                                const label =
                                                                    companies.find(
                                                                        (company) =>
                                                                            company.value ===
                                                                            id,
                                                                    )?.label ?? id
                                                                return (
                                                                    <span
                                                                        className="console-chip console-chip--muted templates-table__company-chip"
                                                                        key={id}
                                                                        title={label}
                                                                    >
                                                                        {label}
                                                                    </span>
                                                                )
                                                            })}
                                                        {template.allowedCompanyIds
                                                            .length > 2 ? (
                                                            <span className="console-chip console-chip--muted templates-table__overflow-chip">
                                                                +
                                                                {template
                                                                    .allowedCompanyIds
                                                                    .length - 2}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="console-chip templates-table__owner-chip" title={ownerLabel}>
                                                        {ownerLabel}
                                                    </span>
                                                </td>
                                                <td className="console-table__actions identity-table__actions">
                                                    {canEdit || canDelete ? (
                                                        <div className="identity-inline-actions identity-directory-actions">
                                                            {canEdit ? (
                                                                <IconButton
                                                                    label={t(
                                                                        'ai.knowledge.edit',
                                                                        'Edit',
                                                                    )}
                                                                    variant="secondary"
                                                                    onClick={() =>
                                                                        openEdit(
                                                                            template,
                                                                        )
                                                                    }
                                                                >
                                                                    <IconPencil />
                                                                </IconButton>
                                                            ) : null}
                                                            {canDelete ? (
                                                                <IconButton
                                                                    label={t(
                                                                        'ai.knowledge.delete',
                                                                        'Delete',
                                                                    )}
                                                                    variant="danger"
                                                                    onClick={() => {
                                                                        setDeleteError(null)
                                                                        setPendingDelete(template)
                                                                    }}
                                                                >
                                                                    <IconTrash />
                                                                </IconButton>
                                                            ) : null}
                                                        </div>
                                                    ) : (
                                                        <span className="console-readonly">
                                                            {t(
                                                                'ai.knowledge.readOnly',
                                                                'Read only',
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination
                            id="templates-pagination"
                            total={visibleTemplates.length}
                            pageSize={pageSize}
                            autoPageSize={autoPageSize}
                            effectivePageSize={effectivePageSize}
                            currentPage={currentPage}
                            pageCount={pageCount}
                            pagesLabel={t('users.directoryPages')}
                            onPageSizeChange={setPageSize}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </TablePanel>
            <Drawer
                open={editOpen}
                title={t('ai.knowledge.editTemplateTitle', 'Edit template')}
                description={t(
                    'ai.knowledge.editTemplateHint',
                    'Changing visibility affects who can adopt this template. Existing adoptions are not affected.',
                )}
                onClose={closeEdit}
                busy={isSaving}
                closeLabel={t('common.dismiss', 'Dismiss')}
                footer={
                    <>
                        <Button type="submit" form={FORM_ID} disabled={isSaving}>
                            {isSaving ? t('ai.knowledge.saving') : t('ai.knowledge.save')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={closeEdit}
                            disabled={isSaving}
                        >
                            {t('ai.knowledge.cancel')}
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    onSubmit={(event) => {
                        event.preventDefault()
                        void handleSave()
                    }}
                >
                    <div className="console-form__grid">
                        <FormField label={t('ai.knowledge.fieldName')} htmlFor="tpl-name">
                            <TextField
                                id="tpl-name"
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                disabled={isSaving}
                                autoComplete="off"
                                autoFocus
                            />
                        </FormField>
                        <FormField
                            label={t('ai.knowledge.fieldCategory', 'Category')}
                            htmlFor="tpl-category"
                        >
                            <TextField
                                id="tpl-category"
                                value={editCategory}
                                onChange={(event) => setEditCategory(event.target.value)}
                                disabled={isSaving}
                                autoComplete="off"
                            />
                        </FormField>
                    </div>
                    <FormField
                        label={t('ai.knowledge.fieldDescription')}
                        htmlFor="tpl-description"
                    >
                        <TextField
                            id="tpl-description"
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            disabled={isSaving}
                            autoComplete="off"
                        />
                    </FormField>
                    <div className="console-form__section">
                        <h4>
                            {t('ai.knowledge.promoteVisibility', 'Who can see this template?')}
                        </h4>
                        <p>
                            {t(
                                'ai.knowledge.promoteVisibilityEditHint',
                                'The owner company is always included and cannot be removed.',
                            )}
                        </p>
                        <div className="promote-toolbar">
                            <TextField
                                className="promote-toolbar__search"
                                type="search"
                                value={editSearch}
                                onChange={(event) => setEditSearch(event.target.value)}
                                placeholder={t('ai.knowledge.promoteSearch', 'Search companies...')}
                                aria-label={t('ai.knowledge.promoteSearch', 'Search companies...')}
                                disabled={isSaving}
                            />
                            <span className="promote-toolbar__count">
                                {t(
                                    'ai.knowledge.promoteSelected',
                                    '{{selected}} of {{total}} selected',
                                    {
                                        selected: editVisibility.length,
                                        total: companies.length,
                                    },
                                )}
                            </span>
                        </div>
                        <div className="promote-toolbar promote-toolbar--bulk">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={editSelectAll}
                                disabled={isSaving}
                            >
                                {t('ai.knowledge.promoteSelectAll', 'Select all')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={editSelectNone}
                                disabled={isSaving}
                            >
                                {t('ai.knowledge.promoteSelectNone', 'Clear')}
                            </Button>
                        </div>
                        {visibleEditCompanies.length === 0 ? (
                            <p className="console-empty">
                                {t('ai.knowledge.promoteNoMatch', 'No company matches that search.')}
                            </p>
                        ) : (
                            <ul className="promote-visibility">
                                {visibleEditCompanies.map((company) => {
                                    const isOwner = company.value === editing?.ownerCompanyId
                                    const checked = editVisibility.includes(company.value)
                                    return (
                                        <li key={company.value}>
                                            <label
                                                className={[
                                                    'promote-visibility__item',
                                                    checked ? 'is-checked' : '',
                                                    isOwner ? 'is-locked' : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={isSaving || isOwner}
                                                    onChange={() => toggleEditCompany(company.value)}
                                                />
                                                <span className="promote-visibility__name">
                                                    {company.label}
                                                </span>
                                                {isOwner ? (
                                                    <span className="promote-visibility__badge">
                                                        {t('ai.knowledge.promoteOwner', 'Owner')}
                                                    </span>
                                                ) : null}
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </form>
            </Drawer>
            <ConfirmDialog
                variant="deletion"
                open={pendingDelete !== null}
                title={t('ai.knowledge.deleteTemplateHeading')}
                items={pendingDelete ? [{ id: pendingDelete.id, name: pendingDelete.name }] : []}
                description={<p>{t('ai.knowledge.deleteTemplateShort')}</p>}

                error={deleteError}
                confirmLabel={t('ai.knowledge.deleteTemplateAction')}
                cancelLabel={t('ai.knowledge.cancel')}
                busyLabel={t('ai.knowledge.deleting')}
                busy={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    )
}
