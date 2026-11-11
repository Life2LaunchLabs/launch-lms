import type { StepMaterial } from '@services/goals/types'

/** A file in the organization's media: uploaded here, or a link to one of its /content/... paths (the connector adds those as links). */
export const isUploadedFile = (item: Pick<StepMaterial, 'kind' | 'url'>) =>
  item.kind === 'file' || /^\/(api\/v1\/)?content\//.test(String(item.url || ''))
