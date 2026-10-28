import type { FlowVariable } from './flowVariables'

// A branch path's rule as the editor shows it: one comparison on what the
// branch follows. Anything else (and, or, other shapes) is a "Custom rule".

export type RuleOp = 'is' | 'is_not' | 'contains' | 'more' | 'less' | 'answered'
export type RuleView = { op: RuleOp; right: any }

const LABELS: Record<RuleOp, string> = { is: 'is', is_not: 'is not', contains: 'contains', more: 'is more than', less: 'is less than', answered: 'is answered' }

const listValued = (variable?: FlowVariable | null) => variable?.valueType === 'multiple_choice'

export function opsFor(variable?: FlowVariable | null): Array<{ value: RuleOp; label: string }> {
  const ops: RuleOp[] = !variable ? ['is']
    : variable.valueType === 'number' ? ['is', 'more', 'less']
      : variable.valueType === 'text' ? ['contains', 'is', 'is_not', 'answered']
        : variable.valueType === 'image' ? ['answered']
          : ['is', 'is_not']
  return ops.map((value) => ({ value, label: LABELS[value] }))
}

/** Values to pick from, or null when the value is typed. */
export function valuesFor(variable?: FlowVariable | null): Array<{ value: any; label: string }> | null {
  if (!variable) return null
  if (variable.valueType === 'boolean') return [{ value: true, label: 'Yes' }, { value: false, label: 'No' }]
  if (variable.options?.length) return variable.options
  return null
}

export function writeRule(on: { source: string; key: string }, op: RuleOp, right: any, variable?: FlowVariable | null): any {
  const left = { source: on.source, key: on.key }
  if (op === 'answered') return { op: 'exists', left }
  if (op === 'more') return { op: 'gt', left, right: numeric(right) }
  if (op === 'less') return { op: 'lt', left, right: numeric(right) }
  if (op === 'contains') return { op: 'contains', left, right }
  if (listValued(variable)) return op === 'is' ? { op: 'contains', left, right } : { op: 'not', condition: { op: 'contains', left, right } }
  if (variable?.valueType === 'number') return { op: op === 'is' ? 'eq' : 'ne', left, right: numeric(right) }
  return { op: op === 'is' ? 'eq' : 'ne', left, right }
}

export function readRule(rule: any, variable?: FlowVariable | null): RuleView | null {
  if (!rule || typeof rule !== 'object') return null
  if (rule.op === 'not') {
    const inner = rule.condition
    return inner?.op === 'contains' && listValued(variable) && sameOperand(inner.left, variable) ? { op: 'is_not', right: inner.right } : null
  }
  if (!sameOperand(rule.left, variable)) return null
  if (rule.op === 'exists') return { op: 'answered', right: undefined }
  if (rule.op === 'gt') return { op: 'more', right: rule.right }
  if (rule.op === 'lt') return { op: 'less', right: rule.right }
  if (rule.op === 'contains') return { op: listValued(variable) ? 'is' : 'contains', right: rule.right }
  if (rule.op === 'eq') return { op: 'is', right: rule.right }
  if (rule.op === 'ne') return { op: 'is_not', right: rule.right }
  return null
}

/** A first rule for a new path: the next option not yet used, else empty. */
export function freshRule(variable: FlowVariable | null | undefined, on: { source: string; key: string }, taken: any[] = []): any {
  const ops = opsFor(variable)
  const values = valuesFor(variable)
  const right = values ? (values.find((option) => !taken.some((value) => JSON.stringify(value) === JSON.stringify(option.value))) || values[0]).value : ''
  return writeRule(on, ops[0].value, ops[0].value === 'answered' ? undefined : right, variable)
}

export function ruleSummary(rule: any, variable?: FlowVariable | null): string {
  if (!rule) return 'Default'
  const view = readRule(rule, variable)
  if (!view) return 'Custom rule'
  if (view.op === 'answered') return LABELS.answered
  const label = valuesFor(variable)?.find((option) => JSON.stringify(option.value) === JSON.stringify(view.right))?.label
  const value = label ?? (view.right === '' || view.right === undefined || view.right === null ? '…' : `"${view.right}"`)
  const text = `${LABELS[view.op]} ${value}`
  return text.length > 34 ? `${text.slice(0, 32).trim()}…` : text
}

/** What a branch follows, looked up from its `on` (or its first rule, for older branches). */
export function branchVariable(branch: { on?: any; paths: Array<{ rule?: any }> }, variables: FlowVariable[]): FlowVariable | null {
  const operand = branch.on || firstOperand(branch.paths.find((path) => path.rule)?.rule)
  if (!operand?.key) return null
  return variables.find((variable) => variable.key === operand.key && variable.source === sourceKind(operand.source)) || null
}

export function operandOf(variable: FlowVariable): { source: 'answer' | 'variable'; key: string } {
  return { source: variable.source, key: variable.key }
}

function firstOperand(rule: any): any {
  if (!rule) return null
  if (rule.op === 'not') return firstOperand(rule.condition)
  if (rule.op === 'and' || rule.op === 'or') return firstOperand(rule.conditions?.[0])
  return rule.left
}

function sourceKind(source: string) {
  return source === 'answer' ? 'answer' : 'variable'
}

function sameOperand(left: any, variable?: FlowVariable | null) {
  return Boolean(left && (!variable || (left.key === variable.key && sourceKind(left.source) === variable.source)))
}

function numeric(value: any) {
  const number = Number(value)
  return value === '' || value === null || value === undefined || Number.isNaN(number) ? '' : number
}
