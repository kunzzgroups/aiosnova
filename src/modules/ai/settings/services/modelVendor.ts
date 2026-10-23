export const MODEL_VENDORS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'google', label: 'Google' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'meta-llama', label: 'Meta' },
  { value: 'mistralai', label: 'Mistral AI' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'x-ai', label: 'xAI' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'nvidia', label: 'NVIDIA' },
  { value: 'aion-labs', label: 'Aion Labs' },
  { value: 'other', label: 'Other' },
] as const

export type ModelVendor =
  (typeof MODEL_VENDORS)[number]['value']

const knownVendors = new Set<string>(
  MODEL_VENDORS
    .filter(item => item.value !== 'other')
    .map(item => item.value),
)

export function getModelVendor(modelId: string): ModelVendor {
  const normalized = modelId
    .trim()
    .toLowerCase()
    .replace(/^~+/, '')

  const slashIndex = normalized.indexOf('/')

  if (slashIndex <= 0) {
    return 'other'
  }

  const prefix = normalized.slice(0, slashIndex)

  return knownVendors.has(prefix)
    ? prefix as ModelVendor
    : 'other'
}