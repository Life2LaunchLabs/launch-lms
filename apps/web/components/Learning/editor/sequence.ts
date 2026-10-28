/* eslint-disable no-unused-vars */
import type { BranchPath, ConditionOperand, Sequence, SequenceBranch, SequenceItem } from '@components/Learning/generated/content'

// The activity's order, as the editor changes it: a stack of pages and
// branches, one level deep. Every helper returns a new sequence.

export type Where = { branchId?: string; pathId?: string; index: number }
export type Located = { main: true; index: number } | { main: false; branch: SequenceBranch; path: BranchPath; branchIndex: number; index: number }

const randomId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

export function linearSequence(pageUuids: string[]): Sequence {
  return { version: 1, items: pageUuids.map((page_uuid) => ({ type: 'page', page_uuid })) }
}

export function sequenceItems(sequence: Sequence | null | undefined): SequenceItem[] {
  return sequence?.items || []
}

/** Pages in reading order (each branch's paths in turn). */
export function orderedPageUuids(sequence: Sequence): string[] {
  return sequenceItems(sequence).flatMap((item) => item.type === 'page' ? [item.page_uuid] : item.paths.flatMap((path) => path.pages || []))
}

export function locate(sequence: Sequence, pageUuid: string): Located | null {
  const items = sequenceItems(sequence)
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (item.type === 'page' && item.page_uuid === pageUuid) return { main: true, index }
    if (item.type === 'branch') {
      for (const path of item.paths) {
        const at = (path.pages || []).indexOf(pageUuid)
        if (at >= 0) return { main: false, branch: item, path, branchIndex: index, index: at }
      }
    }
  }
  return null
}

/** Drops pages that no longer exist; pages the sequence leaves out stay out (they are retired). */
export function reconcile(sequence: Sequence, pageUuids: string[]): Sequence {
  const known = new Set(pageUuids)
  const next = clone(sequence)
  next.items = sequenceItems(next).filter((item) => item.type !== 'page' || known.has(item.page_uuid))
  next.items.forEach((item) => {
    if (item.type === 'branch') item.paths.forEach((path) => { path.pages = (path.pages || []).filter((uuid) => known.has(uuid)) })
  })
  return next
}

export function removePage(sequence: Sequence, pageUuid: string): Sequence {
  return reconcile(sequence, orderedPageUuids(sequence).filter((uuid) => uuid !== pageUuid))
}

/** Puts a page right after another one, in the same path; after nothing (or an unplaced page) it goes last. */
export function insertAfter(sequence: Sequence, pageUuid: string, afterUuid?: string | null): Sequence {
  const next = removePage(sequence, pageUuid)
  const items = next.items || []
  const at = afterUuid ? locate(next, afterUuid) : null
  if (!at) items.push({ type: 'page', page_uuid: pageUuid })
  else if (at.main) items.splice(at.index + 1, 0, { type: 'page', page_uuid: pageUuid })
  else {
    const path = (items[at.branchIndex] as SequenceBranch).paths.find((item) => item.id === at.path.id)!
    path.pages = [...(path.pages || [])]
    path.pages.splice(at.index + 1, 0, pageUuid)
  }
  return { ...next, items }
}

/** Moves a page to a spot: `index` in the main stack, or in one branch path. */
export function movePage(sequence: Sequence, pageUuid: string, where: Where): Sequence {
  const items = sequenceItems(sequence)
  if (!where.branchId) {
    const anchor = items[where.index]
    if (anchor?.type === 'page' && anchor.page_uuid === pageUuid) return sequence
    const next = removePage(sequence, pageUuid)
    const nextItems = next.items || []
    const index = anchor ? nextItems.findIndex((item) => item === anchor || (item.type === anchor.type && (item.type === 'page' ? item.page_uuid === (anchor as any).page_uuid : item.id === (anchor as any).id))) : -1
    nextItems.splice(index >= 0 ? index : nextItems.length, 0, { type: 'page', page_uuid: pageUuid })
    return { ...next, items: nextItems }
  }
  const branch = items.find((item) => item.type === 'branch' && item.id === where.branchId) as SequenceBranch | undefined
  const path = branch?.paths.find((item) => item.id === where.pathId)
  if (!branch || !path) return sequence
  const anchor = (path.pages || [])[where.index]
  if (anchor === pageUuid) return sequence
  const next = removePage(sequence, pageUuid)
  const target = (next.items || []).find((item) => item.type === 'branch' && item.id === branch.id) as SequenceBranch
  const targetPath = target.paths.find((item) => item.id === path.id)!
  const pages = [...(targetPath.pages || [])]
  const index = anchor ? pages.indexOf(anchor) : -1
  pages.splice(index >= 0 ? index : pages.length, 0, pageUuid)
  targetPath.pages = pages
  return next
}

export function findBranch(sequence: Sequence, branchId: string): SequenceBranch | undefined {
  return sequenceItems(sequence).find((item) => item.type === 'branch' && item.id === branchId) as SequenceBranch | undefined
}

