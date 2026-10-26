'use client'

import React from 'react'
import { v4 as uuidv4 } from 'uuid'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, BookCopy, CalendarDays, CheckCircle2, ClipboardCheck, Link2, ListTree, Loader2, Lock, Plus, Save, Settings2, Table2, Trash2, Type } from 'lucide-react'
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Textarea } from '@components/ui/textarea'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { requirementsApi } from '@services/goals/requirements'
import { cn } from '@/lib/utils'
import type { FrameworkSubpage } from '@services/routing/paths'
import FrameworkCoverage from '../requirements/FrameworkCoverage'
import SourceChip from '../requirements/SourceChip'

type RequirementSubpage = FrameworkSubpage
type MetadataFieldType = 'text' | 'date' | 'link' | 'number' | 'boolean'
type RequirementCodeStyle = 'upper_alpha' | 'lower_alpha' | 'decimal' | 'upper_roman' | 'lower_roman'
type MetadataFieldDefinition = { field_uuid: string; name: string; type: MetadataFieldType; required: boolean }
type RequirementLevel = { level_uuid: string; name: string; code_style: RequirementCodeStyle; metadata_fields: MetadataFieldDefinition[] }

const codeStyleOptions: { value: RequirementCodeStyle; label: string }[] = [
  { value: 'upper_alpha', label: 'A, B, C' },
  { value: 'lower_alpha', label: 'a, b, c' },
  { value: 'decimal', label: '1, 2, 3' },
  { value: 'upper_roman', label: 'I, II, III' },
  { value: 'lower_roman', label: 'i, ii, iii' },
]
const defaultCodeStyles: RequirementCodeStyle[] = ['upper_alpha', 'decimal', 'lower_roman', 'lower_alpha', 'upper_roman']

function defaultCodeStyle(depth: number): RequirementCodeStyle {
  return defaultCodeStyles[Math.min(depth, defaultCodeStyles.length - 1)]
}

function alphaCode(value: number) {
  let result = ''
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26) }
  return result
}

function romanCode(value: number) {
  const numerals: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let result = ''
  numerals.forEach(([number, numeral]) => { while (value >= number) { result += numeral; value -= number } })
  return result
}

function codeSegment(value: number, style: RequirementCodeStyle) {
  if (style === 'decimal') return String(value)
  if (style === 'upper_alpha') return alphaCode(value)
  if (style === 'lower_alpha') return alphaCode(value).toLowerCase()
  if (style === 'upper_roman') return romanCode(value)
  return romanCode(value).toLowerCase()
}

/**
 * Create a blank framework. Copies of published frameworks come from Plans › Discover instead.
 * `trigger` replaces the default button.
 */
