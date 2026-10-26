'use client'

import React from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ArrowDown, ArrowUp, CaretRight, GearSix, Plus, Trash } from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { CoveringStep, FieldType, FrameworkDetail, FrameworkField } from '@services/goals/requirements'
import {
  NUMBERING_OPTIONS, buildTree, isLeaf, kidsOf, ruleOf, withCodes,
  type Numbering, type Rule, type TreeNode,
} from '@services/goals/requirementTree'
import { cn } from '@/lib/utils'

export type FrameworkDraft = { name: string; description: string; numbering: Numbering; fields: FrameworkField[]; nodes: TreeNode[] }

export function draftOf(framework: FrameworkDetail): FrameworkDraft {
  return {
    name: framework.name, description: framework.description || '',
    numbering: framework.source_metadata.numbering || 'custom', fields: framework.source_metadata.fields || [],
    nodes: framework.nodes.map((node) => ({ ...node, metadata: { ...(node.metadata || {}) } })),
  }
}

/** What the API takes to save a draft: positions by sibling order; numbering and rules only on nodes with children. */
export function draftPayload(framework: FrameworkDetail, draft: FrameworkDraft) {
  const tree = buildTree(draft.nodes)
  const position = new Map<string, number>()
  tree.children.forEach((siblings) => siblings.forEach((node, index) => position.set(node.node_uuid, index)))
  const source: Record<string, unknown> = { ...framework.source_metadata }
  delete source.requirement_levels
  return {
    name: draft.name.trim(), description: draft.description,
    source_metadata: { ...source, numbering: draft.numbering, fields: draft.fields },
    nodes: draft.nodes.map((node) => {
      const parent = !isLeaf(tree, node.node_uuid)
      return {
        node_uuid: node.node_uuid, parent_node_uuid: node.parent_node_uuid || null, code: node.code || '', title: node.title.trim() || 'Untitled',
        description: node.description || '', position: position.get(node.node_uuid) ?? 0, metadata: node.metadata || {},
        numbering: parent ? node.numbering || 'custom' : null, rule: parent ? ruleOf(node) : null,
      }
    }),
  }
}

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'link', label: 'Link' }, { value: 'date', label: 'Date' }, { value: 'boolean', label: 'Yes or no' }]
const APPLIES: Array<{ value: FrameworkField['applies']; label: string }> = [{ value: 'requirements', label: 'Requirements' }, { value: 'groups', label: 'Groups and categories' }, { value: 'all', label: 'Everything' }]
const select = 'h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm'
const small = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-semibold text-gray-800 hover:border-gray-300 disabled:opacity-40'

type Props = {
  draft: FrameworkDraft
  onChange: (draft: FrameworkDraft) => void // eslint-disable-line no-unused-vars
  /** Steps of published plans counting toward each node, to warn before removing one. */
  steps: Map<string, CoveringStep[]>
}

/**
 * Editing a framework's draft: the tree on the left, the picked node (or the framework's settings) on the right. No
 * levels: each category or group picks how its items are numbered and how many of them are needed.
 */
