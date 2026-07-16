import type { CSSProperties } from 'react'
import {
  findQuestionBlocks,
  getBlockCompletion,
  type LearningBlock,
  type LearningImageBlock,
  type LearningQuestionBlock,
  type LearningTextBlock,
} from '@components/Learning/schema'
import type { ActivityGradingMode } from './types'

export const EMPTY_PARAGRAPH = { type: 'paragraph' }

export function createTextBlock(node: any = EMPTY_PARAGRAPH): LearningTextBlock {
  return {
    id: createBlockId(),
    type: 'text',
    design: { width: 100, align: 'left' },
    content: { node, nodes: [node] },
  }
}

export function getTextBlockNodes(block: LearningTextBlock | any): any[] {
  const nodes = block?.content?.nodes
  if (Array.isArray(nodes) && nodes.length) return nodes
  return [block?.content?.node || EMPTY_PARAGRAPH]
}

export function createImageBlock(): LearningImageBlock {
  return {
    id: createBlockId(),
    type: 'image',
    design: { width: 100, align: 'center', height: 220 },
    content: { src: '', alt: '' },
  }
}

export function createButtonBlock(): any {
  return {
    id: createBlockId(),
    type: 'button',
    design: { width: 100, align: 'center', variant: 'secondary' },
    content: { label: 'Go to page', destination_page_uuid: '' },
  }
}

