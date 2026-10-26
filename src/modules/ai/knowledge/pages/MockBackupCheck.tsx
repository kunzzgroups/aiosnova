import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { validateMockSnapshot, type SnapshotReport } from '@/modules/ai/mock/validateSnapshot'
import { checkSnapshotDatabase, validateFullSnapshot, type FullSnapshotReport, type DatabasePreflightReport } from '@/modules/ai/mock/databasePreflight'

const countLabels: Record<string, string> = {
  agents: 'Agents', bases: 'Knowledge bases', documents: 'Documents', skills: 'Skills',
  dataSources: 'Data sources', templates: 'Templates', documentOverrides: 'Document overrides',
  emptyDocumentOverrides: 'Explicit empty overrides', baseBindings: 'Knowledge base bindings',
  documentBindings: 'Document bindings', inheritedDocuments: 'Documents inheriting defaults',
}

export function MockBackupCheck() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<SnapshotReport | null>(null)
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<unknown>(null)
  const [databaseReport, setDatabaseReport] = useState<DatabasePreflightReport | null>(null)
  const [databaseError, setDatabaseError] = useState('')
  const [fullReport, setFullReport] = useState<FullSnapshotReport | null>(null)
  if (!import.meta.env.DEV) return null
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}>{t('ai.knowledge.backupCheck', 'Check Mock backup')}</Button>
    <Drawer open={open} title={t('ai.knowledge.backupCheck', 'Check Mock backup')}
      description={t('ai.knowledge.backupCheckDescription', 'Offline inspection only. No database or Mock data will be changed.')}
      onClose={() => setOpen(false)} closeLabel={t('common.close', 'Close')} busy={busy}>
      <label>
        {t('ai.knowledge.backupChoose', 'Choose an exported JSON backup (up to 10 MB)')}
        <input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setFilename(file.name); setReport(null); setBusy(true)
          setSnapshot(null); setDatabaseReport(null); setDatabaseError('')
          setFullReport(null)
          try {
            if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10 MB.')
            const parsed: unknown = JSON.parse(await file.text())
            setReport(validateMockSnapshot(parsed))
            setSnapshot(parsed)
          } catch (error) {
            setReport({ errors: [error instanceof SyntaxError ? 'Invalid JSON file.' : error instanceof Error ? error.message : 'Unable to read backup.'], warnings: [], counts: {} })
          } finally { setBusy(false) }
        }} />
      </label>
      <div aria-live="polite">
        {busy ? <p>{t('common.loading', 'Loading…')}</p> : null}
        {report ? <>
          <p style={{ overflowWrap: 'anywhere' }}>{filename}</p>
          <h4>{report.errors.length ? t('ai.knowledge.backupFailed', 'Checks failed') : t('ai.knowledge.backupPassed', 'Offline checks passed')}</h4>
          <p>{t('ai.knowledge.backupNotImported', 'This is not database approval. Nothing has been imported.')}</p>
          <dl>{Object.entries(report.counts).map(([key, count]) => <div key={key}><dt>{countLabels[key] ?? key}</dt><dd>{count}</dd></div>)}</dl>
          <h4>{t('ai.knowledge.backupErrors', 'Errors')} ({report.errors.length})</h4>
          <ul>{report.errors.slice(0, 100).map((item, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{item}</li>)}</ul>
          <h4>{t('ai.knowledge.backupWarnings', 'Warnings')} ({report.warnings.length})</h4>
          <ul>{report.warnings.slice(0, 100).map((item, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{item}</li>)}</ul>
          {report.errors.length > 100 || report.warnings.length > 100 ? <p>Showing the first 100 entries in each section.</p> : null}
          <Button variant="secondary" disabled={busy || report.errors.length > 0} onClick={async () => {
            setBusy(true); setDatabaseReport(null); setDatabaseError(''); setFullReport(null)
            try {
              const full = await validateFullSnapshot(snapshot)
              setFullReport(full)
              if (full.passed) setDatabaseReport(await checkSnapshotDatabase(snapshot))
            }
            catch (error) { setDatabaseError(error instanceof Error ? error.message : 'Database check failed.') }
            finally { setBusy(false) }
          }}>{t('ai.knowledge.databasePreflight', 'Check database (read-only)')}</Button>
          {databaseError ? <p role="alert">{databaseError}</p> : null}
          {fullReport ? <section>
            <h4>{fullReport.passed ? t('ai.knowledge.fullBackupPassed', 'Full backup validation passed') : t('ai.knowledge.fullBackupFailed', 'Full backup validation found issues')}</h4>
            <h4>{t('ai.knowledge.backupErrors', 'Errors')} ({fullReport.errors.length})</h4>
            <ul>{fullReport.errors.map((item, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{item}</li>)}</ul>
            <h4>{t('ai.knowledge.backupWarnings', 'Warnings')} ({fullReport.warnings.length})</h4>
            <ul>{fullReport.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </section> : null}
          {databaseReport ? <section aria-live="polite">
            <h4>{databaseReport.passed ? t('ai.knowledge.databasePassed', 'Database preflight passed') : t('ai.knowledge.databaseFailed', 'Database preflight found issues')}</h4>
            <p>{t('ai.knowledge.databaseCounts', { defaultValue: 'Checked {{ids}} IDs and {{models}} fixed model bindings.', ids: databaseReport.checkedIds, models: databaseReport.checkedModelBindings })}</p>
            <h4>{t('ai.knowledge.backupErrors', 'Errors')} ({databaseReport.errors.length})</h4>
            <ul>{databaseReport.errors.map((item, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{item}</li>)}</ul>
            <h4>{t('ai.knowledge.backupWarnings', 'Warnings')} ({databaseReport.warnings.length})</h4>
            <ul>{databaseReport.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </section> : null}
        </> : null}
      </div>
    </Drawer>
  </>
}
