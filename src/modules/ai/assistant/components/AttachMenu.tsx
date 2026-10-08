import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { IconPaperclip, IconSpark, IconFolder } from '@/components/icons/Icons'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { TextField } from '@/components/ui/TextField'
import { FileDropZone } from '@/components/ui/FileDropZone'
import {
  KeyValueEditor,
  keyValuePairsToObject,
  type KeyValuePair,
} from '@/components/ui/KeyValueEditor'
import { useCompanyStore } from '@/stores/companyStore'
import {
  addKnowledgeDocument,
  addKnowledgeSkill,
  addKnowledgeDataSource,
  fetchKnowledgeBases,
} from '@/modules/ai/knowledge/services/knowledgeService'
import type {
  KnowledgeBaseListItem,
  KnowledgeBaseKind,
  KnowledgeDocumentType,
} from '@/modules/ai/knowledge/types/knowledge'
import { ApiError } from '@/services/httpClient'
import './AttachMenu.css'

type AttachMenuProps = {
  onAttachToChat: (file: File) => void
  onStored?: (info: { baseName: string; fileName: string }) => void
}

const DOC_TYPES: KnowledgeDocumentType[] = ['policy', 'contract', 'invoice', 'record']

const DOC_TYPE_LABEL: Record<KnowledgeDocumentType, string> = {
  policy: 'Policy',
  contract: 'Contract',
  invoice: 'Invoice',
  record: 'Record',
}

const DOC_TYPE_HINT: Record<KnowledgeDocumentType, string> = {
  policy: 'Rules, guidelines, SOPs',
  contract: 'Legal agreements, NDAs',
  invoice: 'Bills, receipts, statements',
  record: 'Logs, forms, reports',
}

const KINDS: KnowledgeBaseKind[] = ['document', 'skill', 'data']

const KIND_LABEL: Record<KnowledgeBaseKind, string> = {
  document: 'Document',
  skill: 'Skill',
  data: 'Data',
}

const KIND_HINT: Record<KnowledgeBaseKind, string> = {
  document: 'Files indexed for search',
  skill: 'Callable actions the AI can run',
  data: 'Live tables, APIs, or databases',
}