export function createQuestionBlock(kind: 'multiple_choice' | 'text_input' | 'image_upload'): LearningQuestionBlock {
  if (kind === 'multiple_choice') {
    const options = [
      { id: createOptionId(), text: 'Option 1' },
      { id: createOptionId(), text: 'Option 2' },
    ]
    return {
      id: createBlockId(),
      type: 'question',
      kind,
      design: { width: 100, align: 'left' },
      content: { options },
      scoring: {
        mode: 'points',
        points: 1,
        score_policy: 'exact_match',
        correct_option_ids: [options[0].id],
      },
      completion: {
        min_selections: 1,
        max_selections: 1,
      },
    }
  }

  if (kind === 'image_upload') {
    return {
      id: createBlockId(),
      type: 'question',
      kind,
      design: { width: 100, align: 'left' },
      content: { label: 'Image' },
      scoring: {
        mode: 'manual',
        points: 1,
      },
      completion: {
        required: true,
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
    scoring: {
      mode: 'completion',
      points: 1,
    },
    completion: {
      inputs: {
        [inputId]: { required: true, min_words: 1, max_words: 0, points: 1 },
      },
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
        variant: String(input?.variant || input?.type || 'short_answer'),
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
    let blocks: LearningBlock[] = Array.isArray(page.content?.blocks) ? page.content.blocks : []

    // Legacy pages kept the single question's scoring/completion at page level —
    // relocate into the block so the editor always works block-level.
    const questions = blocks.filter((block: any) => block?.type === 'question')
    const pageScoring = page.scoring && Object.keys(page.scoring).length ? page.scoring : null
    const pageCompletion = page.completion && Object.keys(page.completion).length ? page.completion : null
    if (questions.length === 1 && (pageScoring || pageCompletion)) {
      blocks = blocks.map((block: any) => {
        if (block?.type !== 'question') return block
        return {
          ...block,
          scoring: block.scoring && Object.keys(block.scoring).length ? block.scoring : (pageScoring || {}),
          completion: block.completion && Object.keys(block.completion).length ? block.completion : (pageCompletion || {}),
        }
      })
    }

    blocks = blocks.flatMap((block: any) => splitTextInputBlock(block))
    blocks = blocks.map((block: any) => {
      if (block?.type !== 'text') return block
      const nodes = getTextBlockNodes(block)
      return {
        ...block,
        content: {
          ...(block.content || {}),
          node: nodes[0] || EMPTY_PARAGRAPH,
          nodes,
        },
      }
    })

    return {
      ...page,
      content: {
        ...(page.content || {}),
        version: page.content?.version || 2,
        blocks,
      },
    }
  })
}

// One row is one block: legacy text_input blocks could hold many inputs grouped
// into sections — split them so each block is a single row (1 input, or 2 side
// by side), carrying its own completion rules and variable bindings.
export function splitTextInputBlock(block: any): any[] {
  if (block?.type !== 'question' || block?.kind !== 'text_input') return [block]
  const inputs = Array.isArray(block.content?.inputs) ? block.content.inputs : []
  const sections = groupInputRows(inputs)
  if (sections.length <= 1) return [block]

  const completion = block.completion || {}
  const rules = completion.inputs || {}
  const bindings = (completion.variable_bindings || completion.variableBindings || {}).inputs || {}

  return sections.map((sectionInputs, index) => {
    const ids = sectionInputs.map((input: any) => String(input.id))
    return {
      ...block,
      id: index === 0 ? block.id : createBlockId(),
      content: { ...(block.content || {}), inputs: sectionInputs },
      completion: {
        ...completion,
        inputs: Object.fromEntries(Object.entries(rules).filter(([id]) => ids.includes(id))),
        variable_bindings: {
          ...(completion.variable_bindings || {}),
          inputs: Object.fromEntries(Object.entries(bindings).filter(([id]) => ids.includes(id))),
        },
      },
    }
  })
}

function groupInputRows(inputs: any[]): any[][] {
  const sections: any[][] = []
  const consumed = new Set<string>()
  inputs.forEach((input, index) => {
    const id = String(input?.id ?? index)
    if (consumed.has(id)) return
    const sectionId = input?.section_id || input?.sectionId
    if (sectionId) {
      const grouped = inputs.filter((item) => (item?.section_id || item?.sectionId) === sectionId).slice(0, 2)
      grouped.forEach((item, itemIndex) => consumed.add(String(item?.id ?? `${index}_${itemIndex}`)))
      sections.push(grouped)
      return
    }
    const next = inputs[index + 1]
    if (input?.width === 'half' && next && !(next.section_id || next.sectionId) && next.width === 'half') {
      consumed.add(id)
      consumed.add(String(next.id))
      sections.push([input, next])
      return
    }
    consumed.add(id)
    sections.push([input])
  })
  return sections
}

export function getBlockStyle(block: LearningBlock): CSSProperties {
  const design = block.design || {}
  const width = Math.max(25, Math.min(100, Number(design.width) || 100))
  const align = design.align || 'left'
  const style: CSSProperties = {
    width: `${width}%`,
    marginLeft: align === 'right' ? 'auto' : align === 'center' ? 'auto' : undefined,
    marginRight: align === 'left' ? 'auto' : align === 'center' ? 'auto' : undefined,
  }
  if (block.type === 'text' && design.text_color) {
    style.color = design.text_color
    ;(style as any)['--learning-text-color'] = design.text_color
  }
  return style
}

export function blockLabel(block: LearningBlock) {
  if (block.type === 'button') return 'Page button'
  if (block.type === 'text') return 'Text block'
  if (block.type === 'image') return 'Image block'
  if (block.kind === 'text_input') return 'Text input question'
  if (block.kind === 'image_upload') return 'Image upload question'
  return 'Multiple choice question'
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
    minimum_score_percent: Number(grading.minimum_score_percent ?? 70),
    success_message: grading.success_message || '',
    failure_message: grading.failure_message || '',
  }
}

export type VariantSourceOption = {
  pageUuid: string
  blockId: string
  label: string
  options: Array<{ id: string; text: string }>
  isPrior: boolean
}

// Every single-select MCQ block on other pages can drive this page's variants;
// sources that come after this page are flagged instead of hidden. Question
// labels disambiguate pages that hold more than one MCQ.
export function getVariantSourceOptions(pages: any[], page: any): VariantSourceOption[] {
  const pageIndex = pages.findIndex((item) => item.page_uuid === page.page_uuid)
  const sources: VariantSourceOption[] = []
  pages.forEach((item, index) => {
    if (item.page_uuid === page.page_uuid) return
    const questions = findQuestionBlocks(item).filter((question) => question.kind === 'multiple_choice')
    questions.forEach((question, questionIndex) => {
      const completion = getBlockCompletion(item, question)
      if (Math.max(1, Number(completion?.max_selections ?? 1)) > 1) return
      const options = normalizeQuestionOptions(question.content?.options)
      const questionLabel = String(question.content?.label || '').trim()
      const fallback = `${item.title || 'Untitled page'}${questions.length > 1 ? ` · question ${questionIndex + 1}` : ''}`
      sources.push({
        pageUuid: item.page_uuid,
        blockId: question.id,
        label: `${index + 1}. ${questionLabel || fallback}`,
        options,
        isPrior: index < pageIndex,
      })
    })
  })
  return sources
}

// Canonical variant key order for a page: default, source options, correctness.
export function getVariantKeyList(source: VariantSourceOption | null): Array<{ key: string; label: string }> {
  return [
    { key: 'default', label: 'Default' },
    ...(source?.options || []).map((option, index) => ({ key: option.id, label: option.text || `Option ${index + 1}` })),
    { key: 'correct', label: 'Correct' },
    { key: 'incorrect', label: 'Incorrect' },
  ]
}

// Only variants with an override are "live"; default always is. Stale override
// keys (e.g. a deleted option) are kept visible so they can be removed.
export function getEnabledVariantKeys(page: any, source: VariantSourceOption | null): Array<{ key: string; label: string }> {
  const overrides = page?.content?.variants?.overrides || {}
  const canonical = getVariantKeyList(source)
  const enabled = canonical.filter((item) => item.key === 'default' || overrides[item.key])
  Object.keys(overrides).forEach((key) => {
    if (!canonical.some((item) => item.key === key)) enabled.push({ key, label: key })
  })
  return enabled
}

export function getVariantSource(pages: any[], page: any): VariantSourceOption | null {
  const source = page?.content?.variants?.source || {}
  if (!source.page_uuid) return null
  const all = getVariantSourceOptions(pages, page)
  return all.find((item) => item.pageUuid === source.page_uuid && (!source.block_id || item.blockId === source.block_id))
    || all.find((item) => item.pageUuid === source.page_uuid)
    || null
}