export default function FrameworkEdit({ draft, onChange, steps }: Props) {
  const tree = React.useMemo(() => buildTree(draft.nodes), [draft.nodes])
  const coded = React.useMemo(() => new Map(withCodes(draft.nodes, draft.numbering).map((node) => [node.node_uuid, node.code || ''])), [draft.nodes, draft.numbering])
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(draft.nodes.filter((node) => !node.parent_node_uuid).map((node) => node.node_uuid)))
  const [active, setActive] = React.useState<string | null>(null)
  const activeNode = active ? tree.byId.get(active) || null : null

  const setNodes = (nodes: TreeNode[]) => onChange({ ...draft, nodes })
  const update = (id: string, patch: Partial<TreeNode>) => setNodes(draft.nodes.map((node) => node.node_uuid === id ? { ...node, ...patch } : node))
  const add = (parent: string | null) => {
    const siblings = kidsOf(tree, parent)
    const node: TreeNode = { node_uuid: `requirement_node_${uuidv4()}`, parent_node_uuid: parent, title: parent ? 'New requirement' : 'New category', code: '', description: '', position: siblings.length, metadata: {} }
    setNodes([...draft.nodes, node])
    if (parent) setOpen((current) => new Set([...current, parent]))
    setActive(node.node_uuid)
  }
  const descendants = (id: string): string[] => kidsOf(tree, id).flatMap((kid) => [kid.node_uuid, ...descendants(kid.node_uuid)])
  const remove = (id: string) => {
    const gone = new Set([id, ...descendants(id)])
    const linked = [...gone].reduce((sum, uuid) => sum + (steps.get(uuid) || []).length, 0)
    const inside = gone.size - 1
    const warnings = [inside ? `${inside} item${inside === 1 ? '' : 's'} inside it go too.` : '', linked ? `${linked} plan step${linked === 1 ? ' counts' : 's count'} toward ${inside ? 'them' : 'it'}; those links stop counting once you publish.` : ''].filter(Boolean)
    if (warnings.length && !window.confirm(`Remove “${tree.byId.get(id)?.title}”? ${warnings.join(' ')}`)) return
    setNodes(draft.nodes.filter((node) => !gone.has(node.node_uuid)))
    setActive(null)
  }
  const move = (id: string, by: -1 | 1) => {
    const node = tree.byId.get(id)
    if (!node) return
    const siblings = kidsOf(tree, node.parent_node_uuid || null).map((item) => item.node_uuid)
    const from = siblings.indexOf(id), to = from + by
    if (to < 0 || to >= siblings.length) return
    ;[siblings[from], siblings[to]] = [siblings[to], siblings[from]]
    const order = new Map(siblings.map((uuid, index) => [uuid, index]))
    setNodes(draft.nodes.map((item) => order.has(item.node_uuid) ? { ...item, position: order.get(item.node_uuid) } : item))
  }
  const toggle = (id: string) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const rows: React.ReactNode[] = []
  const walk = (parent: string | null, depth: number) => {
    kidsOf(tree, parent).forEach((node) => {
      const leaf = isLeaf(tree, node.node_uuid), expanded = open.has(node.node_uuid)
      rows.push(<div key={node.node_uuid} className={cn('flex min-h-10 items-center gap-1.5 border-b border-gray-50 pr-2', active === node.node_uuid ? 'bg-violet-50 shadow-[inset_3px_0_0_#7c3aed]' : depth ? 'bg-white' : 'bg-gray-50/70')} style={{ paddingLeft: 8 + depth * 20 }}>
        <button type="button" onClick={() => toggle(node.node_uuid)} className={cn('grid h-7 w-7 shrink-0 place-items-center rounded text-gray-400 hover:bg-gray-100', leaf && 'invisible')} aria-label={expanded ? 'Collapse' : 'Expand'}><CaretRight size={13} className={cn('transition', expanded && 'rotate-90')} aria-hidden="true" /></button>
        <button type="button" onClick={() => setActive(node.node_uuid)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
          {coded.get(node.node_uuid) ? <span className="shrink-0 text-xs font-semibold text-gray-500">{coded.get(node.node_uuid)}</span> : null}
          <span className={cn('min-w-0 break-words text-[13.5px]', !leaf && 'font-semibold')}>{node.title || 'Untitled'}</span>
          {!leaf && ruleOf(node).kind === 'any' ? <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">any {(node.rule as { count: number }).count}</span> : null}
        </button>
      </div>)
      if (!leaf && expanded) {
        walk(node.node_uuid, depth + 1)
        rows.push(<div key={`${node.node_uuid}:add`} className="border-b border-gray-50 py-1" style={{ paddingLeft: 44 + depth * 20 }}><button type="button" onClick={() => add(node.node_uuid)} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"><Plus size={12} aria-hidden="true" />Add to {coded.get(node.node_uuid) || node.title}</button></div>)
      }
    })
  }
  walk(null, 0)

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
    <section aria-label="Requirements" className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
        <button type="button" onClick={() => setActive(null)} className={cn(small, !activeNode && 'border-gray-900')}><GearSix size={14} aria-hidden="true" />Framework settings</button>
        <span className="ml-auto flex gap-2"><button type="button" className={small} onClick={() => setOpen(new Set(draft.nodes.map((node) => node.node_uuid)))}>Expand all</button><button type="button" className={small} onClick={() => setOpen(new Set())}>Collapse all</button></span>
      </div>
      <div>{rows}</div>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button type="button" onClick={() => add(null)} className={small}><Plus size={14} aria-hidden="true" />Add a category</button>
        <span className="text-xs text-gray-500">Each category picks its own numbering and how many of its items are needed.</span>
      </div>
    </section>
    <aside className="self-start rounded-xl border border-gray-100 bg-white p-5 nice-shadow lg:sticky lg:top-4">
      {activeNode ? <NodeEditor key={activeNode.node_uuid} node={activeNode} draft={draft} tree={tree} code={coded.get(activeNode.node_uuid) || ''} update={update} add={add} remove={remove} move={move} />
        : <Settings draft={draft} onChange={onChange} />}
    </aside>
  </div>
}

function NodeEditor({ node, draft, tree, code, update, add, remove, move }: {
  node: TreeNode; draft: FrameworkDraft; tree: ReturnType<typeof buildTree>; code: string
  update: (id: string, patch: Partial<TreeNode>) => void; add: (parent: string | null) => void; remove: (id: string) => void; move: (id: string, by: -1 | 1) => void // eslint-disable-line no-unused-vars
}) {
  const leaf = isLeaf(tree, node.node_uuid)
  const parent = node.parent_node_uuid ? tree.byId.get(node.parent_node_uuid) : null
  const parentNumbering = parent ? parent.numbering || 'custom' : draft.numbering
  const kids = kidsOf(tree, node.node_uuid)
  const rule = ruleOf(node)
  const fields = draft.fields.filter((field) => field.applies === 'all' || field.applies === (leaf ? 'requirements' : 'groups'))
  const setValue = (field: FrameworkField, value: unknown) => update(node.node_uuid, { metadata: { ...(node.metadata || {}), [field.field_uuid]: value } })
  const setRule = (next: Rule) => update(node.node_uuid, { rule: next })
  const id = (name: string) => `${node.node_uuid}-${name}`
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{!parent ? 'Category' : leaf ? 'Requirement' : 'Group'}</span>
      <span className="flex gap-1">
        <button type="button" className={small} onClick={() => move(node.node_uuid, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
        <button type="button" className={small} onClick={() => move(node.node_uuid, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
        <button type="button" className={cn(small, 'text-red-700')} onClick={() => remove(node.node_uuid)} aria-label="Remove"><Trash size={14} /></button>
      </span>
    </div>
    <div className="space-y-1.5"><Label htmlFor={id('title')}>Title</Label><Input id={id('title')} value={node.title} onChange={(event) => update(node.node_uuid, { title: event.target.value })} /></div>
    {parentNumbering === 'custom'
      ? <div className="space-y-1.5"><Label htmlFor={id('code')}>Code</Label><Input id={id('code')} value={node.code || ''} onChange={(event) => update(node.node_uuid, { code: event.target.value })} placeholder={parent ? 'Like CCL-AW' : 'Like SB3'} /></div>
      : <p className="text-sm text-gray-600">Code <b className="text-gray-900" aria-label="Generated requirement code">{code || '—'}</b>, from how {parent ? `“${parent.title}”` : 'the framework'} numbers its items.</p>}
    <div className="space-y-1.5"><Label htmlFor={id('description')}>Description</Label><Textarea id={id('description')} value={node.description || ''} onChange={(event) => update(node.node_uuid, { description: event.target.value })} className="min-h-24" /></div>
    {!leaf ? <div className="space-y-3 rounded-lg bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={id('numbering')}>Number its items</Label>
        <select id={id('numbering')} className={select} value={node.numbering || 'custom'} onChange={(event) => update(node.node_uuid, { numbering: event.target.value as Numbering })}>{NUMBERING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={id('rule')}>Met when</Label>
        <span className="flex items-center gap-2">
          <select id={id('rule')} className={select} value={rule.kind} onChange={(event) => setRule(event.target.value === 'any' ? { kind: 'any', count: Math.max(1, kids.length - 1) } : { kind: 'all' })}><option value="all">All of its {kids.length} are met</option><option value="any">Any number of them</option></select>
          {rule.kind === 'any' ? <Input aria-label="How many are needed" type="number" min={1} max={kids.length} value={rule.count} onChange={(event) => setRule({ kind: 'any', count: Math.min(kids.length, Math.max(1, Number(event.target.value) || 1)) })} className="h-9 w-16" /> : null}
        </span></div>
      {rule.kind === 'any' ? <p className="text-xs text-gray-500">Met when any {rule.count} of its {kids.length} items are met.</p> : null}
    </div> : null}
    {fields.map((field) => <FieldInput key={field.field_uuid} field={field} value={node.metadata?.[field.field_uuid]} onChange={(value) => setValue(field, value)} id={id(field.field_uuid)} />)}
    <button type="button" onClick={() => add(node.node_uuid)} className={small}><Plus size={14} aria-hidden="true" />{leaf ? 'Add an item inside' : `Add to ${code || node.title}`}</button>
    {leaf && parent ? <p className="text-xs text-gray-500">A requirement is something a plan step can count toward. Adding items inside it makes it a group.</p> : null}
  </div>
}

function FieldInput({ field, value, onChange, id }: { field: FrameworkField; value: unknown; onChange: (value: unknown) => void; id: string }) { // eslint-disable-line no-unused-vars
  const label = <>{field.name}{field.required ? <span className="text-red-600"> *</span> : null}</>
  if (field.type === 'boolean') return <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />{label}</label>
  const type = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'link' ? 'url' : 'text'
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value == null ? '' : String(value)} onChange={(event) => onChange(field.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)} /></div>
}

function Settings({ draft, onChange }: { draft: FrameworkDraft; onChange: (draft: FrameworkDraft) => void }) { // eslint-disable-line no-unused-vars
  const setField = (index: number, patch: Partial<FrameworkField>) => onChange({ ...draft, fields: draft.fields.map((field, at) => at === index ? { ...field, ...patch } : field) })
  return <div className="space-y-4">
    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Framework settings</span>
    <div className="space-y-1.5"><Label htmlFor="framework-name">Name</Label><Input id="framework-name" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></div>
    <div className="space-y-1.5"><Label htmlFor="framework-description">Description</Label><Textarea id="framework-description" value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} className="min-h-20" /></div>
    <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="framework-numbering">Number the categories</Label>
      <select id="framework-numbering" className={select} value={draft.numbering} onChange={(event) => onChange({ ...draft, numbering: event.target.value as Numbering })}>{NUMBERING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <div><b className="text-sm">Fields</b><p className="text-xs text-gray-500">Extra values to record, like credits, hours or a source link.</p></div>
      {draft.fields.map((field, index) => <div key={field.field_uuid} className="space-y-2 rounded-lg border border-gray-100 p-3">
        <div className="flex gap-2"><Input aria-label="Field name" value={field.name} onChange={(event) => setField(index, { name: event.target.value })} className="h-9" />
          <button type="button" className={cn(small, 'h-9 text-red-700')} aria-label={`Remove ${field.name || 'field'}`} onClick={() => onChange({ ...draft, fields: draft.fields.filter((_, at) => at !== index) })}><Trash size={14} /></button></div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Type" className={select} value={field.type} onChange={(event) => setField(index, { type: event.target.value as FieldType })}>{FIELD_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select aria-label="On" className={select} value={field.applies} onChange={(event) => setField(index, { applies: event.target.value as FrameworkField['applies'] })}>{APPLIES.map((option) => <option key={option.value} value={option.value}>On {option.label.toLowerCase()}</option>)}</select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={field.required} onChange={(event) => setField(index, { required: event.target.checked })} />Required</label>
        </div>
      </div>)}
      <button type="button" className={small} onClick={() => onChange({ ...draft, fields: [...draft.fields, { field_uuid: `metadata_field_${uuidv4()}`, name: 'New field', type: 'text', applies: 'requirements', required: false }] })}><Plus size={14} aria-hidden="true" />Add a field</button>
    </div>
  </div>
}

export function SavingIcon({ saving }: { saving: boolean }) {
  return saving ? <Loader2 size={14} className="animate-spin" /> : null
}
