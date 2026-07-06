import type { CSSProperties } from 'react'
import { findQuestionBlock, type LearningBlock, type LearningImageBlock, type LearningQuestionBlock, type LearningTextBlock } from '@components/Learning/schema'
import type { ActivityGradingMode } from './types'

export const EMPTY_PARAGRAPH = { type: 'paragraph' }

export function createTextBlock(node: any = EMPTY_PARAGRAPH): LearningTextBlock {
  return {
    id: createBlockId(),
    type: 'text',
    design: { width: 100, align: 'left' },
    content: { node },
  }
}

export function createImageBlock(): LearningImageBlock {
  return {
    id: createBlockId(),
    type: 'image',
    design: { width: 100, align: 'center', height: 220 },
    content: { src: '', alt: '' },
  }
}

export function createQuestionBlock(kind: 'multiple_choice' | 'text_input'): LearningQuestionBlock {
  if (kind === 'multiple_choice') {
    return {
      id: createBlockId(),
      type: 'question',
      kind,
      design: { width: 100, align: 'left' },
      content: {
        options: [
          { id: createOptionId(), text: 'Option 1' },
          { id: createOptionId(), text: 'Option 2' },
        ],
      },
    }
  }

  const inputId = createInputId()
  return {
    id: createBlockId(),
    type: 'question',
    kind,
    design: { width: 100, align: 'left' },
    content: {
      inputs: [
        {
          id: inputId,
          section_id: inputId,
          label: 'Response',
          placeholder: '',
          variant: 'short_answer',
          width: 'full',
          height: 160,
        },
      ],
    },
  }
}

export function getDefaultQuestionPagePatch(block: LearningQuestionBlock) {
  if (block.kind === 'multiple_choice') {
    const options = normalizeQuestionOptions(block.content?.options)
    return {
      scoring: {
        mode: 'points',
        points: 1,
        score_policy: 'exact_match',
        correct_option_ids: options[0]?.id ? [options[0].id] : [],
      },
      completion: {
        min_selections: 1,
        max_selections: 1,
      },
    }
  }

  const inputs = normalizeQuestionInputs(block.content?.inputs)
  return {
    scoring: {
      mode: 'completion',
      points: 1,
    },
    completion: {
      inputs: inputs.reduce((acc: Record<string, any>, input) => ({
        ...acc,
        [input.id]: { required: true, min_words: 1, max_words: 0, points: 1 },
      }), {}),
    },
  }
}

export function normalizeQuestionOptions(options: any[]): Array<{ id: string; text: string }> {
  const normalized = Array.isArray(options)
    ? options.map((option, index) => ({
      id: String(option?.id || createOptionId(index)),
      text: String(option?.text || ''),
    }))
    : []
  if (normalized.length >= 2) return normalized
  return [
    ...normalized,
    ...Array.from({ length: 2 - normalized.length }, (_item, index) => ({
      id: createOptionId(normalized.length + index),
      text: `Option ${normalized.length + index + 1}`,
    })),
  ]
}

export function normalizeQuestionInputs(inputs: any[]): Array<{
  id: string
  section_id: string
  label: string
  placeholder: string
  variant: string
  width: string
  height: number
}> {
  const normalized = Array.isArray(inputs)
    ? inputs.map((input, index) => {
      const id = String(input?.id || createInputId(index))
      return {
        id,
        section_id: String(input?.section_id || input?.sectionId || id),
        label: String(input?.label || `Response ${index + 1}`),
        placeholder: String(input?.placeholder || ''),
        variant: String(input?.variant || 'short_answer'),
        width: String(input?.width || 'full'),
        height: Number(input?.height) || 160,
      }
    })
    : []
  return normalized.length ? normalized : [{
    id: 'response',
    section_id: 'response',
    label: 'Response',
    placeholder: '',
    variant: 'short_answer',
    width: 'full',
    height: 160,
  }]
}

export function createOptionId(seed?: number) {
  return seed === undefined ? `option_${createShortId()}` : `option_${seed + 1}_${createShortId()}`
}

export function createInputId(seed?: number) {
  return seed === undefined ? `input_${createShortId()}` : `input_${seed + 1}_${createShortId()}`
}

function createShortId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function createBlockId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `blk_${crypto.randomUUID().slice(0, 8)}`
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function getPageBlocks(page: any): LearningBlock[] {
  return Array.isArray(page?.content?.blocks) ? page.content.blocks : []
}

export function getEditorBlocks(page: any, variantKey = 'default'): LearningBlock[] {
  if (variantKey !== 'default') {
    const blocks = page?.content?.variants?.overrides?.[variantKey]?.blocks
    if (Array.isArray(blocks)) return blocks
  }
  return getPageBlocks(page)
}

export function cloneBlocksWithFreshIds(blocks: LearningBlock[]): LearningBlock[] {
  return cloneJson(blocks).map((block: LearningBlock) => ({
    ...block,
    id: createBlockId(),
  }))
}

export function normalizeInitialPages(pages: any[]) {
  return pages.map((page) => {
    if (page.page_type !== 'standard') return page
    return {
      ...page,
      content: {
        ...(page.content || {}),
        version: page.content?.version || 2,
        blocks: Array.isArray(page.content?.blocks) ? page.content.blocks : [],
      },
    }
  })
}

export function getBlockStyle(block: LearningBlock): CSSProperties {
  const design = block.design || {}
  const width = Math.max(25, Math.min(100, Number(design.width) || 100))
  const align = design.align || 'left'
  return {
    width: `${width}%`,
    marginLeft: align === 'right' ? 'auto' : align === 'center' ? 'auto' : undefined,
    marginRight: align === 'left' ? 'auto' : align === 'center' ? 'auto' : undefined,
  }
}

export function blockLabel(block: LearningBlock) {
  if (block.type === 'text') return 'Text block'
  if (block.type === 'image') return 'Image block'
  return block.kind === 'text_input' ? 'Text input question' : 'Multiple choice question'
}

export function withSequentialOrder(pages: any[]) {
  return pages.map((page, index) => ({ ...page, order: index + 1 }))
}

export function mergePatch(base: any, patch: any): any {
  const output = { ...(base || {}) }
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = mergePatch(output[key] || {}, value)
    } else {
      output[key] = value
    }
  })
  return output
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function getActivityGradingSettings(activity: any) {
  const grading = activity.settings?.grading || {}
  return {
    mode: (grading.mode || 'completion') as ActivityGradingMode,
    passing_score: Number(grading.passing_score ?? 1),
    success_message: grading.success_message || '',
  }
}

export function findPriorQuestionPage(pages: any[], page: any) {
  return pages
    .filter((item) => item.order < page.order)
    .reverse()
    .find((item) => findQuestionBlock(item)?.kind === 'multiple_choice')
}
