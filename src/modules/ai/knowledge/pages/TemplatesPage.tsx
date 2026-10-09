import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Drawer } from '@/components/ui/Drawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { useCompanyStore } from '@/stores/companyStore'
import { ApiError } from '@/services/httpClient'
import { IconPencil, IconTrash } from '@/components/icons/Icons'
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
import './KnowledgePage.css'

const FORM_ID = 'template-edit-form'

const KIND_LABEL_KEY: Record<KnowledgeBaseKind, string> = {
    document: 'ai.knowledge.kindDocument',
    skill: 'ai.knowledge.kindSkill',
    data: 'ai.knowledge.kindData',
}

/**
 * Template library for the ACTIVE company.
 *
 * Only templates whose `allowedCompanyIds` includes the active company are
 * listed. Edit is gated to editor+ of the template's OWNER company; Delete
 * is gated to admin of the owner. Other companies that merely see the
 * template show "Read only".
 */
export function TemplatesPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const companyId = useCompanyStore((state) => state.companyId)
    const companies = useCompanyStore((state) => state.companies)

    const [templates, setTemplates] = useState<TemplateListItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    // ---- Edit drawer
    const [editOpen, setEditOpen] = useState(false)
    const [editing, setEditing] = useState<TemplateListItem | null>(null)
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [editCategory, setEditCategory] = useState('')
    const [editVisibility, setEditVisibility] = useState<string[]>([])
    const [editSearch, setEditSearch] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // ---- Delete dialog
    const [pendingDelete, setPendingDelete] = useState<TemplateListItem | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const companyLabel = companies.find((c) => c.value === companyId)?.label ?? ''

    const load = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const result = await fetchTemplatesForCompany(companyId)
            setTemplates(result.items)
        } catch {
            setTemplates([])
            setError(t('ai.knowledge.errLoadTemplates', 'Unable to load templates.'))
        } finally {
            setIsLoading(false)
        }
    }, [companyId, t])

    useEffect(() => {
        void load()
    }, [load])

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
        try {
            await deleteKnowledgeTemplate(pendingDelete.id)
            setMessage(t('ai.knowledge.msgTemplateDeleted', 'Template deleted.'))
            setPendingDelete(null)
            await load()
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : t('ai.knowledge.errTemplateDelete', 'Could not delete this template.'),
            )
        } finally {
            setIsDeleting(false)
        }
    }

    /* ---------------- Visibility picker helpers ---------------- */

    /** Owner company first, then alphabetical. */
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
        if (id === ownerId) return    // owner is locked
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

    return (
        <div className="console-page">
            <FlashToasts
                error={error}
                message={message}
                onClearError={() => setError(null)}
                onClearMessage={() => setMessage(null)}
            />

            <section className="console-panel">
                <div className="console-panel__title-row">
                    <h2>{t('ai.knowledge.templatesTitle', 'Template library')}</h2>
                    <Button
                        variant="secondary"
                        onClick={() => void navigate('/ai/ai/knowledge')}
                    >
                        {t('ai.knowledge.back', 'Back')}
                    </Button>
                </div>
                <p className="console-hint">
                    {companyLabel
                        ? t(
                            'ai.knowledge.templatesScope',
                            'Templates visible to {{company}}. Only the owning company can edit or delete.',
                            { company: companyLabel },
                        )
                        : t(
                            'ai.knowledge.templatesHint',
                            'Templates visible to the active company.',
                        )}
                </p>

                {isLoading ? (
                    <p className="console-empty">{t('ai.knowledge.loading', 'Loading…')}</p>
                ) : templates.length === 0 ? (
                    <p className="console-empty">
                        {t(
                            'ai.knowledge.templatesEmptyForCompany',
                            'No templates are visible to this company yet.',
                        )}
                    </p>
                ) : (
                    <div className="console-table-wrap">
                        <table className="console-table">
                            <thead>
                                <tr>
                                    <th>{t('ai.knowledge.colName', 'Name')}</th>
                                    <th>{t('ai.knowledge.colKind', 'Kind')}</th>
                                    <th>{t('ai.knowledge.colDescription', 'Description')}</th>
                                    <th>{t('ai.knowledge.colVisibility', 'Visible to')}</th>
                                    <th>{t('ai.knowledge.colOwner', 'Owner')}</th>
                                    <th className="console-table__actions">
                                        {t('ai.knowledge.colActions', 'Actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {templates.map((template) => {
                                    const canEdit = userCanEditTemplate(template.id, companyId)
                                    const canDelete = userCanDeleteTemplate(template.id, companyId)
                                    const ownerLabel =
                                        companies.find((c) => c.value === template.ownerCompanyId)
                                            ?.label ?? template.ownerCompanyId

                                    return (
                                        <tr key={template.id}>
                                            {/* NAME */}
                                            <td>
                                                <span className="console-table__name">
                                                    <span>{template.name}</span>
                                                </span>
                                            </td>

                                            {/* KIND */}
                                            <td className="console-table__muted">
                                                {t(KIND_LABEL_KEY[template.kind])}
                                            </td>

                                            {/* DESCRIPTION */}
                                            <td className="console-table__muted">{template.description}</td>

                                            {/* VISIBLE TO */}
                                            <td>
                                                <span className="console-chips">
                                                    {template.allowedCompanyIds.map((id) => {
                                                        const label =
                                                            companies.find((c) => c.value === id)?.label ?? id
                                                        return (
                                                            <span className="console-chip console-chip--muted" key={id}>
                                                                {label}
                                                            </span>
                                                        )
                                                    })}
                                                </span>
                                            </td>

                                            {/* OWNER */}
                                            <td>
                                                <span className="console-chip">{ownerLabel}</span>
                                            </td>

                                            {/* ACTIONS */}
                                            <td className="console-table__actions">
                                                {canEdit || canDelete ? (
                                                    <>
                                                        {canEdit ? (
                                                            <button
                                                                type="button"
                                                                className="console-icon-button"
                                                                aria-label={t('ai.knowledge.edit', 'Edit')}
                                                                title={t('ai.knowledge.edit', 'Edit')}
                                                                onClick={() => openEdit(template)}
                                                            >
                                                                <IconPencil />
                                                            </button>
                                                        ) : null}
                                                        {canDelete ? (
                                                            <button
                                                                type="button"
                                                                className="console-icon-button console-icon-button--danger"
                                                                aria-label={t('ai.knowledge.delete', 'Delete')}
                                                                title={t('ai.knowledge.delete', 'Delete')}
                                                                onClick={() => setPendingDelete(template)}
                                                            >
                                                                <IconTrash />
                                                            </button>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <span className="console-readonly">
                                                        {t('ai.knowledge.readOnly', 'Read only')}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ---------- Edit drawer ---------- */}
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

                    {/* Visibility picker */}
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
                open={pendingDelete !== null}
                title={t('ai.knowledge.deleteTemplateTitle', 'Delete "{{name}}"?', {
                    name: pendingDelete?.name ?? '',
                })}
                description={t(
                    'ai.knowledge.deleteTemplateBody',
                    'Existing adoptions are not affected. The template will no longer be available.',
                )}
                warning={t('ai.knowledge.deleteWarning', 'This cannot be undone.')}
                confirmLabel={t('ai.knowledge.delete')}
                cancelLabel={t('ai.knowledge.cancel')}
                busyLabel={t('ai.knowledge.deleting')}
                busy={isDeleting}
                onConfirm={() => void handleDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    )
}