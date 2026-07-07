export type LearningPageType = 'video' | 'standard'

export type LearningBlockAlign = 'left' | 'center' | 'right'

export interface LearningBlockBase {
  id: string
  type: 'text' | 'image' | 'question'
  design?: {
    width?: number
    align?: LearningBlockAlign
    height?: number
    fit?: 'contain' | 'cover'
    text_color?: string
  }
}

export interface LearningTextBlock extends LearningBlockBase {
  type: 'text'
  content?: {
    node?: any
    nodes?: any[]
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
  scoring?: any
  completion?: any
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
  return findQuestionBlocks(pageOrContent)[0] || null
}

export function findQuestionBlocks(pageOrContent: LearningPageLike | any): LearningQuestionBlock[] {
  return getDefaultBlocks(pageOrContent).filter((block: any) => block?.type === 'question') as LearningQuestionBlock[]
}

// Question config lives on the block; legacy pages kept it at page level for
// their single question, so fall back there when the block carries none.
export function getBlockScoring(page: any, block: LearningQuestionBlock): any {
  if (block?.scoring && typeof block.scoring === 'object' && Object.keys(block.scoring).length) return block.scoring
  return page?.scoring || {}
}

export function getBlockCompletion(page: any, block: LearningQuestionBlock): any {
  if (block?.completion && typeof block.completion === 'object' && Object.keys(block.completion).length) return block.completion
  return page?.completion || {}
}

export function getQuestionAnswer(answer: any, blockId: string): any {
  return answer?.questions?.[blockId] || {}
}

export function setQuestionAnswer(answer: any, blockId: string, value: any): any {
  return {
    ...(answer || {}),
    questions: {
      ...(answer?.questions || {}),
      [blockId]: value,
    },
  }
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

  const sourceBlockId = variants.source?.block_id
  const questionResult = sourceBlockId ? attempt.result?.questions?.[sourceBlockId] : null

  const exactKey = getAttemptOptionKeys(attempt, questionResult).find((key) => overrides[key]?.blocks)
  if (exactKey) return overrides[exactKey].blocks

  const isCorrect = questionResult ? questionResult.is_correct : attempt.is_correct
  const correctnessKey = isCorrect === true
    ? 'correct'
    : isCorrect === false
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

function getAttemptOptionKeys(attempt: any, questionResult?: any): string[] {
  const keys = [
    ...(Array.isArray(questionResult?.option_ids) ? questionResult.option_ids : []),
    ...(Array.isArray(questionResult?.selected) ? questionResult.selected : []),
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
