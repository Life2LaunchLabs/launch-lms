import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTree, gapIds, gaugeOf, leafState, visibleRows, withCodes, type TreeNode } from '../requirementTree.ts'

const nodes: TreeNode[] = [
  { node_uuid: 'sb3', code: 'SB3', title: 'Higher education and career path skills', numbering: 'decimal' },
  { node_uuid: 'sb3-1', parent_node_uuid: 'sb3', title: 'Explore careers' },
  { node_uuid: 'sb3-2', parent_node_uuid: 'sb3', title: 'Plan for after high school' },
  { node_uuid: 'ccl', code: 'CCL', title: 'Career connected learning', rule: { kind: 'any', count: 2 } },
  { node_uuid: 'ccl-a', parent_node_uuid: 'ccl', code: 'CCL-AW', title: 'Awareness' },
  { node_uuid: 'ccl-b', parent_node_uuid: 'ccl', code: 'CCL-EX', title: 'Exploration' },
  { node_uuid: 'ccl-c', parent_node_uuid: 'ccl', code: 'CCL-PR', title: 'Preparation' },
]
const tree = buildTree(nodes)
const coverage: Record<string, string[]> = { 'sb3-1': ['resume'], 'ccl-a': ['resume', 'intern'], 'ccl-b': ['intern'] }
const coveredBy = (id: string) => coverage[id] || []

test('an any-N group with enough covered has no gaps and a full gauge', () => {
  assert.deepEqual(gapIds(tree, coveredBy), ['sb3-2'])
  const gauge = gaugeOf(tree, tree.byId.get('ccl')!, coveredBy)
  assert.deepEqual([gauge.got, gauge.need], [2, 2])
  assert.deepEqual(gauge.segments, [{ plan: 'resume', count: 1 }, { plan: 'intern', count: 1 }])
  assert.equal(leafState('ccl-c', coveredBy, new Set(gapIds(tree, coveredBy))), 'spare')
})

test('a group the plans only partly cover shows what it still needs', () => {
  const gauge = gaugeOf(tree, tree.byId.get('sb3')!, coveredBy)
  assert.deepEqual([gauge.got, gauge.need], [1, 2])
  assert.equal(leafState('sb3-2', coveredBy, new Set(['sb3-2'])), 'gap')
})

test('filtering to gaps opens the groups holding them; a search finds a requirement by code', () => {
  const rows = visibleRows(tree, { filter: 'gaps', open: new Set(), flags: new Set(), gaps: new Set(['sb3-2']) })
  assert.deepEqual(rows.map((row) => [row.node.node_uuid, row.depth]), [['sb3', 0], ['sb3-2', 1]])
  const found = visibleRows(tree, { query: 'ccl-pr', open: new Set(), flags: new Set(), gaps: new Set() })
  assert.deepEqual(found.map((row) => row.node.node_uuid), ['ccl', 'ccl-c'])
  assert.deepEqual(visibleRows(tree, { open: new Set(), flags: new Set(), gaps: new Set() }).map((row) => row.node.node_uuid), ['sb3', 'ccl'])
})

test('codes follow each parent’s numbering, as the API stores them', () => {
  const coded = withCodes([...nodes, { node_uuid: 'sb3-2-a', parent_node_uuid: 'sb3-2', title: 'FAFSA' }].map((node) => node.node_uuid === 'sb3-2' ? { ...node, numbering: 'lower_alpha' as const } : node), 'custom')
  assert.deepEqual(coded.map((node) => node.code), ['SB3', 'SB3.1', 'SB3.2', 'CCL', 'CCL-AW', 'CCL-EX', 'CCL-PR', 'SB3.2.a'])
})
