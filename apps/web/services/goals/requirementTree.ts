/**
 * A requirement framework as a tree: categories hold groups, groups hold requirements (the leaves a plan step can
 * count toward). Each node with children numbers them its own way and can need all of them or any N; the
 * framework numbers its categories. Pure, so the framework page and its tests share it.
 */

export type Numbering = 'decimal' | 'lower_alpha' | 'upper_alpha' | 'lower_roman' | 'upper_roman' | 'custom' | 'none'
export type Rule = { kind: 'all' } | { kind: 'any'; count: number }

export interface TreeNode {
  node_uuid: string
  parent_node_uuid?: string | null
  code?: string
  title: string
  description?: string
  position?: number
  metadata?: Record<string, unknown>
  numbering?: Numbering
  rule?: Rule
}

export const NUMBERING_OPTIONS: Array<{ value: Numbering; label: string }> = [
  { value: 'custom', label: 'Their own codes' },
  { value: 'decimal', label: '1, 2, 3' },
  { value: 'lower_alpha', label: 'a, b, c' },
  { value: 'upper_alpha', label: 'A, B, C' },
  { value: 'lower_roman', label: 'i, ii, iii' },
  { value: 'upper_roman', label: 'I, II, III' },
  { value: 'none', label: 'No codes' },
]

export interface Tree<T extends TreeNode = TreeNode> {
  nodes: T[]
  byId: Map<string, T>
  children: Map<string | null, T[]>
}

export function buildTree<T extends TreeNode>(nodes: T[]): Tree<T> {
  const byId = new Map(nodes.map((node) => [node.node_uuid, node]))
  const children = new Map<string | null, T[]>()
  nodes.forEach((node, index) => {
    const parent = node.parent_node_uuid && byId.has(node.parent_node_uuid) ? node.parent_node_uuid : null
    children.set(parent, [...(children.get(parent) || []), { ...node, position: node.position ?? index }])
  })
  children.forEach((list, key) => children.set(key, list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((node) => byId.get(node.node_uuid)!)))
  return { nodes, byId, children }
}

export const kidsOf = <T extends TreeNode>(tree: Tree<T>, id: string | null): T[] => tree.children.get(id) || []
export const isLeaf = (tree: Tree, id: string): boolean => !kidsOf(tree, id).length

export function leavesOf<T extends TreeNode>(tree: Tree<T>, node: T): T[] {
  const kids = kidsOf(tree, node.node_uuid)
  return kids.length ? kids.flatMap((kid) => leavesOf(tree, kid)) : [node]
}

export function allLeaves<T extends TreeNode>(tree: Tree<T>): T[] {
  return kidsOf(tree, null).flatMap((root) => leavesOf(tree, root))
}

/** The node's parents, top first. */
export function ancestorsOf<T extends TreeNode>(tree: Tree<T>, node: T): T[] {
  const result: T[] = []
  let parent = node.parent_node_uuid ? tree.byId.get(node.parent_node_uuid) : undefined
  while (parent && !result.includes(parent)) {
    result.unshift(parent)
    parent = parent.parent_node_uuid ? tree.byId.get(parent.parent_node_uuid) : undefined
  }
  return result
}

export const depthOf = (tree: Tree, node: TreeNode): number => ancestorsOf(tree, node).length

export function ruleOf(node: TreeNode): Rule {
  const rule = node.rule
  return rule && rule.kind === 'any' && Number.isInteger(rule.count) ? { kind: 'any', count: rule.count } : { kind: 'all' }
}

/** How many of a group's children it needs. */
export function needed(tree: Tree, node: TreeNode): number {
  const rule = ruleOf(node), count = kidsOf(tree, node.node_uuid).length
  return rule.kind === 'any' ? Math.min(rule.count, count) : count
}

/** The plans (by template uuid) that count toward a requirement, from the ones selected. */
export type CoveredBy = (nodeUuid: string) => string[] // eslint-disable-line no-unused-vars

/** Whether a node is met with the coverage given: a requirement when something covers it, a group by its rule. */
export function isMet(tree: Tree, node: TreeNode, coveredBy: CoveredBy): boolean {
  const kids = kidsOf(tree, node.node_uuid)
  if (!kids.length) return coveredBy(node.node_uuid).length > 0
  return kids.filter((kid) => isMet(tree, kid, coveredBy)).length >= needed(tree, node)
}

/** Requirements nothing covers that are still needed: under an "any N" group with N met, the rest aren't gaps. */
export function gapIds(tree: Tree, coveredBy: CoveredBy): string[] {
  const walk = (node: TreeNode): string[] => {
    const kids = kidsOf(tree, node.node_uuid)
    if (!kids.length) return coveredBy(node.node_uuid).length ? [] : [node.node_uuid]
    return isMet(tree, node, coveredBy) ? [] : kids.flatMap(walk)
  }
  return kidsOf(tree, null).flatMap(walk)
}