export function CreateFramework({ orgId, token, refresh, onCreated, trigger }: any) {
  const [open, setOpen] = React.useState(false), [name, setName] = React.useState(''), [description, setDescription] = React.useState(''), [saving, setSaving] = React.useState(false)
  const create = async () => { if (!name.trim()) return; setSaving(true); try { const created = await requirementsApi.create(orgId, { name, description, source_metadata: { requirement_levels: [] }, nodes: [] }, token); await refresh(); setOpen(false); setName(''); setDescription(''); toast.success('Requirement framework created.'); onCreated(created.framework_uuid) } catch (error: any) { toast.error(error?.message || 'Could not create the framework.') } finally { setSaving(false) } }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="New requirement framework" dialogDescription="Start a blank framework. You’ll add its requirements next, then map template steps to them." dialogTrigger={trigger || <Button variant="brand"><Plus size={15} />New framework</Button>} dialogContent={<div className="space-y-4 p-2"><div className="space-y-2"><Label htmlFor="requirement-name">Name</Label><Input id="requirement-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Career readiness requirements" /></div><div className="space-y-2"><Label htmlFor="requirement-description">Description</Label><Textarea id="requirement-description" value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24" /></div><p className="text-xs text-muted-foreground">To start from a published framework, use Add from marketplace on the Requirements tab.</p><Button onClick={() => void create()} disabled={!name.trim() || saving} className="ml-auto">{saving && <Loader2 className="animate-spin" size={14} />}Create blank framework</Button></div>} />
}

export function RequirementFrameworkDetail({ orgslug, orgId, token, frameworkUuid, activeSubpage }: { orgslug: string; orgId: number; token?: string; frameworkUuid: string; activeSubpage: RequirementSubpage }) {
  const key = orgId && token ? ['requirement-framework', orgId, frameworkUuid, token] : null
  const { data: framework, isLoading, error, mutate: refresh } = useSWR(key, () => requirementsApi.get(orgId, frameworkUuid, token), { revalidateOnFocus: false })
  const [publishing, setPublishing] = React.useState(false)
  const [publishingToLibrary, setPublishingToLibrary] = React.useState(false)
  if (isLoading) return <Loading />
  if (error || !framework) return <div className="px-4 py-16 text-center sm:px-10"><p className="font-bold">Requirement framework unavailable.</p><Link href={getUriWithOrg(orgslug, routePaths.org.admin.requirements())} className="mt-3 inline-flex text-sm font-bold text-blue-700">Back to requirements</Link></div>
  const publish = async () => { if (framework.status === 'published') return; setPublishing(true); try { const result = await requirementsApi.publish(orgId, framework.framework_uuid, token); await refresh(); toast.success(`Version ${result.version} published.`); if (result.active_incomplete_enrollments > 0 && window.confirm(`Update ${result.active_incomplete_enrollments} active incomplete learner${result.active_incomplete_enrollments === 1 ? '' : 's'} to this version? Completed enrollments will remain unchanged.`)) { const migration = await requirementsApi.migrateActive(orgId, framework.framework_uuid, null, token); toast.success(`${migration.updated} active learner${migration.updated === 1 ? '' : 's'} updated.`); await refresh() } } catch (publishError: any) { toast.error(publishError?.message || 'Could not publish the framework.') } finally { setPublishing(false) } }
  const publishToLibrary = async () => { setPublishingToLibrary(true); try { await requirementsApi.publishToLibrary(orgId, framework.framework_uuid, token); await refresh(); toast.success('Requirement framework published to the global library.') } catch (publishError: any) { toast.error(publishError?.message || 'Could not publish to the global library.') } finally { setPublishingToLibrary(false) } }
  const isOwnerOrg = orgslug === getDefaultOrg()
  // Staff read frameworks; only admins change them (the API says which with can_edit). Copies from the marketplace stay editable.
  const canEdit = framework.can_edit !== false
  const tabs = [{ id: 'plans' as const, label: 'Coverage by plan', icon: Table2 }, { id: 'details' as const, label: 'Details', icon: Settings2 }, { id: 'levels' as const, label: 'Levels', icon: ListTree }, { id: 'spec' as const, label: 'Spec', icon: ClipboardCheck }]
  const editors = <>{activeSubpage === 'details' ? <FrameworkDetails framework={framework} orgId={orgId} token={token} refresh={refresh} /> : null}{activeSubpage === 'levels' ? <FrameworkLevels framework={framework} orgId={orgId} token={token} refresh={refresh} /> : null}{activeSubpage === 'spec' ? <FrameworkSpec framework={framework} orgId={orgId} token={token} refresh={refresh} /> : null}</>
  return <main className="min-h-full bg-[#f8f8f8]">
    <header className="bg-card px-4 nice-shadow sm:px-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 pt-6 text-xs font-bold text-muted-foreground"><Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-foreground">Plans</Link><span aria-hidden="true">›</span><Link href={getUriWithOrg(orgslug, routePaths.org.admin.requirements())} className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft size={14} className="sm:hidden" />Requirements</Link></nav>
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black">{framework.name}</h1><span className={cn('rounded-full px-2 py-1 text-[9px] font-black uppercase', framework.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{framework.status}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{framework.publisher?.name ? `${framework.publisher.name} · ` : ''}{framework.nodes.length} node{framework.nodes.length === 1 ? '' : 's'} · Version {framework.version} · published versions remain available to existing learner snapshots</p>
          <div className="mt-2 flex flex-wrap gap-1.5 empty:hidden"><SourceChip item={framework} /></div>
        </div>
        <div className="flex flex-wrap gap-2">{canEdit && isOwnerOrg && framework.status === 'published' ? <Button variant="outline" onClick={() => void publishToLibrary()} disabled={publishingToLibrary || framework.library_published_version === framework.version}>{publishingToLibrary ? <Loader2 className="animate-spin" /> : <BookCopy />}{framework.library_published_version === framework.version ? 'Published to library' : framework.published_to_library ? 'Update library copy' : 'Publish to library'}</Button> : null}{canEdit ? <Button onClick={() => void publish()} disabled={publishing || framework.status === 'published' || !framework.nodes.length}>{publishing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Publish version</Button> : null}</div>
      </div>
      {!canEdit ? <p className="mb-3 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground"><Lock size={14} />Only your organization’s admins can change this framework. You can see its requirements and which plans cover them.</p> : null}
      <nav className="-mb-px flex gap-3 overflow-x-auto" aria-label="Requirement framework pages">{tabs.map((tab) => { const Icon = tab.icon; return <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(frameworkUuid, tab.id))} aria-current={activeSubpage === tab.id ? 'page' : undefined} className={cn('flex shrink-0 items-center gap-2 border-b-4 px-3 py-2 text-sm font-black transition', activeSubpage === tab.id ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}><Icon size={15} />{tab.label}</Link> })}</nav>
    </header>
    {activeSubpage === 'plans' ? <FrameworkCoverage orgslug={orgslug} orgId={orgId} token={token} frameworkUuid={frameworkUuid} />
      : <div className="px-4 py-6 sm:px-10">{canEdit ? editors : <fieldset disabled aria-label="Read only" className="min-w-0">{editors}</fieldset>}</div>}
  </main>
}

function FrameworkDetails({ framework, orgId, token, refresh }: any) {
  const [name, setName] = React.useState(framework.name)
  const [description, setDescription] = React.useState(framework.description || '')
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setName(framework.name); setDescription(framework.description || '') }, [framework.name, framework.description])
  const save = async () => { if (!name.trim()) return; setSaving(true); try { await requirementsApi.update(orgId, framework.framework_uuid, { name, description }, token); await refresh(); toast.success(framework.status === 'published' ? 'Draft version created.' : 'Framework details saved.') } catch (error: any) { toast.error(error?.message || 'Could not save framework details.') } finally { setSaving(false) } }
  return <div className="mx-auto max-w-4xl space-y-5"><section className="rounded-xl border border-border bg-card p-6 shadow-xs"><h2 className="text-lg font-bold">Framework details</h2><p className="mt-1 text-sm text-muted-foreground">The name and purpose staff see when linking plan steps and reporting on this framework.</p><div className="mt-6 space-y-5"><div className="space-y-2"><Label htmlFor="framework-detail-name">Name</Label><Input id="framework-detail-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="framework-detail-description">Description</Label><Textarea id="framework-detail-description" value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32" /></div><Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save details</Button></div></section></div>
}

