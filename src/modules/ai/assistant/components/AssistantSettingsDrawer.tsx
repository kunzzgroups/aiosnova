import { useTranslation } from 'react-i18next'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import type {
  AssistantPreferences,
  EvidenceAction,
} from '../preferences'

type AssistantSettingsDrawerProps = {
  open: boolean
  prefs: AssistantPreferences
  onChange: (next: AssistantPreferences) => void
  onClose: () => void
}

export function AssistantSettingsDrawer({
  open,
  prefs,
  onChange,
  onClose,
}: AssistantSettingsDrawerProps) {
  const { t } = useTranslation()

  return (
    <Drawer
      open={open}
      title={t('ai.assistant.settingsTitle', 'Assistant settings')}
      description={t(
        'ai.assistant.settingsHint',
        'Preferences stored on this device.',
      )}
      onClose={onClose}
      closeLabel={t('common.dismiss', 'Dismiss')}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.dismiss', 'Dismiss')}
        </Button>
      }
    >
      <div className="console-form__section">
        <h4>
          {t('ai.assistant.settingsEvidenceAction', 'Evidence click action')}
        </h4>
        <p>
          {t(
            'ai.assistant.settingsEvidenceActionHint',
            'What happens when you click "Open source" on an evidence card.',
          )}
        </p>
        <SidebarSelect
          id="evidence-action"
          label={t('ai.assistant.settingsEvidenceAction', 'Evidence click action')}
          value={prefs.evidenceAction}
          options={[
            {
              value: 'navigate',
              label: t(
                'ai.assistant.settingsEvidenceNavigate',
                'Open in this tab',
              ),
            },
            {
              value: 'newTab',
              label: t('ai.assistant.settingsEvidenceNewTab', 'Open in a new tab'),
            },
          ]}
          onChange={(value) =>
            onChange({ ...prefs, evidenceAction: value as EvidenceAction })
          }
        />
      </div>
    </Drawer>
  )
}