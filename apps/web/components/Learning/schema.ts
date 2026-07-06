export type LearningPageType = 'video' | 'standard'

export type LearningBlockAlign = 'left' | 'center' | 'right'

export interface LearningBlockBase {
  id: string
  type: 'text' | 'image' | 'question'
  design?: {
    width?: number
    align?: LearningBlockAlign
    height?: number
  }
}

export interface LearningTextBlock extends LearningBlockBase {
  type: 'text'
  content?: {
    node?: any
  }
}

export interface LearningImageBlock extends LearningBlockBase {
  type: 'image'
  content?: {
    src?: string
    alt?: string
  }
}

export interface LearningQuestionBlock extends LearningBlockBase {
  type: 'question'
  kind: 'multiple_choice' | 'text_input' | string
  content?: any
}

export type LearningBlock = LearningTextBlock | LearningImageBlock | LearningQuestionBlock

export interface LearningPageLike {
  page_uuid?: string
  page_type?: string
  content?: any
}

export function getDefaultBlocks(pageOrContent: LearningPageLike | any): LearningBlock[] {
  const content = pageOrContent?.content?.blocks ? pageOrContent.content : pageOrContent
  return Array.isArray(content?.blocks) ? content.blocks : []
}

export function findQuestionBlock(pageOrContent: LearningPageLike | any): LearningQuestionBlock | null {
  return getDefaultBlocks(pageOrContent).find((block: any) => block?.type === 'question') as LearningQuestionBlock || null
}

export function pageHasVariants(pageOrContent: LearningPageLike | any) {
  const content = pageOrContent?.content?.variants ? pageOrContent.content : pageOrContent
  const overrides = content?.variants?.overrides
  return Boolean(overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0)
}

export function resolveVariantBlocks(page: LearningPageLike, run: any): LearningBlock[] {
  const content = page?.content || {}
  const variants = content.variants || {}
  const overrides = variants.overrides || {}
  const sourcePageUuid = variants.source?.page_uuid
  if (!sourcePageUuid || !overrides || typeof overrides !== 'object') return getDefaultBlocks(content)

  const attempt = getLatestAttemptForPage(run, sourcePageUuid)
  if (!attempt || attempt.result?.grading_status === 'pending') return getDefaultBlocks(content)

  const exactKey = getAttemptOptionKeys(attempt).find((key) => overrides[key]?.blocks)
  if (exactKey) return overrides[exactKey].blocks

  const correctnessKey = attempt.is_correct === true
    ? 'correct'
    : attempt.is_correct === false
      ? 'incorrect'
      : null
  if (correctnessKey && overrides[correctnessKey]?.blocks) return overrides[correctnessKey].blocks

  return getDefaultBlocks(content)
}

export function variantSourceIsPrior(pages: LearningPageLike[], page: LearningPageLike) {
  const sourceUuid = page?.content?.variants?.source?.page_uuid
  if (!sourceUuid || !page?.page_uuid) return true
  const pageIndex = pages.findIndex((item) => item.page_uuid === page.page_uuid)
  const sourceIndex = pages.findIndex((item) => item.page_uuid === sourceUuid)
  return sourceIndex >= 0 && pageIndex >= 0 && sourceIndex < pageIndex
}

function getLatestAttemptForPage(run: any, pageUuid: string) {
  const attempts = Array.isArray(run?.attempts) ? run.attempts : []
  return attempts
    .filter((item: any) => item?.page_uuid === pageUuid || item?.result?.page_uuid === pageUuid)
    .at(-1)
}

function getAttemptOptionKeys(attempt: any): string[] {
  const keys = [
    ...(Array.isArray(attempt?.answer?.option_ids) ? attempt.answer.option_ids : []),
    ...(Array.isArray(attempt?.result?.option_ids) ? attempt.result.option_ids : []),
    ...(Array.isArray(attempt?.result?.selected) ? attempt.result.selected : []),
    attempt?.answer?.option_id,
    attempt?.result?.answer?.option_id,
    attempt?.result?.option_id,
    typeof attempt?.result?.selected === 'string' ? attempt.result.selected : null,
    attempt?.feedback_key,
  ]
  return keys.filter(Boolean).map(String)
}