function frameworkLevels(framework: any): RequirementLevel[] {
  const levels = framework.source_metadata?.requirement_levels
  return Array.isArray(levels) ? levels.map((level: any, index: number) => ({ ...level, code_style: codeStyleOptions.some((option) => option.value === level.code_style) ? level.code_style : defaultCodeStyle(index), metadata_fields: Array.isArray(level.metadata_fields) ? level.metadata_fields : [] })) : []
}

function FrameworkLevels({ framework, orgId, token, refresh }: any) {
  const [levels, setLevels] = React.useState<RequirementLevel[]>(() => frameworkLevels(framework))
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => setLevels(frameworkLevels(framework)), [framework])
  const patchLevel = (uuid: string, patch: Partial<RequirementLevel>) => setLevels((current) => current.map((level) => level.level_uuid === uuid ? { ...level, ...patch } : level))
  const addLevel = () => setLevels((current) => [...current, { level_uuid: `requirement_level_${uuidv4()}`, name: '', code_style: defaultCodeStyle(current.length), metadata_fields: [] }])
  const addField = (levelUuid: string) => patchLevel(levelUuid, { metadata_fields: [...(levels.find((level) => level.level_uuid === levelUuid)?.metadata_fields || []), { field_uuid: `metadata_field_${uuidv4()}`, name: '', type: 'text', required: false }] })
  const patchField = (levelUuid: string, fieldUuid: string, patch: Partial<MetadataFieldDefinition>) => patchLevel(levelUuid, { metadata_fields: (levels.find((level) => level.level_uuid === levelUuid)?.metadata_fields || []).map((field) => field.field_uuid === fieldUuid ? { ...field, ...patch } : field) })
  const removeField = (levelUuid: string, fieldUuid: string) => patchLevel(levelUuid, { metadata_fields: (levels.find((level) => level.level_uuid === levelUuid)?.metadata_fields || []).filter((field) => field.field_uuid !== fieldUuid) })
  const removeLevel = (uuid: string) => setLevels((current) => current.filter((level) => level.level_uuid !== uuid))
  const nodesOutsideLevels = levels.length > 0 && (framework.nodes || []).some((node: any) => nodeDepth(node, framework.nodes || []) >= levels.length)
  const invalid = levels.some((level) => !level.name.trim() || level.metadata_fields.some((field) => !field.name.trim())) || nodesOutsideLevels
  const save = async () => { if (invalid) return; if (levels.length && !frameworkLevels(framework).length && framework.nodes?.length && !window.confirm('Adding hierarchy levels replaces all supplied requirement codes with generated codes. Continue?')) return; setSaving(true); try { await requirementsApi.update(orgId, framework.framework_uuid, { source_metadata: { ...(framework.source_metadata || {}), requirement_levels: levels } }, token); await refresh(); toast.success(framework.status === 'published' ? 'Draft version created with the new level structure.' : 'Framework levels saved.') } catch (error: any) { toast.error(error?.message || 'Could not save framework levels.') } finally { setSaving(false) } }
  return <section className="mx-auto max-w-5xl rounded-xl border border-border bg-card p-6 shadow-xs"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-bold">Hierarchy levels</h2><p className="mt-1 text-sm text-muted-foreground">Levels run from broadest to most specific. Choose how each level is numbered and which metadata it collects.</p></div><Button variant="outline" onClick={addLevel}><Plus />Add level</Button></div><div className="mt-6 space-y-4">{!frameworkLevels(framework).length && framework.nodes?.length ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">This framework uses a free-form hierarchy with supplied codes. Its {framework.nodes.length} nodes are available in Spec. Levels are optional; adding them replaces the supplied codes with generated numbering.</p> : null}{levels.map((level, index) => <article key={level.level_uuid} className="rounded-xl border border-border p-5"><div className="flex flex-wrap items-end gap-3 sm:flex-nowrap"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-black text-background">{index + 1}</span><div className="min-w-[120px] flex-1 space-y-2"><Label htmlFor={`level-${level.level_uuid}`}>Level name</Label><Input id={`level-${level.level_uuid}`} value={level.name} onChange={(event) => patchLevel(level.level_uuid, { name: event.target.value })} placeholder={index === 0 ? 'Domain' : index === levels.length - 1 ? 'Requirement' : 'Category'} /></div><div className="order-3 w-full space-y-2 sm:order-2 sm:w-44"><Label>Code format</Label><Select value={level.code_style} onValueChange={(value: RequirementCodeStyle) => patchLevel(level.level_uuid, { code_style: value })}><SelectTrigger aria-label={`Code format for ${level.name || `level ${index + 1}`}`}><SelectValue /></SelectTrigger><SelectContent>{codeStyleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div><Button variant="ghost" size="icon" className="order-2 sm:order-3" aria-label={`Remove ${level.name || `level ${index + 1}`}`} onClick={() => removeLevel(level.level_uuid)}><Trash2 className="text-red-600" /></Button></div><div className="mt-5 sm:ml-12"><div className="flex items-center justify-between"><div><p className="text-xs font-black">Metadata fields</p><p className="mt-0.5 text-[11px] text-muted-foreground">Optional details available on every node at this level.</p></div><Button variant="outline" size="sm" onClick={() => addField(level.level_uuid)}><Plus />Field</Button></div><div className="mt-3 space-y-2">{level.metadata_fields.map((field) => <div key={field.field_uuid} className="grid gap-2 rounded-lg bg-muted/50 p-3 sm:grid-cols-[minmax(160px,1fr)_140px_auto_36px]"><Input value={field.name} onChange={(event) => patchField(level.level_uuid, field.field_uuid, { name: event.target.value })} placeholder="Field name" aria-label="Metadata field name" /><select value={field.type} onChange={(event) => patchField(level.level_uuid, field.field_uuid, { type: event.target.value as MetadataFieldType })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" aria-label="Metadata field type"><option value="text">Text</option><option value="date">Date</option><option value="link">Link</option><option value="number">Number</option><option value="boolean">Yes / no</option></select><label className="flex items-center gap-2 px-2 text-xs font-bold"><input type="checkbox" checked={field.required} onChange={(event) => patchField(level.level_uuid, field.field_uuid, { required: event.target.checked })} />Required</label><Button variant="ghost" size="icon" aria-label={`Remove ${field.name || 'metadata field'}`} onClick={() => removeField(level.level_uuid, field.field_uuid)}><Trash2 className="text-red-600" /></Button></div>)}{!level.metadata_fields.length ? <p className="rounded-lg border border-dashed border-border py-5 text-center text-xs text-muted-foreground">No metadata fields at this level.</p> : null}</div></div></article>)}{!levels.length ? <button type="button" onClick={addLevel} className="w-full rounded-xl border border-dashed border-border py-16 text-sm font-bold text-muted-foreground hover:bg-muted">Add the first hierarchy level</button> : null}</div>{nodesOutsideLevels ? <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Add enough levels for every existing node depth before saving.</p> : null}<div className="mt-6 flex justify-end"><Button onClick={() => void save()} disabled={saving || invalid}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save levels</Button></div></section>
}

