'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { createPortfolioProject, createPortfolioTimeline, updatePortfolioTimeline } from '@services/portfolio/portfolio'
import { type MediaAsset } from '@services/media/library'
import { normalizeMediaUrl } from '@services/media/media'
import type { TimelineEntry } from './Timeline'
import { ProjectDefinitionForm, type ProjectDraft } from './ProjectEditorDialog'
import { MonthDateRangeField } from './MonthDateRangeField'

export const EXPERIENCE_TYPES = [
  { value: 'work_career', label: 'Work & Career' },
  { value: 'education', label: 'Education' },
  { value: 'leadership_service', label: 'Leadership & Service' },
  { value: 'learning_experiences', label: 'Learning Experiences' },
  { value: 'teams_activities', label: 'Teams & Activities' },
  { value: 'awards_recognition', label: 'Awards & Recognition' },
  { value: 'challenges_milestones', label: 'Challenges & Milestones' },
  { value: 'other', label: 'Other' },
] as const

type ExperienceType = typeof EXPERIENCE_TYPES[number]['value']
type FieldDefinition = { key: string; label: string; placeholder?: string }
type TypeDefinition = { title: string; organization: string; location?: boolean; fields?: FieldDefinition[] }

const TYPE_FIELDS: Record<ExperienceType, TypeDefinition> = {
  work_career: { title: 'Title', organization: 'Organization', location: true },
  education: { title: 'Degree', organization: 'School', location: true, fields: [{ key: 'field', label: 'Field of study', placeholder: 'e.g. Environmental science' }, { key: 'grade_recognition', label: 'Grade & recognition', placeholder: 'GPA, honors, distinction, or another result' }] },
  leadership_service: { title: 'Role', organization: 'Organization or community', location: true, fields: [{ key: 'cause', label: 'Cause or focus', placeholder: 'What did you serve or lead?' }] },
  learning_experiences: { title: 'Course or program', organization: 'Provider', location: true, fields: [{ key: 'credential', label: 'Credential or outcome', placeholder: 'Certificate, skill, or outcome' }] },
  teams_activities: { title: 'Role or activity', organization: 'Team or group', location: true, fields: [{ key: 'activity_kind', label: 'Activity type', placeholder: 'Club, sport, ensemble, community, or other' }] },
  awards_recognition: { title: 'Award or recognition', organization: 'Issuer', fields: [{ key: 'recognition', label: 'Recognition details', placeholder: 'Level, category, placement, or honor' }] },
  challenges_milestones: { title: 'Challenge or milestone', organization: 'Context', location: true, fields: [{ key: 'outcome', label: 'Outcome', placeholder: 'What changed or what did you achieve?' }] },
  other: { title: 'Title', organization: 'Organization or context', location: true },
}

const LEGACY_TYPE_MAP: Record<string, ExperienceType> = { employment: 'work_career', volunteering: 'leadership_service', training: 'learning_experiences', experience: 'other' }
const DETAIL_GROUPS = [
  { label: 'Where', exclusive: true, options: ['In-person', 'Hybrid', 'Remote'] },
  { label: 'Schedule', exclusive: true, options: ['Full-time', 'Part-time'] },
  { label: 'Arrangement', exclusive: false, options: ['Contract', 'Internship', 'Self-employed'] },
]

const inputClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring'

function normalizedType(type?: string): ExperienceType {
  if (type && EXPERIENCE_TYPES.some((item) => item.value === type)) return type as ExperienceType
  return LEGACY_TYPE_MAP[type || ''] || 'work_career'
}

