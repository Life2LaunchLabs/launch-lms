'use client'

import { FormEvent, useState } from 'react'
import { ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { motion } from 'motion/react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { createPortfolioTimeline, updatePortfolioTimeline } from '@services/portfolio/portfolio'
import { type MediaAsset } from '@services/media/library'
import { normalizeMediaUrl } from '@services/media/media'
import type { TimelineEntry } from './Timeline'

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
const PRECISIONS = ['year', 'season', 'month', 'day'] as const
const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall']
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

function dateParts(value?: string) {
  const [year = '', month = '', day = ''] = (value || '').split('-')
  return { year, month, day }
}

function DateField({ name, label, precision, value, disabled }: { name: string; label: string; precision: typeof PRECISIONS[number]; value?: string; disabled?: boolean }) {
  const parts = dateParts(value)
  const [year, setYear] = useState(parts.year)
  const [month, setMonth] = useState(parts.month)
  const [day, setDay] = useState(parts.day)
  const [season, setSeason] = useState(() => parts.month ? SEASONS[Math.min(3, Math.floor((Number(parts.month) - 1) / 3))] : '')
  const seasonMonth = { Winter: '01', Spring: '04', Summer: '07', Fall: '10' }[season] || ''
  const result = precision === 'year' ? year : precision === 'season' ? (year && seasonMonth ? `${year}-${seasonMonth}` : '') : precision === 'month' ? (year && month ? `${year}-${month}` : '') : (year && month && day ? `${year}-${month}-${day}` : '')
  return <label className={`grid gap-2 text-sm font-semibold ${disabled ? 'opacity-50' : ''}`}>{label}<input type="hidden" name={name} value={disabled ? '' : result}/><div className="grid grid-cols-2 gap-2">{precision === 'season' && <select aria-label={`${label} season`} disabled={disabled} value={season} onChange={(event) => setSeason(event.target.value)} className={inputClass}><option value="">Season</option>{SEASONS.map((item) => <option key={item}>{item}</option>)}</select>}{precision !== 'year' && precision !== 'season' && <select aria-label={`${label} month`} disabled={disabled} value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass}><option value="">Month</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>{new Date(2020, Number(item) - 1).toLocaleString(undefined, { month: 'long' })}</option>)}</select>}<input aria-label={`${label} year`} disabled={disabled} inputMode="numeric" min="1900" max="2200" type="number" placeholder="Year" value={year} onChange={(event) => setYear(event.target.value)} className={inputClass}/>{precision === 'day' && <input aria-label={`${label} day`} disabled={disabled} type="number" min="1" max="31" placeholder="Day" value={day} onChange={(event) => setDay(event.target.value.padStart(2, '0').slice(-2))} className={inputClass}/>}</div></label>
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