function nodeDepth(node: any, nodes: any[]): number {
  let depth = 0
  let parent = node.parent_node_uuid
  const visited = new Set<string>([node.node_uuid])
  while (parent && !visited.has(parent)) { visited.add(parent); const next = nodes.find((candidate) => candidate.node_uuid === parent); if (!next) break; depth += 1; parent = next.parent_node_uuid }
  return depth
}

function generatedNodeCode(node: any, nodes: any[], levels: RequirementLevel[]): string {
  const segments: string[] = []
  const visited = new Set<string>()
  let current = node
  while (current && !visited.has(current.node_uuid)) {
    visited.add(current.node_uuid)
    const depth = nodeDepth(current, nodes)
    const siblings = nodes.filter((candidate) => (candidate.parent_node_uuid || null) === (current.parent_node_uuid || null))
    const siblingIndex = siblings.findIndex((candidate) => candidate.node_uuid === current.node_uuid)
    segments.unshift(codeSegment(Math.max(0, siblingIndex) + 1, levels[depth]?.code_style || defaultCodeStyle(depth)))
    current = current.parent_node_uuid ? nodes.find((candidate) => candidate.node_uuid === current.parent_node_uuid) : null
  }
  return segments.join('.')
}

function FrameworkSpec({ framework, orgId, token, refresh }: any) {
  const levels = frameworkLevels(framework)
  const [nodes, setNodes] = React.useState<any[]>(framework.nodes || [])
  const [selectedId, setSelectedId] = React.useState<string | null>(framework.nodes?.[0]?.node_uuid || null)
  const [expandedIds, setExpandedIds] = React.useState<string[]>(() => (framework.nodes || []).map((node: any) => node.node_uuid))
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setNodes(framework.nodes || []); setExpandedIds((framework.nodes || []).map((node: any) => node.node_uuid)); setSelectedId((current) => current && framework.nodes?.some((node: any) => node.node_uuid === current) ? current : framework.nodes?.[0]?.node_uuid || null) }, [framework.nodes])
  const patchNode = (uuid: string, patch: any) => setNodes((current) => current.map((node) => node.node_uuid === uuid ? { ...node, ...patch } : node))
  const addNode = (parentId: string | null) => { const uuid = `requirement_node_${uuidv4()}`; const siblings = nodes.filter((node) => (node.parent_node_uuid || null) === parentId); setNodes((current) => [...current, { node_uuid: uuid, parent_node_uuid: parentId, title: '', description: '', position: siblings.length, metadata: {} }]); if (parentId) setExpandedIds((current) => current.includes(parentId) ? current : [...current, parentId]); setSelectedId(uuid) }
  const removeNode = (uuid: string) => { const removed = new Set<string>([uuid]); let changed = true; while (changed) { changed = false; nodes.forEach((node) => { if (node.parent_node_uuid && removed.has(node.parent_node_uuid) && !removed.has(node.node_uuid)) { removed.add(node.node_uuid); changed = true } }) } setNodes((current) => current.filter((node) => !removed.has(node.node_uuid))); setSelectedId(nodes.find((node) => !removed.has(node.node_uuid))?.node_uuid || null) }
  const nodeInvalid = (node: any) => { const level = levels[nodeDepth(node, nodes)]; return !node.title.trim() || (level?.metadata_fields || []).some((field) => field.required && (node.metadata?.[field.field_uuid] === undefined || node.metadata?.[field.field_uuid] === null || node.metadata?.[field.field_uuid] === '')) }
  const save = async () => { if (nodes.some(nodeInvalid)) return; setSaving(true); try { await requirementsApi.update(orgId, framework.framework_uuid, { nodes: nodes.map((node, position) => ({ ...node, code: levels.length ? generatedNodeCode(node, nodes, levels) : node.code, position })) }, token); await refresh(); toast.success(framework.status === 'published' ? 'Draft version created.' : 'Framework specification saved.') } catch (error: any) { toast.error(error?.message || 'Could not save the specification.') } finally { setSaving(false) } }
  const selected = nodes.find((node) => node.node_uuid === selectedId)
  const selectedDepth = selected ? nodeDepth(selected, nodes) : 0
  const selectedLevel = levels[selectedDepth]
  const roots = nodes.filter((node) => !node.parent_node_uuid)
  const addBranch = (parentId: string | null, depth: number) => <TreeItem key={`add:${parentId || 'root'}`} itemId={`add:${parentId || 'root'}`} className="requirement-add-branch" label={<button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addNode(parentId) }} className="flex w-full items-center gap-2 py-1 text-left text-xs font-bold text-muted-foreground hover:text-foreground"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-current"><Plus size={12} /></span>Add {levels[depth]?.name || 'node'}</button>} />
  const renderNode = (node: any, ancestry = new Set<string>()): React.ReactNode => { if (ancestry.has(node.node_uuid)) return null; const nextAncestry = new Set(ancestry).add(node.node_uuid); const depth = nodeDepth(node, nodes); const canAddChild = !levels.length || depth + 1 < levels.length; const code = levels.length ? generatedNodeCode(node, nodes, levels) : node.code; return <TreeItem key={node.node_uuid} itemId={node.node_uuid} label={<span className="block min-w-0 truncate py-1 text-sm font-bold">{code} · {node.title || 'Untitled node'}</span>}>{nodes.filter((candidate) => candidate.parent_node_uuid === node.node_uuid).map((child) => renderNode(child, nextAncestry))}{canAddChild ? addBranch(node.node_uuid, depth + 1) : null}</TreeItem> }
  if (!levels.length && !framework.nodes?.length) return <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-border bg-card py-20 text-center"><ListTree className="mx-auto text-muted-foreground/40" size={40} /><h2 className="mt-3 font-black">Define hierarchy levels first</h2><p className="mt-1 text-sm text-muted-foreground">The level structure determines how deep this requirement tree can grow.</p></div>
  return <div className="grid min-h-[620px] min-w-0 grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><aside className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-xs"><div><h2 className="font-black">Specification</h2><p className="mt-1 text-xs text-muted-foreground">{nodes.length} node{nodes.length === 1 ? '' : 's'} · {levels.length ? 'codes follow level formats' : 'supplied codes are preserved'}</p></div><div className="mt-4 overflow-x-auto"><SimpleTreeView className="ml-2 border-l border-border pl-4" expandedItems={expandedIds} onExpandedItemsChange={(_, itemIds) => setExpandedIds(itemIds.filter((itemId) => !itemId.startsWith('add:')))} selectedItems={selectedId} onSelectedItemsChange={(_, itemId) => { if (itemId && !itemId.startsWith('add:')) setSelectedId(itemId) }} sx={{ '& > .MuiTreeItem-root > .MuiTreeItem-content': { position: 'relative' }, '& > .MuiTreeItem-root > .MuiTreeItem-content::before': { content: '""', position: 'absolute', left: '-16px', top: '50%', width: '16px', borderTop: '1px solid hsl(var(--border))' }, '& .MuiTreeItem-groupTransition': { marginLeft: '12px', paddingLeft: '18px', borderLeft: '1px solid hsl(var(--border))' }, '& .MuiTreeItem-groupTransition > .MuiTreeItem-root > .MuiTreeItem-content': { position: 'relative' }, '& .MuiTreeItem-groupTransition > .MuiTreeItem-root > .MuiTreeItem-content::before': { content: '""', position: 'absolute', left: '-18px', top: '50%', width: '18px', borderTop: '1px solid hsl(var(--border))' }, '& .requirement-add-branch > .MuiTreeItem-content': { backgroundColor: 'transparent' } }}>{roots.map((root) => renderNode(root))}{addBranch(null, 0)}</SimpleTreeView></div></aside><section className="min-w-0 rounded-xl border border-border bg-card p-6 shadow-xs">{selected ? <div><div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Level {selectedDepth + 1} · {selectedLevel?.name || 'Node'}</p><h2 className="mt-1 text-lg font-black">Node details</h2></div><Button variant="ghost" size="sm" onClick={() => removeNode(selected.node_uuid)}><Trash2 className="text-red-600" />Delete</Button></div><div className="mt-6 grid gap-5 sm:grid-cols-[minmax(180px,auto)_minmax(0,1fr)]"><div className="space-y-2"><Label htmlFor="node-code">{levels.length ? 'Generated code' : 'Code'}</Label>{levels.length ? <div className="flex min-h-9 items-center break-all rounded-md border border-border bg-muted px-3 font-mono text-sm font-bold" aria-label="Generated requirement code">{generatedNodeCode(selected, nodes, levels)}</div> : <Input id="node-code" value={selected.code || ''} onChange={(event) => patchNode(selected.node_uuid, { code: event.target.value })} className="font-mono" />}</div><div className="space-y-2"><Label htmlFor="node-title">Name</Label><Input id="node-title" value={selected.title || ''} onChange={(event) => patchNode(selected.node_uuid, { title: event.target.value })} placeholder="Requirement name" /></div></div><div className="mt-5 space-y-2"><Label htmlFor="node-description">Description</Label><Textarea id="node-description" value={selected.description || ''} onChange={(event) => patchNode(selected.node_uuid, { description: event.target.value })} className="min-h-28" /></div>{selectedLevel?.metadata_fields?.length ? <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-black">{selectedLevel.name} metadata</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">{selectedLevel.metadata_fields.map((field) => <NodeMetadataField key={field.field_uuid} field={field} value={selected.metadata?.[field.field_uuid]} onChange={(value) => patchNode(selected.node_uuid, { metadata: { ...(selected.metadata || {}), [field.field_uuid]: value } })} />)}</div></div> : null}<div className="mt-8 flex justify-end"><Button onClick={() => void save()} disabled={saving || nodes.some(nodeInvalid)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save specification</Button></div></div> : <div className="flex min-h-[520px] items-center justify-center text-center"><div><ClipboardCheck className="mx-auto text-muted-foreground/40" size={40} /><p className="mt-3 font-bold">Select a node to edit its details</p></div></div>}</section></div>
}

// eslint-disable-next-line no-unused-vars
function NodeMetadataField({ field, value, onChange }: { field: MetadataFieldDefinition; value: any; onChange(value: any): void }) {
  const id = `node-metadata-${field.field_uuid}`
  if (field.type === 'boolean') return <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-bold"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />{field.name}{field.required ? <span className="text-red-600">*</span> : null}</label>
  const icon = field.type === 'date' ? <CalendarDays size={14} /> : field.type === 'link' ? <Link2 size={14} /> : <Type size={14} />
  return <div className="space-y-2"><Label htmlFor={id} className="flex items-center gap-1.5">{icon}{field.name}{field.required ? <span className="text-red-600">*</span> : null}</Label><Input id={id} type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'link' ? 'url' : 'text'} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></div>
}

function Loading() { return <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div> }
