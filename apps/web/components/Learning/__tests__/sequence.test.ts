import { describe, expect, test } from 'bun:test'
import { addBranchAfter, addPath, insertAfter, linearSequence, movePage, orderedPageUuids, reconcile, removeBranch, removePath, sequenceIssues, setBranchOn } from '../editor/sequence'
import { freshRule, readRule, ruleSummary, writeRule } from '../editor/branchRules'

const choice = { target: 'answer:p1.q', key: 'p1.result.questions.q.option_ids', label: 'Pick', path: '', source: 'answer' as const, pageUuid: 'p1', valueType: 'multiple_choice' as const, options: [{ value: 'a', label: 'Apples' }, { value: 'b', label: 'Bananas' }] }
const on = { source: 'answer' as const, key: choice.key }

function withBranch() {
  const { sequence, branch } = addBranchAfter(linearSequence(['p1', 'p2', 'p3']), 'p1')
  let next = setBranchOn(sequence, branch.id, on, 'Pick', () => null)
  next = addPath(next, branch.id, freshRule(choice, on))
  return { sequence: next, branchId: branch.id, pathId: (next.items![1] as any).paths[1].id }
}

describe('sequence editing', () => {
  test('a page added after a branch goes after it in the main stack', () => {
    const { sequence } = withBranch()
    const next = insertAfter(sequence, 'p4', 'p2')
    expect(orderedPageUuids(next)).toEqual(['p1', 'p2', 'p4', 'p3'])
    expect(next.items!.map((item) => item.type)).toEqual(['page', 'branch', 'page', 'page', 'page'])
  })

  test('pages drag between the main stack and paths', () => {
    const { sequence, branchId, pathId } = withBranch()
    const intoPath = movePage(sequence, 'p2', { branchId, pathId, index: 0 })
    expect((intoPath.items![1] as any).paths[1].pages).toEqual(['p2'])
    const toDefault = movePage(intoPath, 'p2', { branchId, pathId: 'default', index: 0 })
    expect((toDefault.items![1] as any).paths.map((path: any) => path.pages)).toEqual([['p2'], []])
    const back = movePage(toDefault, 'p2', { index: 0 })
    expect(orderedPageUuids(back)).toEqual(['p2', 'p1', 'p3'])
  })

  test('a new page after a page inside a path stays in that path', () => {
    const { sequence, branchId, pathId } = withBranch()
    const next = insertAfter(movePage(sequence, 'p2', { branchId, pathId, index: 0 }), 'p9', 'p2')
    expect((next.items![1] as any).paths[1].pages).toEqual(['p2', 'p9'])
  })

  test('a branch after a page in a path goes after that branch', () => {
    const { sequence, branchId, pathId } = withBranch()
    const moved = movePage(sequence, 'p2', { branchId, pathId, index: 0 })
    const { sequence: next, lifted } = addBranchAfter(moved, 'p2')
    expect(lifted).toBe(true)
    expect(next.items!.map((item) => item.type)).toEqual(['page', 'branch', 'branch', 'page'])
  })

  test('removing a path or a branch keeps its pages', () => {
    const { sequence, branchId, pathId } = withBranch()
    const moved = movePage(sequence, 'p2', { branchId, pathId, index: 0 })
    expect((removePath(moved, branchId, pathId).items![1] as any).paths).toHaveLength(1)
    expect(orderedPageUuids(removePath(moved, branchId, pathId))).toEqual(['p1', 'p2', 'p3'])
    const flat = removeBranch(moved, branchId)
    expect(flat.items!.every((item) => item.type === 'page')).toBe(true)
    expect(orderedPageUuids(flat)).toEqual(['p1', 'p2', 'p3'])
  })

  test('reconcile drops deleted pages', () => {
    const { sequence, branchId, pathId } = withBranch()
    expect(orderedPageUuids(reconcile(movePage(sequence, 'p2', { branchId, pathId, index: 0 }), ['p1', 'p3']))).toEqual(['p1', 'p3'])
  })

  test('issues: an unfinished rule, a repeated rule, a question after the branch', () => {
    const { sequence, branchId } = withBranch()
    expect(sequenceIssues(sequence)).toEqual([])
    expect(sequenceIssues(addPath(sequence, branchId, writeRule(on, 'is', '', choice)))[0]).toContain('needs something to follow')
    expect(sequenceIssues(addPath(sequence, branchId, freshRule(choice, on)))[0]).toContain('same rule')
    const late = { source: 'answer' as const, key: 'p3.result.option_ids' }
    expect(sequenceIssues(addPath(sequence, branchId, { op: 'eq', left: late, right: 'x' }))[0]).toContain('comes after it')
  })
})

describe('branch rules', () => {
  test('choices read and write as is / is not', () => {
    expect(readRule(writeRule(on, 'is', 'b', choice), choice)).toEqual({ op: 'is', right: 'b' })
    expect(readRule(writeRule(on, 'is_not', 'b', choice), choice)).toEqual({ op: 'is_not', right: 'b' })
    expect(ruleSummary(writeRule(on, 'is_not', 'b', choice), choice)).toBe('is not Bananas')
    expect(freshRule(choice, on, ['a']).right).toBe('b')
  })

  test('rules it cannot show are custom', () => {
    expect(ruleSummary({ op: 'and', conditions: [] }, choice)).toBe('Custom rule')
    expect(ruleSummary(undefined, choice)).toBe('Default')
  })
})