function AdditionalDetails({ selected, setSelected }: { selected: string[]; setSelected: (value: string[]) => void }) {
  const [open, setOpen] = useState(false)
  function toggle(option: string, group: typeof DETAIL_GROUPS[number]) {
    if (selected.includes(option)) return setSelected(selected.filter((item) => item !== option))
    const withoutGroup = group.exclusive ? selected.filter((item) => !group.options.includes(item)) : selected
    setSelected([...withoutGroup, option])
  }
  return <div><div className="flex flex-wrap items-center gap-2">{selected.map((item) => <span key={item} className="inline-flex h-8 items-center gap-1 rounded-full bg-muted px-3 text-sm font-semibold">{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => setSelected(selected.filter((value) => value !== item))}><X className="h-3.5 w-3.5"/></button></span>)}<button type="button" onClick={() => setOpen(!open)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5"/>{selected.length ? 'Add details' : 'Add details'}<ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}/></button></div>{open && <div className="mt-3 grid gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">{DETAIL_GROUPS.map((group) => <fieldset key={group.label}><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.label}</legend><div className="flex flex-wrap gap-2">{group.options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => toggle(option, group)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected.includes(option) ? 'border-foreground bg-foreground text-background' : 'border-border bg-background'}`}>{option}</button>)}</div></fieldset>)}</div>}</div>
}

export function ExperienceEditor({ initialEntry, projects, initialType, onSaved, onCancel, onHeaderChange }: { initialEntry?: TimelineEntry; projects: any[]; initialType?: string; onSaved?: (entry: TimelineEntry) => void; onCancel?: () => void; onHeaderChange?: (title: string, description: string) => void }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const userId = Number(session?.data?.user?.id || 0)
  const initialImages = (initialEntry?.blocks || []).filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: block.data.asset_uuid || '', url: block.data.url || '', title: block.data.caption || '', owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
  const [type, setType] = useState<ExperienceType>(normalizedType(initialEntry?.entry_type || initialType))
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>(initialEntry?.projects.map((item) => item.project_uuid) || [])
  const [details, setDetails] = useState<string[]>((initialEntry?.details?.work_details as string[]) || [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [images, setImages] = useState<MediaAsset[]>(initialImages)
  const [coverUuid, setCoverUuid] = useState(initialEntry?.cover_asset_uuid || '')
  const [queuedProjects, setQueuedProjects] = useState<Array<{ id: string; title: string }>>([])
  const [namingProject, setNamingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [wizardIndex, setWizardIndex] = useState<number | null>(null)
  const [pendingExperience, setPendingExperience] = useState<any>(null)
  const [createdProjectUuids, setCreatedProjectUuids] = useState<string[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)
  const definition = TYPE_FIELDS[type]
  const draftEntry = pendingExperience || initialEntry

  useEffect(() => {
    if (wizardIndex !== null && queuedProjects[wizardIndex]) {
      onHeaderChange?.(`Create project for “${String(pendingExperience?.title || 'this experience')}”`, `Project ${wizardIndex + 1} of ${queuedProjects.length}: ${queuedProjects[wizardIndex].title}`)
    } else {
      onHeaderChange?.(initialEntry ? 'Edit experience' : 'Add experience', initialEntry ? 'Update the details of this experience.' : 'Choose a type and add the details that tell this part of your story.')
    }
  }, [initialEntry, onHeaderChange, pendingExperience?.title, queuedProjects, wizardIndex])

  function addImage(asset: MediaAsset) { setImages((now) => now.some((item) => item.asset_uuid === asset.asset_uuid) ? now : [...now, asset]); setCoverUuid((now) => now || asset.asset_uuid); setPickerOpen(false) }
  async function saveExperience(body: any, extraProjectUuids: string[] = []) {
    if (!token) return
    const projectUuids = [...selected, ...extraProjectUuids]
    const payload = { ...body, project_links: projectUuids.map((project_uuid) => ({ project_uuid, relationship_label: 'Related to this experience' })) }
    const result = initialEntry ? await updatePortfolioTimeline(initialEntry.timeline_uuid, { ...payload, revision: initialEntry.revision }, token) : await createPortfolioTimeline({ ...payload, idempotency_key: crypto.randomUUID() }, token)
    toast.success(initialEntry ? 'Experience updated' : 'Experience added')
    onSaved?.(result as TimelineEntry)
  }
  function beginProjectName() { setNamingProject(true); setNewProjectName(''); requestAnimationFrame(() => nameInputRef.current?.focus()) }
  function confirmProjectName() {
    const title = newProjectName.trim()
    if (!title) return
    setQueuedProjects((current) => [...current, { id: crypto.randomUUID(), title }])
    setNamingProject(false)
    setNewProjectName('')
  }
  async function defineProject(draft: ProjectDraft) {
    if (!token || wizardIndex === null || !pendingExperience) return
    setBusy(true)
    try {
      const body = { title: draft.title, subtitle: '', start_date: draft.start_date, end_date: draft.end_date, is_ongoing: draft.is_ongoing, cover_asset_uuid: draft.cover_asset_uuid, blocks: [{ block_type: 'text', data: { text: draft.story || '' } }, ...(draft.images || []).map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } }))], idempotency_key: crypto.randomUUID() }
      const saved: any = await createPortfolioProject(body, token)
      const created = [...createdProjectUuids, saved.project_uuid]
      if (wizardIndex < queuedProjects.length - 1) { setCreatedProjectUuids(created); setWizardIndex(wizardIndex + 1) }
      else await saveExperience(pendingExperience, created)
    } catch (error: any) { toast.error(error?.message || 'Could not save this project') } finally { setBusy(false) }
  }
  async function skipProject() {
    if (wizardIndex === null || !pendingExperience) return
    if (wizardIndex < queuedProjects.length - 1) setWizardIndex(wizardIndex + 1)
    else {
      setSelected((current) => [...current, ...createdProjectUuids])
      setQueuedProjects([])
      setCreatedProjectUuids([])
      setWizardIndex(null)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const data = new FormData(event.currentTarget)
    if (images.length && !coverUuid) { toast.error('Choose a cover image'); return }
    setBusy(true)
    try {
      const customDetails = Object.fromEntries((definition.fields || []).map((field) => [field.key, data.get(field.key) || '']))
      const current = data.get('is_current') === 'true'
      const startDate = String(data.get('start_date') || '')
      const endDate = String(data.get('end_date') || '')
      const body: any = { title: data.get('title'), entry_type: type, organization: data.get('organization'), location_label: data.get('location_label') || '', details: { ...customDetails, work_details: type === 'work_career' ? details : [] }, summary: data.get('summary'), start_date: startDate || null, end_date: current ? null : endDate || null, is_current: current, start_precision: startDate.length === 4 ? 'year' : 'month', end_precision: current || !endDate ? null : endDate.length === 4 ? 'year' : 'month', cover_asset_uuid: coverUuid || null, blocks: images.map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } })) }
      if (queuedProjects.length) { setPendingExperience(body); setWizardIndex(0); setBusy(false); return }
      await saveExperience(body)
    } catch (error: any) { toast.error(error?.message || 'Could not save this experience') } finally { setBusy(false) }
  }

  if (wizardIndex !== null && queuedProjects[wizardIndex]) return <ProjectDefinitionForm key={queuedProjects[wizardIndex].id} initialDraft={{ title: queuedProjects[wizardIndex].title }} onSubmit={defineProject} onCancel={skipProject} submitLabel={wizardIndex === queuedProjects.length - 1 ? 'Add experience' : 'Next project'} cancelLabel="Skip project" />

  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="min-h-0 flex-1 overflow-y-auto px-6">
    <section className="border-b border-border pb-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">About</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold sm:col-span-2">Type<select value={type} onChange={(event) => setType(event.target.value as ExperienceType)} className={inputClass}>{EXPERIENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">{definition.title}<input required name="title" defaultValue={draftEntry?.title} placeholder="What was the experience?" className={inputClass}/></label><label className="grid gap-2 text-sm font-semibold">{definition.organization}<input name="organization" defaultValue={draftEntry?.organization} className={inputClass}/></label>{definition.location && <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Location<input name="location_label" defaultValue={draftEntry?.location_label} placeholder="City, region, or online" className={inputClass}/></label>}{definition.fields?.map((field) => <label key={field.key} className="grid gap-2 text-sm font-semibold">{field.label}<input name={field.key} defaultValue={draftEntry?.details?.[field.key] || ''} placeholder={field.placeholder} className={inputClass}/></label>)}</div>{type === 'work_career' && <div className="mt-5"><p className="mb-2 text-sm font-semibold">Additional details</p><AdditionalDetails selected={details} setSelected={setDetails}/></div>}</section>
    <section className="border-b border-border py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Date</h2><div className="mt-4"><MonthDateRangeField startDate={draftEntry?.start_date} endDate={draftEntry?.end_date} isCurrent={draftEntry?.is_current} /></div></section>
    <section className="border-b border-border py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Description</h2><textarea name="summary" defaultValue={draftEntry?.summary} rows={6} placeholder="What did you do, learn, change, or contribute?" className="mt-4 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6"/></section>
    <section className="border-b border-border py-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Media</h2><p className="mt-1 text-sm text-muted-foreground">Add images and choose a cover for this experience.</p></div><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4"/>Add media</Button></div>{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.asset_uuid} className={`group relative overflow-hidden rounded-xl border-2 ${coverUuid === image.asset_uuid ? 'border-foreground' : 'border-transparent'}`}><button type="button" onClick={() => setCoverUuid(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover"/><span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{coverUuid === image.asset_uuid ? 'Cover' : 'Make cover'}</span></button><button type="button" aria-label="Remove image" onClick={() => { const remaining = images.filter((item) => item.asset_uuid !== image.asset_uuid); setImages(remaining); if (coverUuid === image.asset_uuid) setCoverUuid(remaining[0]?.asset_uuid || '') }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><Trash2 className="h-4 w-4"/></button></div>)}</div>}</section>
    <section className="py-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Projects</h2><p className="mt-1 text-sm text-muted-foreground">Connect a project, or queue a new one to define next.</p></div><Button type="button" variant="outline" size="sm" onClick={beginProjectName}><Plus className="mr-1.5 h-4 w-4"/>Add new</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{projects.map((item) => { const active = selected.includes(item.project_uuid); return <button key={item.project_uuid} type="button" aria-pressed={active} onClick={() => setSelected((now) => active ? now.filter((id) => id !== item.project_uuid) : [...now, item.project_uuid])} className={`rounded-lg border p-3 text-left text-sm font-semibold transition-colors ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted/50'}`}>{item.title}</button> })}{queuedProjects.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-foreground bg-foreground p-3 text-background"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span><span className="rounded-full bg-background/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">New</span><button type="button" aria-label={`Delete queued project ${item.title}`} onClick={() => setQueuedProjects((current) => current.filter((project) => project.id !== item.id))}><X className="h-4 w-4"/></button></div>)}{namingProject && <div className="flex items-center gap-2 rounded-lg border border-foreground p-2"><input ref={nameInputRef} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); confirmProjectName() } if (event.key === 'Escape') setNamingProject(false) }} placeholder="Project name" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none"/><button type="button" aria-label="Confirm project name" onClick={confirmProjectName} className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background"><Check className="h-4 w-4"/></button></div>}</div>{!projects.length && !queuedProjects.length && !namingProject && <p className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">No projects yet. Add one here and define it after this experience.</p>}</section>
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-popover px-6 py-4">{onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}<Button disabled={busy}>{busy ? 'Saving…' : queuedProjects.length ? 'Next' : initialEntry ? 'Save changes' : 'Add experience'}</Button></div>
    <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Add experience media" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={addImage}/>
  </form>
}

export function ExperienceEditorDialog({ open, onOpenChange, initialEntry, projects, initialType, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; initialEntry?: TimelineEntry; projects: any[]; initialType?: string; onSaved?: (entry: TimelineEntry) => void }) {
  const [header, setHeader] = useState({ title: initialEntry ? 'Edit experience' : 'Add experience', description: initialEntry ? 'Update the details of this experience.' : 'Choose a type and add the details that tell this part of your story.' })
  const updateHeader = useCallback((title: string, description: string) => setHeader({ title, description }), [])
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[92dvh] max-w-3xl grid-cols-none grid-rows-none flex-col overflow-hidden p-0"><DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pr-12 pt-6"><DialogTitle>{header.title}</DialogTitle><DialogDescription>{header.description}</DialogDescription></DialogHeader><ExperienceEditor key={`${initialEntry?.timeline_uuid || 'new'}-${initialType || ''}-${open}`} initialEntry={initialEntry} projects={projects} initialType={initialType} onCancel={() => onOpenChange(false)} onHeaderChange={updateHeader} onSaved={(entry) => { onOpenChange(false); onSaved?.(entry) }}/></DialogContent></Dialog>
}
