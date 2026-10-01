import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Nav labels are translated by their sidebar id:
 * `/customer-revenue/crm/leads` -> id `customer-revenue.crm.leads`
 * -> key `nav.customer-revenue.crm.leads`.
 *
 * The English text is NOT duplicated in the dictionaries: `sidebarNav.ts` owns
 * it (the label also derives the id and the path), so it is passed as
 * `defaultValue`. A missing Chinese entry therefore degrades to English instead
 * of showing a raw key.
 */
export function useNavLabel() {
  const { t } = useTranslation()

  return useCallback(
    (node: { id: string; label: string }) => t(`nav.${node.id}`, { defaultValue: node.label }),
    [t],
  )
}