export function ExperienceEditor({ initialEntry, work, initialType, onSaved, onCancel }: { initialEntry?: TimelineEntry; work: any[]; initialType?: string; onSaved?: (entry: TimelineEntry) => void; onCancel?: () => void }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const userId = Number(session?.data?.user?.id || 0)
  const initialImages = (initialEntry?.blocks || []).filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: block.data.asset_uuid || '', url: block.data.url || '', title: block.data.caption || '', owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
  const [type, setType] = useState<ExperienceType>(normalizedType(initialEntry?.entry_type || initialType))
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(initialEntry?.is_current || false)
  const [precision, setPrecision] = useState<typeof PRECISIONS[number]>((initialEntry?.start_precision as any) || 'month')
  const [selected, setSelected] = useState<string[]>(initialEntry?.work.map((item) => item.work_uuid) || [])
  const [details, setDetails] = useState<string[]>((initialEntry?.details?.work_details as string[]) || [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [images, setImages] = useState<MediaAsset[]>(initialImages)
  const [coverUuid, setCoverUuid] = useState(initialEntry?.cover_asset_uuid || '')
  const definition = TYPE_FIELDS[type]

  function addImage(asset: MediaAsset) { setImages((now) => now.some((item) => item.asset_uuid === asset.asset_uuid) ? now : [...now, asset]); setCoverUuid((now) => now || asset.asset_uuid); setPickerOpen(false) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const data = new FormData(event.currentTarget)
    if (images.length && !coverUuid) { toast.error('Choose a cover image'); return }
    setBusy(true)
    try {
      const customDetails = Object.fromEntries((definition.fields || []).map((field) => [field.key, data.get(field.key) || '']))
      const body: any = { title: data.get('title'), entry_type: type, organization: data.get('organization'), location_label: data.get('location_label') || '', details: { ...customDetails, work_details: type === 'work_career' ? details : [] }, summary: data.get('summary'), start_date: data.get('start_date') || null, end_date: current ? null : data.get('end_date') || null, is_current: current, start_precision: precision, end_precision: current ? null : precision, cover_asset_uuid: coverUuid || null, blocks: images.map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } })), work_links: selected.map((work_uuid) => ({ work_uuid, relationship_label: 'Related to this experience' })) }
      const result = initialEntry ? await updatePortfolioTimeline(initialEntry.timeline_uuid, { ...body, revision: initialEntry.revision }, token) : await createPortfolioTimeline({ ...body, idempotency_key: crypto.randomUUID() }, token)
      toast.success(initialEntry ? 'Experience updated' : 'Experience added')
      onSaved?.(result as TimelineEntry)
    } catch (error: any) { toast.error(error?.message || 'Could not save this experience') } finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="min-h-0 flex-1 overflow-y-auto px-6">
    <section className="border-b border-border pb-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">About</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold sm:col-span-2">Type<select value={type} onChange={(event) => setType(event.target.value as ExperienceType)} className={inputClass}>{EXPERIENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">{definition.title}<input required name="title" defaultValue={initialEntry?.title} placeholder="What was the experience?" className={inputClass}/></label><label className="grid gap-2 text-sm font-semibold">{definition.organization}<input name="organization" defaultValue={initialEntry?.organization} className={inputClass}/></label>{definition.location && <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Location<input name="location_label" defaultValue={initialEntry?.location_label} placeholder="City, region, or online" className={inputClass}/></label>}{definition.fields?.map((field) => <label key={field.key} className="grid gap-2 text-sm font-semibold">{field.label}<input name={field.key} defaultValue={initialEntry?.details?.[field.key] || ''} placeholder={field.placeholder} className={inputClass}/></label>)}</div>{type === 'work_career' && <div className="mt-5"><p className="mb-2 text-sm font-semibold">Additional details</p><AdditionalDetails selected={details} setSelected={setDetails}/></div>}</section>
    <section className="border-b border-border py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Date</h2><label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} className="h-4 w-4"/>This experience is current</label><div className="mt-5 grid grid-cols-4 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Date precision">{PRECISIONS.map((item) => { const active = precision === item; return <button key={item} type="button" role="radio" aria-checked={active} onClick={() => setPrecision(item)} className={`relative isolate h-9 rounded-lg px-2 text-xs font-semibold transition-colors sm:text-sm ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{active && <motion.span layoutId="experience-date-precision" className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-border/60" transition={{ type: 'spring', stiffness: 500, damping: 38 }}/>}<span className="relative">{item[0].toUpperCase() + item.slice(1)}</span></button> })}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><DateField name="start_date" label="Start" precision={precision} value={initialEntry?.start_date}/><DateField name="end_date" label="End" precision={precision} value={initialEntry?.end_date} disabled={current}/></div></section>
    <section className="border-b border-border py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Description</h2><textarea name="summary" defaultValue={initialEntry?.summary} rows={6} placeholder="What did you do, learn, change, or contribute?" className="mt-4 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6"/></section>
    <section className="border-b border-border py-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Media</h2><p className="mt-1 text-sm text-muted-foreground">Add images and choose a cover for this experience.</p></div><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4"/>Add media</Button></div>{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.asset_uuid} className={`group relative overflow-hidden rounded-xl border-2 ${coverUuid === image.asset_uuid ? 'border-foreground' : 'border-transparent'}`}><button type="button" onClick={() => setCoverUuid(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover"/><span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{coverUuid === image.asset_uuid ? 'Cover' : 'Make cover'}</span></button><button type="button" aria-label="Remove image" onClick={() => { const remaining = images.filter((item) => item.asset_uuid !== image.asset_uuid); setImages(remaining); if (coverUuid === image.asset_uuid) setCoverUuid(remaining[0]?.asset_uuid || '') }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><Trash2 className="h-4 w-4"/></button></div>)}</div>}</section>
    <section className="py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Projects</h2><p className="mt-1 text-sm text-muted-foreground">Connect projects that show what this experience involved.</p>{work.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{work.map((item) => <label key={item.work_uuid} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={selected.includes(item.work_uuid)} onChange={() => setSelected((now) => now.includes(item.work_uuid) ? now.filter((id) => id !== item.work_uuid) : [...now, item.work_uuid])}/><span className="line-clamp-1 font-semibold">{item.title}</span></label>)}</div> : <p className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Your projects will be available to connect here after you add them.</p>}</section>
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-popover px-6 py-4">{onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}<Button disabled={busy}>{busy ? 'Saving…' : initialEntry ? 'Save changes' : 'Add experience'}</Button></div>
    <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Add experience media" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={addImage}/>
  </form>
}

export function ExperienceEditorDialog({ open, onOpenChange, initialEntry, work, initialType, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; initialEntry?: TimelineEntry; work: any[]; initialType?: string; onSaved?: (entry: TimelineEntry) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[92dvh] max-w-3xl grid-cols-none grid-rows-none flex-col overflow-hidden p-0"><DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pr-12 pt-6"><DialogTitle>{initialEntry ? 'Edit experience' : 'Add experience'}</DialogTitle><DialogDescription>{initialEntry ? 'Update the details of this experience.' : 'Choose a type and add the details that tell this part of your story.'}</DialogDescription></DialogHeader><ExperienceEditor key={`${initialEntry?.timeline_uuid || 'new'}-${initialType || ''}-${open}`} initialEntry={initialEntry} work={work} initialType={initialType} onCancel={() => onOpenChange(false)} onSaved={(entry) => { onOpenChange(false); onSaved?.(entry) }}/></DialogContent></Dialog>
}