function mapBranch(sequence: Sequence, branchId: string, change: (branch: SequenceBranch) => SequenceBranch): Sequence {
  return { ...sequence, items: sequenceItems(sequence).map((item) => item.type === 'branch' && item.id === branchId ? change(clone(item)) : item) }
}

export function defaultPath(branch: SequenceBranch): BranchPath | undefined {
  return branch.paths.find((path) => !path.rule)
}

/** A new branch right after a page; after a page inside a path it goes after that path's branch, since branches can't nest. */
export function addBranchAfter(sequence: Sequence, afterUuid?: string | null): { sequence: Sequence; branch: SequenceBranch; lifted: boolean } {
  const branch: SequenceBranch = { type: 'branch', id: randomId('br_'), paths: [{ id: 'default', pages: [] }] }
  const items = [...sequenceItems(sequence)]
  const at = afterUuid ? locate(sequence, afterUuid) : null
  const index = !at ? items.length : at.main ? at.index + 1 : at.branchIndex + 1
  items.splice(index, 0, branch)
  return { sequence: { ...sequence, items }, branch, lifted: Boolean(at && !at.main) }
}

/** Removes a branch; its pages stay where it was, for everyone, path by path. */
export function removeBranch(sequence: Sequence, branchId: string): Sequence {
  return {
    ...sequence,
    items: sequenceItems(sequence).flatMap((item) => item.type === 'branch' && item.id === branchId
      ? [...item.paths.filter((path) => !path.rule), ...item.paths.filter((path) => path.rule)].flatMap((path) => (path.pages || []).map((page_uuid) => ({ type: 'page' as const, page_uuid })))
      : [item]),
  }
}

/** Adds a path; `rule` reads what the branch follows. */
export function addPath(sequence: Sequence, branchId: string, rule: any): Sequence {
  return mapBranch(sequence, branchId, (branch) => {
    branch.paths.push({ id: randomId('path_'), rule, pages: [] })
    return branch
  })
}

/** Removes a path; its pages move to the Default path. */
export function removePath(sequence: Sequence, branchId: string, pathId: string): Sequence {
  return mapBranch(sequence, branchId, (branch) => {
    const path = branch.paths.find((item) => item.id === pathId)
    if (!path || !path.rule) return branch
    branch.paths = branch.paths.filter((item) => item.id !== pathId)
    const fallback = defaultPath(branch)
    if (fallback) fallback.pages = [...(fallback.pages || []), ...(path.pages || [])]
    return branch
  })
}

/** Points the branch at something new; every path gets a fresh rule on it. */
export function setBranchOn(sequence: Sequence, branchId: string, on: ConditionOperand, label: string | undefined, ruleFor: (index: number) => any): Sequence {
  return mapBranch(sequence, branchId, (branch) => {
    branch.on = on
    branch.label = label ? label.slice(0, 120) : undefined
    let ruled = 0
    branch.paths = branch.paths.map((path) => path.rule ? { ...path, rule: ruleFor(ruled++) } : path)
    return branch
  })
}

export function setPathRule(sequence: Sequence, branchId: string, pathId: string, rule: any): Sequence {
  return mapBranch(sequence, branchId, (branch) => {
    branch.paths = branch.paths.map((path) => path.id === pathId && path.rule ? { ...path, rule } : path)
    return branch
  })
}

/** What still stops the sequence from saving: the same checks the server makes on rules. */
export function sequenceIssues(sequence: Sequence): string[] {
  const issues: string[] = []
  const answeredBefore = new Set<string>()
  sequenceItems(sequence).forEach((item, index) => {
    if (item.type === 'page') {
      answeredBefore.add(item.page_uuid)
      return
    }
    const name = item.label ? `The branch on ${item.label}` : `Branch ${index + 1}`
    const seen = new Set<string>()
    item.paths.forEach((path) => {
      const rule: any = path.rule
      if (!rule) return
      if (incomplete(rule)) issues.push(`${name} needs something to follow and a value on every path`)
      const signature = JSON.stringify(rule)
      if (seen.has(signature)) issues.push(`${name} has two paths with the same rule`)
      seen.add(signature)
      if (answerPages(rule).some((page) => !answeredBefore.has(page))) issues.push(`${name} follows a question that comes after it`)
    })
    item.paths.forEach((path) => (path.pages || []).forEach((uuid) => answeredBefore.add(uuid)))
  })
  return [...new Set(issues)]
}

function incomplete(rule: any): boolean {
  if (rule.op === 'and' || rule.op === 'or') return (rule.conditions || []).some(incomplete)
  if (rule.op === 'not') return incomplete(rule.condition || {})
  return !String(rule.left?.key || '') || (rule.op !== 'exists' && (rule.right === undefined || rule.right === null || rule.right === ''))
}

function answerPages(rule: any): string[] {
  if (rule.op === 'and' || rule.op === 'or') return (rule.conditions || []).flatMap(answerPages)
  if (rule.op === 'not') return answerPages(rule.condition || {})
  const page = rule.left?.source === 'answer' ? String(rule.left.key || '').split('.')[0] : ''
  return page ? [page] : []
}