export type LeafState = 'covered' | 'spare' | 'gap'

export function leafState(leafUuid: string, coveredBy: CoveredBy, gaps: Set<string>): LeafState {
  if (coveredBy(leafUuid).length) return 'covered'
  return gaps.has(leafUuid) ? 'gap' : 'spare'
}

export interface Gauge { need: number; got: number; segments: Array<{ plan: string; count: number }> }

/**
 * A group's gauge: the requirements it needs, each coloured by the first selected plan covering it. An "any N"
 * group counts only its best N children, so 3 covered of 4 when 3 are needed reads full.
 */
export function gaugeOf(tree: Tree, node: TreeNode, coveredBy: CoveredBy): Gauge {
  const raw = (item: TreeNode): { need: number; got: number; plans: string[] } => {
    const kids = kidsOf(tree, item.node_uuid)
    if (!kids.length) {
      const first = coveredBy(item.node_uuid)[0]
      return { need: 1, got: first ? 1 : 0, plans: first ? [first] : [] }
    }
    let parts = kids.map(raw)
    const rule = ruleOf(item)
    if (rule.kind === 'any') parts = [...parts].sort((a, b) => b.got / b.need - a.got / a.need).slice(0, rule.count)
    return { need: parts.reduce((sum, part) => sum + part.need, 0), got: parts.reduce((sum, part) => sum + part.got, 0), plans: parts.flatMap((part) => part.plans) }
  }
  const { need, got, plans } = raw(node)
  const segments: Gauge['segments'] = []
  plans.forEach((plan) => { const found = segments.find((item) => item.plan === plan); if (found) found.count += 1; else segments.push({ plan, count: 1 }) })
  return { need, got, segments }
}

export type TreeFilter = 'all' | 'gaps' | 'flagged'

/**
 * The rows to show, in order, with their depth. A search or a filter opens every group that has a match;
 * otherwise only the groups in `open` are expanded.
 */
export function visibleRows<T extends TreeNode>(tree: Tree<T>, options: { query?: string; filter?: TreeFilter; open: Set<string>; flags: Set<string>; gaps: Set<string> }): Array<{ node: T; depth: number }> {
  const query = (options.query || '').trim().toLowerCase()
  const filter = options.filter || 'all'
  const keepLeaf = (leaf: T) => filter === 'all' || (filter === 'gaps' ? options.gaps.has(leaf.node_uuid) : options.flags.has(leaf.node_uuid))
  const text = (node: T) => `${node.code || ''} ${node.title}`.toLowerCase()
  const matches = (node: T) => !query || [node, ...ancestorsOf(tree, node), ...leavesOf(tree, node)].some((item) => text(item).includes(query))
  const expandAll = Boolean(query) || filter !== 'all'
  const rows: Array<{ node: T; depth: number }> = []
  const walk = (parent: string | null, depth: number) => kidsOf(tree, parent).forEach((node) => {
    if (!leavesOf(tree, node).some(keepLeaf) || !matches(node)) return
    rows.push({ node, depth })
    if (expandAll || options.open.has(node.node_uuid)) walk(node.node_uuid, depth + 1)
  })
  walk(null, 0)
  return rows
}

function alpha(value: number): string {
  let result = ''
  while (value > 0) { const rest = (value - 1) % 26; result = String.fromCharCode(65 + rest) + result; value = Math.floor((value - 1) / 26) }
  return result
}

function roman(value: number): string {
  const numerals: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let result = ''
  numerals.forEach(([number, numeral]) => { while (value >= number) { result += numeral; value -= number } })
  return result
}

export function codeSegment(value: number, style: Numbering): string {
  if (style === 'decimal') return String(value)
  if (style === 'upper_alpha') return alpha(value)
  if (style === 'lower_alpha') return alpha(value).toLowerCase()
  if (style === 'upper_roman') return roman(value)
  if (style === 'lower_roman') return roman(value).toLowerCase()
  return ''
}

/** The codes the API will store: generated from each parent's numbering and joined with dots, or kept when custom. */
export function withCodes<T extends TreeNode>(nodes: T[], topNumbering: Numbering = 'custom'): T[] {
  const tree = buildTree(nodes)
  const codes = new Map<string, string>()
  const walk = (parent: string | null, style: Numbering, prefix: string) => kidsOf(tree, parent).forEach((node, index) => {
    const code = style === 'none' ? '' : style === 'custom' ? (node.code || '') : prefix ? `${prefix}.${codeSegment(index + 1, style)}` : codeSegment(index + 1, style)
    codes.set(node.node_uuid, code)
    walk(node.node_uuid, node.numbering || 'custom', code)
  })
  walk(null, topNumbering, '')
  return nodes.map((node) => ({ ...node, code: codes.has(node.node_uuid) ? codes.get(node.node_uuid) : node.code }))
}
