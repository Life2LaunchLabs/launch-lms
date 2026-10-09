import { findQuestionBlocks } from '@components/Learning/schema'
import { normalizeQuestionInputs, normalizeQuestionOptions } from './utils'

// The values a flow can branch on: this activity's answers (including which
// continue button was pressed), built-in learner fields, and org variables.
export type FlowVariable = {
  target: string
  key: string
  label: string
  path: string
  source: 'answer' | 'variable'
  pageUuid?: string
  pageTitle?: string
  valueType: 'text' | 'number' | 'option' | 'multiple_choice' | 'boolean' | 'image' | 'button'
  options?: Array<{ value: string; label: string }>
}

function findContinueButtons(page: any): any[] {
  const stacks = [page?.content?.blocks || [], ...Object.values(page?.content?.variants?.overrides || {}).map((override: any) => override?.blocks || [])]
  const seen = new Set<string>()
  return stacks.flat().filter((block: any) => block?.type === 'button' && (block.content?.action || 'continue') === 'continue' && !seen.has(block.id) && seen.add(block.id))
}

function pathSegment(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(clean) ? clean : `item_${clean || 'variable'}`
}

function activityVariablePath(label: string, uniqueId: string) {
  return `this_activity.${pathSegment(label)}__${pathSegment(uniqueId)}`
}

function localVariables(pages: any[]): FlowVariable[] {
  const variables: FlowVariable[] = []
  pages.forEach((page) => {
    // Pressing a continue button completes the page with `<page>.button`.
    const buttons = findContinueButtons(page)
    if (buttons.length) {
      const key = `${page.page_uuid}.button`
      variables.push({ target: `answer:${key}`, key, label: 'Button pressed', path: activityVariablePath(`${page.title || 'page'} button`, page.page_uuid), source: 'answer', pageUuid: page.page_uuid, pageTitle: page.title || 'Untitled page', valueType: 'button', options: buttons.map((block: any) => ({ value: String(block.id), label: String(block.content?.label || 'Continue') })) })
    }
    findQuestionBlocks(page).forEach((block: any) => {
      const questionLabel = String(block.content?.label || block.content?.title || 'Question')
      if (['multiple_choice', 'categorized_multi_select'].includes(block.kind)) {
        const key = `${page.page_uuid}.result.questions.${block.id}.option_ids`
        variables.push({
          target: `answer:${key}`,
          key,
          label: questionLabel,
          path: activityVariablePath(questionLabel, String(block.id)),
          source: 'answer',
          pageUuid: page.page_uuid,
          pageTitle: page.title || 'Untitled page',
          valueType: 'multiple_choice',
          options: normalizeQuestionOptions(block.content?.options || []).map((option) => ({ value: option.id, label: option.text })),
        })
        return
      }
      if (block.kind === 'text_input') {
        const inputs = normalizeQuestionInputs(block.content?.inputs || [])
        inputs.forEach((input) => {
          const label = inputs.length > 1 ? `${questionLabel} / ${input.label || 'Response'}` : input.label || questionLabel
          const key = `${page.page_uuid}.result.questions.${block.id}.inputs.${input.id}.${input.input_type === 'number' ? 'value' : 'text'}`
          variables.push({ target: `answer:${key}`, key, label, path: activityVariablePath(label, `${block.id}_${input.id}`), source: 'answer', pageUuid: page.page_uuid, pageTitle: page.title || 'Untitled page', valueType: input.input_type === 'number' ? 'number' : 'text' })
        })
        return
      }
      if (block.kind === 'image_upload') {
        const key = `${page.page_uuid}.result.questions.${block.id}.url`
        variables.push({
          target: `answer:${key}`,
          key,
          label: questionLabel,
          path: activityVariablePath(questionLabel, String(block.id)),
          source: 'answer',
          pageUuid: page.page_uuid,
          pageTitle: page.title || 'Untitled page',
          valueType: 'image',
        })
      }
    })
  })
  return variables
}

const BUILTIN_FLOW_VARIABLES: FlowVariable[] = [
  { target: 'user.username', key: 'user.username', path: 'profile.username', label: 'Username', source: 'variable', valueType: 'text' },
  { target: 'user.email', key: 'user.email', path: 'profile.email', label: 'Email', source: 'variable', valueType: 'text' },
  { target: 'user.email_verified', key: 'user.email_verified', path: 'profile.email_verified', label: 'Email verified', source: 'variable', valueType: 'boolean' },
  { target: 'user.details.variables.age', key: 'user.details.variables.age', path: 'profile.age', label: 'Age', source: 'variable', valueType: 'number' },
  { target: 'user.first_name', key: 'user.first_name', path: 'profile.first_name', label: 'First name', source: 'variable', valueType: 'text' },
  { target: 'user.last_name', key: 'user.last_name', path: 'profile.last_name', label: 'Last name', source: 'variable', valueType: 'text' },
  { target: 'user.bio', key: 'user.bio', path: 'profile.bio', label: 'Bio', source: 'variable', valueType: 'text' },
  { target: 'user.avatar_image', key: 'user.avatar_image', path: 'profile.avatar_image', label: 'Profile photo', source: 'variable', valueType: 'image' },
  { target: 'user.details.onboarding.next_step', key: 'user.details.onboarding.next_step', path: 'profile.onboarding_goal', label: 'Onboarding goal', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.display_name', key: 'user.portfolio.display_name', path: 'portfolio.display_name', label: 'Display name', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.headline', key: 'user.portfolio.headline', path: 'portfolio.headline', label: 'Headline', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.short_bio', key: 'user.portfolio.short_bio', path: 'portfolio.short_bio', label: 'Short bio', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.location_label', key: 'user.portfolio.location_label', path: 'portfolio.location_label', label: 'Location', source: 'variable', valueType: 'text' },
]

export function flowVariables(pages: any[], registry: any[]): FlowVariable[] {
  const custom = registry.map((variable) => {
    const valueType = String(variable.value_type || variable.valueType || 'text') as FlowVariable['valueType']
    return {
      target: `user.details.variables.${variable.key}`,
      key: `user.details.variables.${variable.key}`,
      path: String(variable.key),
      label: String(variable.label || variable.key),
      source: 'variable' as const,
      valueType,
      options: (Array.isArray(variable.options) ? variable.options : []).map((option: any, index: number) => ({ value: String(option?.id || option?.value || `option_${index + 1}`), label: String(option?.text || option?.label || '') })),
    }
  })
  const customTargets = new Set(custom.map((variable) => variable.target))
  return [...localVariables(pages), ...BUILTIN_FLOW_VARIABLES.filter((variable) => !customTargets.has(variable.target)), ...custom]
}