export function AttachMenu({ onAttachToChat, onStored }: AttachMenuProps) {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)

  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const [bases, setBases] = useState<KnowledgeBaseListItem[]>([])
  const [baseKind, setBaseKind] = useState<KnowledgeBaseKind>('document')
  const [selectedBaseId, setSelectedBaseId] = useState<string>('')

  const [docType, setDocType] = useState<KnowledgeDocumentType>('policy')
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [dsKind, setDsKind] = useState<'table' | 'api' | 'database'>('api')
  const [dsConfig, setDsConfig] = useState<KeyValuePair[]>([])

  const [isLoadingBases, setIsLoadingBases] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handlePointer(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  const filteredBases = useMemo(
    () => bases.filter((base) => (base.kind ?? 'document') === baseKind),
    [bases, baseKind],
  )

  useEffect(() => {
    if (!pickerOpen) return
    setSelectedBaseId(filteredBases[0]?.id ?? '')
  }, [pickerOpen, filteredBases])

  function resetFields() {
    setDocType('policy')
    setSkillName('')
    setSkillDescription('')
    setDsKind('api')
    setDsConfig([])
    setError(null)
    setPendingFiles([])
  }

  function pickForChat() {
    setMenuOpen(false)
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? [])
      files.forEach((file) => onAttachToChat(file))
      input.value = ''
    })
    input.click()
  }

  function pickForKnowledge() {
    setMenuOpen(false)
    resetFields()
    setPickerOpen(true)
    setIsLoadingBases(true)
    fetchKnowledgeBases(companyId)
      .then((result) => setBases(result.items))
      .catch(() =>
        setError(t('ai.assistant.attachErrLoadBases', 'Could not load knowledge bases.')),
      )
      .finally(() => setIsLoadingBases(false))
  }

  async function confirmStore() {
    if (pendingFiles.length === 0 || !selectedBaseId) return
    setIsSaving(true)
    setError(null)

    try {
      if (baseKind === 'document') {
        for (const file of pendingFiles) {
          await addKnowledgeDocument(selectedBaseId, {
            title: file.name,
            type: docType,
            agentIds: null,
            file,
          })
        }
      } else if (baseKind === 'skill') {
        const first = pendingFiles[0]
        const strippedName =
          skillName.trim() || first.name.replace(/\.[^.]+$/, '')
        await addKnowledgeSkill(selectedBaseId, {
          name: strippedName,
          description: skillDescription,
          agentIds: null,
        })
      } else {
        const first = pendingFiles[0]
        const config = keyValuePairsToObject(dsConfig)
        await addKnowledgeDataSource(selectedBaseId, {
          name: first.name.replace(/\.[^.]+$/, ''),
          kind: dsKind,
          config,
          agentIds: null,
        })
      }

      const baseName = bases.find((b) => b.id === selectedBaseId)?.name ?? ''
      const firstName = pendingFiles[0]?.name ?? ''
      onStored?.({ baseName, fileName: firstName })
      setPickerOpen(false)
      setPendingFiles([])
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('ai.assistant.attachErrStore', 'Could not store this file.'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const nothingToPick = !isLoadingBases && filteredBases.length === 0

  return (
    <>
      <div className="attach-menu" ref={wrapperRef}>
        <button
          type="button"
          className="ai-quiet"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <IconPaperclip />
          {t('ai.assistant.attach', 'Attach')}
        </button>

        {menuOpen ? (
          <div className="attach-menu__popover" role="menu">
            <button
              type="button"
              role="menuitem"
              className="attach-menu__item"
              onClick={pickForChat}
            >
              <span className="attach-menu__icon">
                <IconPaperclip />
              </span>
              <span className="attach-menu__body">
                <span className="attach-menu__title">
                  {t('ai.assistant.attachToChat', 'Attach to this chat')}
                </span>
                <span className="attach-menu__hint">
                  {t('ai.assistant.attachToChatHint', 'Kept in this conversation only, not indexed.')}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="attach-menu__item"
              onClick={pickForKnowledge}
            >
              <span className="attach-menu__icon">
                <IconSpark />
              </span>
              <span className="attach-menu__body">
                <span className="attach-menu__title">
                  {t('ai.assistant.attachToKnowledge', 'Store in a knowledge base…')}
                </span>
                <span className="attach-menu__hint">
                  {t(
                    'ai.assistant.attachToKnowledgeHint',
                    'Indexed and available to every agent that uses the base.',
                  )}
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <Drawer
        open={pickerOpen}
        title={t('ai.assistant.storeTitle', 'Store in a knowledge base')}
        description={t(
          'ai.assistant.storeHint',
          'Pick the kind of base first, then the base itself.',
        )}
        onClose={() => setPickerOpen(false)}
        busy={isSaving}
        closeLabel={t('common.dismiss', 'Dismiss')}
        footer={
          <>
            <Button
              onClick={() => void confirmStore()}
              disabled={isSaving || !selectedBaseId || pendingFiles.length === 0}
            >
              {isSaving
                ? t('common.saving', 'Saving…')
                : t('ai.assistant.storeConfirm', 'Store')}
            </Button>
            <Button variant="ghost" onClick={() => setPickerOpen(false)} disabled={isSaving}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </>
        }
      >
        {/* ---- Kind: distinct icon + label + hint ---- */}
        <div className="console-form__section">
          <h4>{t('ai.assistant.storeKind', 'Kind')}</h4>
          <div className="console-kind-picker" role="radiogroup">
            {KINDS.map((option) => {
              const selected = baseKind === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`console-kind-card${selected ? ' console-kind-card--selected' : ''}`}
                  onClick={() => {
                    setBaseKind(option)
                    setPendingFiles([])
                  }}
                  disabled={isSaving}
                >
                  <span className="console-kind-card__icon">
                    {option === 'document' ? <IconFolder /> : option === 'skill' ? <IconSpark /> : <IconData />}
                  </span>
                  <span className="console-kind-card__title">{KIND_LABEL[option]}</span>
                  <span className="console-kind-card__hint">{KIND_HINT[option]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {isLoadingBases ? (
          <p className="console-empty">{t('common.loading', 'Loading…')}</p>
        ) : nothingToPick ? (
          <p className="console-empty">
            {t(
              'ai.assistant.storeNoBasesOfKind',
              'No {{kind}} base in this company yet. Create one on the Knowledge screen first.',
              { kind: KIND_LABEL[baseKind].toLowerCase() },
            )}
          </p>
        ) : (
          <>
            <div className="console-form__section">
              <FormField label={t('ai.assistant.storeBase', 'Knowledge base')} htmlFor="attach-base">
                <SidebarSelect
                  id="attach-base"
                  label={t('ai.assistant.storeBase', 'Knowledge base')}
                  value={selectedBaseId}
                  options={filteredBases.map((base) => ({ value: base.id, label: base.name }))}
                  onChange={setSelectedBaseId}
                  disabled={isSaving}
                />
              </FormField>
            </div>

            <div className="console-form__section">
              <h4>{t('ai.assistant.storeFile', 'File')}</h4>
              <FileDropZone
                value={pendingFiles}
                onChange={setPendingFiles}
                disabled={isSaving}
                multiple={baseKind === 'document'}
                hint={t('common.fileDropHint', 'PDF, DOCX, XLSX, PNG, JPG, TXT up to 10 MB')}
              />
            </div>

            {baseKind === 'document' ? (
              <div className="console-form__section">
                <h4>{t('ai.assistant.storeDocDetails', 'Document details')}</h4>
                <div className="console-form__grid">
                  <FormField label={t('ai.knowledge.fieldType', 'Type')} htmlFor="attach-type">
                    <SidebarSelect
                      id="attach-type"
                      label={t('ai.knowledge.fieldType', 'Type')}
                      value={docType}
                      options={DOC_TYPES.map((value) => ({
                        value,
                        label: `${DOC_TYPE_LABEL[value]} — ${DOC_TYPE_HINT[value]}`,
                      }))}
                      onChange={(value) => setDocType(value as KnowledgeDocumentType)}
                      disabled={isSaving}
                    />
                  </FormField>
                </div>
              </div>
            ) : null}

            {baseKind === 'skill' ? (
              <div className="console-form__section">
                <h4>{t('ai.assistant.storeSkillDetails', 'Skill details')}</h4>
                <p>
                  {t(
                    'ai.assistant.storeSkillHint',
                    'Describe what this skill does so the assistant knows when to invoke it.',
                  )}
                </p>
                <div className="console-form__grid">
                  <FormField label={t('ai.knowledge.fieldSkillName', 'Skill name')} htmlFor="attach-skill-name">
                    <TextField
                      id="attach-skill-name"
                      value={skillName}
                      onChange={(event) => setSkillName(event.target.value)}
                      placeholder="e.g. calculate_tax"
                      disabled={isSaving}
                      autoComplete="off"
                    />
                  </FormField>
                  <FormField
                    label={t('ai.knowledge.fieldSkillDescription', 'Description')}
                    htmlFor="attach-skill-desc"
                  >
                    <TextField
                      id="attach-skill-desc"
                      value={skillDescription}
                      onChange={(event) => setSkillDescription(event.target.value)}
                      placeholder={t(
                        'ai.assistant.storeSkillDescPlaceholder',
                        'e.g. Read a scanned invoice and return its line items.',
                      )}
                      disabled={isSaving}
                      autoComplete="off"
                    />
                  </FormField>
                </div>
              </div>
            ) : null}

            {baseKind === 'data' ? (
              <div className="console-form__section">
                <h4>{t('ai.assistant.storeDataDetails', 'Data source details')}</h4>
                <p>
                  {t(
                    'ai.assistant.storeDataHint',
                    'Pick the source kind, then list any connection fields you need.',
                  )}
                </p>
                <FormField label={t('ai.knowledge.fieldDataSourceKind', 'Kind')} htmlFor="attach-ds-kind">
                  <SidebarSelect
                    id="attach-ds-kind"
                    label={t('ai.knowledge.fieldDataSourceKind', 'Kind')}
                    value={dsKind}
                    options={[
                      { value: 'table', label: 'Table — a table in a database' },
                      { value: 'api', label: 'API — a REST or GraphQL endpoint' },
                      { value: 'database', label: 'Database — a live connection' },
                    ]}
                    onChange={(value) => setDsKind(value as 'table' | 'api' | 'database')}
                    disabled={isSaving}
                  />
                </FormField>
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <KeyValueEditor
                    items={dsConfig}
                    onChange={setDsConfig}
                    disabled={isSaving}
                    keyPlaceholder="table"
                    valuePlaceholder="customers"
                    addLabel={t('ai.assistant.storeDataAddField', 'Add config field')}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}

        {error ? <p className="console-error">{error}</p> : null}
      </Drawer>
    </>
  )
}

/** Inline icon used only by the kind picker. */
function IconData() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}