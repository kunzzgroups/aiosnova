import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { IconPaperclip, IconSpark } from '@/components/icons/Icons'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { FileDropZone } from '@/components/ui/FileDropZone'
import { useCompanyStore } from '@/stores/companyStore'
import {
  addKnowledgeDocument,
  fetchKnowledgeBases,
} from '@/modules/ai/knowledge/services/knowledgeService'
import type {
  KnowledgeBaseListItem,
  KnowledgeDocumentType,
} from '@/modules/ai/knowledge/types/knowledge'
import { ApiError } from '@/services/httpClient'
import './AttachMenu.css'

type AttachMenuProps = {
  onAttachToChat: (file: File) => void
  onStored?: (info: { baseName: string; fileName: string }) => void
}

const DOC_TYPES: KnowledgeDocumentType[] = [
  'policy',
  'contract',
  'invoice',
  'record',
]

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

const MAX_FILE_BYTES = 10 * 1024 * 1024


export function AttachMenu({
  onAttachToChat,
  onStored,
}: AttachMenuProps) {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)

  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [bases, setBases] = useState<KnowledgeBaseListItem[]>([])
  const [selectedBaseId, setSelectedBaseId] = useState<string>('')
  const [docType, setDocType] =
    useState<KnowledgeDocumentType>('policy')

  const [isLoadingBases, setIsLoadingBases] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const chatFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    function handlePointer(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointer)
    return () =>
      document.removeEventListener('mousedown', handlePointer)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKey)
    return () =>
      document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  /*
   * AttachMenu is a FILE workflow.
   *
   * A persistent uploaded file belongs in a document base and is stored by
   * addKnowledgeDocument(), which creates KnowledgeDocument.kind === 'file'.
   *
   * Skill and Data bases are intentionally excluded here:
   * the old implementation used the uploaded file only as a name seed and
   * silently discarded its contents for Skill/Data creation.
   */
  const documentBases = useMemo(
    () =>
      bases.filter(
        (base) =>
          (base.kind ?? 'document') === 'document' &&
          base.companyId === companyId,
      ),
    [bases, companyId],
  )

  useEffect(() => {
    if (!pickerOpen) return

    setSelectedBaseId((current) =>
      documentBases.some((base) => base.id === current)
        ? current
        : documentBases[0]?.id ?? '',
    )
  }, [pickerOpen, documentBases])

  function resetStoreForm() {
    setPendingFiles([])
    setSelectedBaseId('')
    setDocType('policy')
    setError(null)
  }

  function pickForChat() {
    setMenuOpen(false)
    chatFileInputRef.current?.click()
  }

  function handleChatFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? []).filter(
      (file) => file.size > 0 && file.size <= MAX_FILE_BYTES,
    )

    files.forEach((file) => onAttachToChat(file))

    window.setTimeout(() => {
      input.value = ''
    }, 0)
  }

  function pickForKnowledge() {
    setMenuOpen(false)
    resetStoreForm()
    setPickerOpen(true)
    setIsLoadingBases(true)

    fetchKnowledgeBases(companyId)
      .then((result) => {
        // Service can return readable cross-company bases. Upload requires a
        // writable base, so the memo below also checks owner company.
        setBases(result.items)
      })
      .catch(() => {
        setBases([])
        setError(
          t(
            'ai.assistant.attachErrLoadBases',
            'Could not load knowledge bases.',
          ),
        )
      })
      .finally(() => setIsLoadingBases(false))
  }

  async function confirmStore() {
    if (
      isSaving ||
      pendingFiles.length === 0 ||
      !selectedBaseId
    ) {
      return
    }

    const selectedBase = documentBases.find(
      (base) => base.id === selectedBaseId,
    )

    if (!selectedBase) {
      setError(
        t(
          'ai.assistant.attachInvalidBase',
          'Choose a document knowledge base you can edit.',
        ),
      )
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      for (const file of pendingFiles) {
        await addKnowledgeDocument(selectedBase.id, {
          title: file.name,
          type: docType,
          agentIds: null,
          file,
        })
      }

      const firstName = pendingFiles[0]?.name ?? ''
      onStored?.({
        baseName: selectedBase.name,
        fileName: firstName,
      })

      setPickerOpen(false)
      resetStoreForm()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t(
              'ai.assistant.attachErrStore',
              'Could not store this file.',
            ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const nothingToPick =
    !isLoadingBases && documentBases.length === 0

  return (
    <>
      <input
        ref={chatFileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleChatFileChange}
      />

      <div className="attach-menu" ref={wrapperRef}>
        <button
          type="button"
          className="ai-quiet"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
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
                  {t(
                    'ai.assistant.attachToChat',
                    'Attach to this chat',
                  )}
                </span>
                <span className="attach-menu__hint">
                  {t(
                    'ai.assistant.attachToChatHint',
                    'Kept in this conversation only, not indexed.',
                  )}
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
                  {t(
                    'ai.assistant.attachToKnowledge',
                    'Store in a knowledge base…',
                  )}
                </span>
                <span className="attach-menu__hint">
                  {t(
                    'ai.assistant.attachToKnowledgeHint',
                    'Upload and index the file in a document knowledge base.',
                  )}
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <Drawer
        open={pickerOpen}
        title={t(
          'ai.assistant.storeTitle',
          'Store in a knowledge base',
        )}
        description={t(
          'ai.assistant.storeHint',
          'Choose a document knowledge base, upload the file, and classify it.',
        )}
        onClose={() => {
          if (!isSaving) {
            setPickerOpen(false)
            resetStoreForm()
          }
        }}
        busy={isSaving}
        closeLabel={t('common.dismiss', 'Dismiss')}
        footer={
          <>
            <Button
              onClick={() => void confirmStore()}
              disabled={
                isSaving ||
                !selectedBaseId ||
                pendingFiles.length === 0
              }
            >
              {isSaving
                ? t('common.saving', 'Saving…')
                : t('ai.assistant.storeConfirm', 'Store')}
            </Button>

            <Button
              variant="ghost"
              onClick={() => {
                setPickerOpen(false)
                resetStoreForm()
              }}
              disabled={isSaving}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </>
        }
      >
        {isLoadingBases ? (
          <p className="console-empty">
            {t('common.loading', 'Loading…')}
          </p>
        ) : nothingToPick ? (
          <p className="console-empty">
            {t(
              'ai.assistant.storeNoDocumentBases',
              'No document knowledge base is available in this company. Create one on the Knowledge screen first.',
            )}
          </p>
        ) : (
          <>
            <div className="console-form__section">
              <FormField
                label={t(
                  'ai.assistant.storeBase',
                  'Knowledge base',
                )}
                htmlFor="attach-base"
              >
                <SidebarSelect
                  id="attach-base"
                  className="console-form-select--down"
                  label={t(
                    'ai.assistant.storeBase',
                    'Knowledge base',
                  )}
                  value={selectedBaseId}
                  options={documentBases.map((base) => ({
                    value: base.id,
                    label: base.name,
                  }))}
                  onChange={setSelectedBaseId}
                  disabled={isSaving}
                />
              </FormField>
            </div>

            <div className="console-form__section">
              <h4>
                {t('ai.assistant.storeFile', 'File')}
              </h4>

              <FileDropZone
                value={pendingFiles}
                onChange={setPendingFiles}
                disabled={isSaving}
                multiple
                maxSizeBytes={MAX_FILE_BYTES}
                maxFiles={20}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg"
                onReject={() =>
                  setError(
                    t(
                      'ai.assistant.attachInvalidFile',
                      'Some files were skipped because they were invalid, unsupported, duplicated, or larger than 10 MB.',
                    ),
                  )
                }
                hint={t(
                  'common.fileDropHint',
                  'PDF, DOCX, XLSX, PNG, JPG, TXT up to 10 MB',
                )}
              />
            </div>

            <div className="console-form__section">
              <h4>
                {t(
                  'ai.assistant.storeDocDetails',
                  'Document details',
                )}
              </h4>

              <div className="console-form__grid">
                <FormField
                  label={t(
                    'ai.knowledge.fieldType',
                    'Type',
                  )}
                  htmlFor="attach-type"
                >
                  <SidebarSelect
                    id="attach-type"
                    className="console-form-select--down"
                    label={t(
                      'ai.knowledge.fieldType',
                      'Type',
                    )}
                    value={docType}
                    options={DOC_TYPES.map((value) => ({
                      value,
                      label: `${DOC_TYPE_LABEL[value]} — ${DOC_TYPE_HINT[value]}`,
                    }))}
                    onChange={(value) =>
                      setDocType(
                        value as KnowledgeDocumentType,
                      )
                    }
                    disabled={isSaving}
                  />
                </FormField>
              </div>
            </div>

            {error ? (
              <p className="console-error">{error}</p>
            ) : null}
          </>
        )}

        {nothingToPick && error ? (
          <p className="console-error">{error}</p>
        ) : null}
      </Drawer>
    </>
  )
}
