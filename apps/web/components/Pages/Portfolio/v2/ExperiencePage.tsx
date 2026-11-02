'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CalendarDays, Camera, ChevronDown, FolderOpen, ListPlus, MapPin, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useAsk } from '@components/ui/ask-dialog'
import { getUriWithOrg } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { createPortfolioTimeline, deletePortfolioTimeline, updatePortfolioTimeline } from '@services/portfolio/portfolio'
import { MonthDateRangeField } from '../MonthDateRangeField'
import type { TimelineEntry } from '../Timeline'
import type { Project } from '../portfolioTypes'
import { EXPERIENCE_LOOKS, KindCover, experienceLook } from './covers'
import { AddChip, ItemHero, ItemSection, PhotoPicker, SaveBar, blockImages, imageBlocks, quiet, type Picked, type Setter } from './inplace'
import { PALETTE, SpotTip } from './parts'

// One experience, made and edited on its own page: a new one starts as a blank page that reads like the
// finished thing. What did you do, where, and when come first; everything else is an optional chip.

export const EXPERIENCE_TYPES = Object.entries(EXPERIENCE_LOOKS).map(([value, look]) => ({ value, label: look.label }))

type Extra = { key: string; label: string; placeholder?: string }
const TYPE_FIELDS: Record<string, { title: string; organization: string; location?: boolean; fields?: Extra[] }> = {
  work_career: { title: 'What did you do?', organization: 'Where: the business or organization', location: true },
  education: { title: 'Your program or diploma', organization: 'School', location: true, fields: [{ key: 'field', label: 'Field of study', placeholder: 'Environmental science' }, { key: 'grade_recognition', label: 'Grades and honors', placeholder: 'GPA, honor roll, distinction' }] },
  leadership_service: { title: 'Your role, like Volunteer', organization: 'Organization or community', location: true, fields: [{ key: 'cause', label: 'Cause or focus', placeholder: 'What did you serve or lead?' }] },
  learning_experiences: { title: 'Course or program', organization: 'Who ran it', location: true, fields: [{ key: 'credential', label: 'What you came away with', placeholder: 'A certificate, a skill, an outcome' }] },
  teams_activities: { title: 'Your role, like Point guard', organization: 'Team, club or group', location: true, fields: [{ key: 'activity_kind', label: 'Kind of activity', placeholder: 'Club, sport, band, community' }] },
  awards_recognition: { title: 'The award', organization: 'Who gave it', fields: [{ key: 'recognition', label: 'Level or placement', placeholder: 'State finalist, 1st place' }] },
  challenges_milestones: { title: 'The challenge or milestone', organization: 'Where it happened', location: true, fields: [{ key: 'outcome', label: 'How it turned out', placeholder: 'What changed for you?' }] },
  other: { title: 'What did you do?', organization: 'Where', location: true },
}
const DETAIL_GROUPS = [
  { label: 'Where', exclusive: true, options: ['In-person', 'Hybrid', 'Remote'] },
  { label: 'Schedule', exclusive: true, options: ['Full-time', 'Part-time'] },
  { label: 'Arrangement', exclusive: false, options: ['Contract', 'Internship', 'Self-employed'] },
]
const LEGACY: Record<string, string> = { employment: 'work_career', volunteering: 'leadership_service', training: 'learning_experiences', experience: 'other' }
const typeOf = (type?: string) => { const value = LEGACY[type || ''] || type || ''; return TYPE_FIELDS[value] ? value : 'work_career' }

/** Work arrangement tags, each group picked from in place. */
function WorkTags({ selected, setSelected }: { selected: string[]; setSelected: Setter<string[]> }) {
  const toggle = (option: string, group: typeof DETAIL_GROUPS[number]) => setSelected(selected.includes(option) ? selected.filter((item) => item !== option) : [...(group.exclusive ? selected.filter((item) => !group.options.includes(item)) : selected), option])
  return <div className="grid gap-3 sm:grid-cols-3">{DETAIL_GROUPS.map((group) => <fieldset key={group.label}><legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{group.label}</legend><div className="flex flex-wrap gap-1.5">{group.options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => toggle(option, group)} className={`h-8 rounded-full border-2 px-3 text-xs font-bold ${selected.includes(option) ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'}`}>{option}</button>)}</div></fieldset>)}</div>
}

export function ExperiencePage({ entry, projects, orgslug, initialType, mark }: { entry?: TimelineEntry; projects: Project[]; orgslug: string; initialType?: string; mark?: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const userId = Number(session?.data?.user?.id || 0)
  const router = useRouter()
  const ask = useAsk()
  const [type, setType] = useState(typeOf(entry?.entry_type || initialType))
  const [images, setImages] = useState<Picked[]>(blockImages(entry?.blocks))
  const [cover, setCover] = useState(entry?.cover_asset_uuid || '')
  const [tags, setTags] = useState<string[]>((entry?.details?.work_details as string[]) || [])
  const [linked, setLinked] = useState<string[]>((entry?.projects || []).map((item) => item.project_uuid))
  const fields = TYPE_FIELDS[type]
  const hasDetails = Boolean(tags.length || (fields.fields || []).some((field) => entry?.details?.[field.key]))
  const [open, setOpen] = useState({ details: hasDetails, photos: images.length > 0, projects: linked.length > 0 })
  const [picker, setPicker] = useState(false)
  const [dirty, setDirty] = useState(!entry)
  const [busy, setBusy] = useState(false)
  const look = experienceLook(type)
  const [face, edge] = PALETTE[look.color]
  const Icon = look.icon
  const list = getUriWithOrg(orgslug, '/portfolio/timeline')
  const coverUrl = images.find((image) => image.asset_uuid === cover)?.url || entry?.cover_url || ''
  const change = <T,>(set: Setter<T>) => (value: T) => { set(value); setDirty(true) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const data = new FormData(event.currentTarget)
    const current = data.get('is_current') === 'true'
    const start = String(data.get('start_date') || ''), end = String(data.get('end_date') || '')
    const body = {
      title: String(data.get('title') || '').trim(), entry_type: type, organization: data.get('organization') || '', location_label: data.get('location_label') || '',
      details: { ...Object.fromEntries((fields.fields || []).map((field) => [field.key, data.get(field.key) || ''])), work_details: type === 'work_career' ? tags : [] },
      summary: data.get('summary') || '', start_date: start || null, end_date: current ? null : end || null, is_current: current,
      start_precision: start.length === 4 ? 'year' : 'month', end_precision: current || !end ? null : end.length === 4 ? 'year' : 'month',
      cover_asset_uuid: cover || null, blocks: imageBlocks(images), project_links: linked.map((project_uuid) => ({ project_uuid, relationship_label: 'Related to this experience' })),
    }
    setBusy(true)
    try {
      if (entry) {
        await updatePortfolioTimeline(entry.timeline_uuid, { ...body, revision: entry.revision }, token)
        toast.success('Saved'); setDirty(false); router.refresh()
      } else {
        const saved = await createPortfolioTimeline({ ...body, idempotency_key: crypto.randomUUID() }, token) as TimelineEntry
        toast.success('Added to your portfolio')
        router.replace(getUriWithOrg(orgslug, `/portfolio/timeline/${saved.timeline_uuid}`)); router.refresh()
      }
    } catch (error: any) { toast.error(error?.message || 'Could not save this') } finally { setBusy(false) }
  }

  async function remove() {
    if (!entry || !token) return
    if (!await ask.confirm({ title: `Delete ${entry.title}?`, body: 'It comes off your portfolio and your résumés. This can’t be undone.', action: 'Delete', danger: true })) return
    try { await deletePortfolioTimeline(entry.timeline_uuid, entry.revision, token); router.push(list); router.refresh() } catch (error: any) { toast.error(error?.message || 'Could not delete this') }
  }

  return <main className="min-h-screen bg-background pb-24 text-foreground" data-experience-page={entry ? 'edit' : 'new'}>
    <form onSubmit={submit} onChange={() => setDirty(true)} className="mx-auto grid max-w-[760px] gap-7 px-4 pt-2 sm:px-6">
      <div>
        <ItemHero back={list} backLabel="Experience" cover={<KindCover kind="experience" type={type} url={coverUrl ? normalizeMediaUrl(coverUrl) : ''} />} onCover={() => { setOpen((now) => ({ ...now, photos: true })); setPicker(true) }}>
          {entry ? <button type="button" onClick={() => void remove()} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" />Delete</button> : null}
        </ItemHero>
        <div className="mt-5 grid gap-2">
          <label className="relative inline-flex h-8 w-fit items-center gap-1.5 rounded-full pl-3 pr-8 text-[12.5px] font-extrabold" style={{ background: `color-mix(in srgb, ${face} 16%, hsl(var(--card)))`, color: edge }}>
            <Icon className="h-4 w-4" />
            <select aria-label="Type" value={type} onChange={(event) => change(setType)(event.target.value)} className="appearance-none bg-transparent font-extrabold outline-none dark:text-white">{EXPERIENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5" />
          </label>
          <input name="title" required aria-label="What did you do?" defaultValue={entry?.title} autoFocus={!entry} placeholder={fields.title} className={`${quiet} text-[clamp(26px,4vw,38px)] font-extrabold leading-tight`} />
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <label className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4 shrink-0" /><input name="organization" aria-label="Organization" defaultValue={entry?.organization} placeholder={fields.organization} className={`${quiet} py-1.5 text-[15px] font-bold text-foreground`} /></label>
            {fields.location ? <label className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><input name="location_label" aria-label="Location" defaultValue={entry?.location_label} placeholder="City, or online" className={`${quiet} py-1.5 text-[15px] font-bold text-foreground`} /></label> : null}
          </div>
          <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 pt-1 text-muted-foreground" onClickCapture={() => setDirty(true)}><CalendarDays className="mt-3.5 h-4 w-4" /><div className="text-foreground"><MonthDateRangeField startDate={entry?.start_date} endDate={entry?.end_date} isCurrent={entry ? entry.is_current : true} startPrecision={entry?.start_precision} endPrecision={entry?.end_precision} /></div></div>
        </div>
      </div>

      {/* A saved experience opened for "Tell your stories" carries the "!" here. */}
      <div className={`group relative rounded-2xl ${entry && mark ? 'ring-4 ring-[#ffc21a]/45' : ''}`}>
        {entry && mark ? <SpotTip label={mark} className="absolute -top-3.5 right-3" /> : null}
        <textarea name="summary" aria-label="What you did there" defaultValue={entry?.summary} rows={3} placeholder={entry && mark ? 'Tell it in a few sentences: what you did, what was hard, what you’d do again.' : 'What did you do there? A sentence or two is plenty.'} className={`${quiet} min-h-[5.5rem] resize-none py-2 text-[17px] font-semibold leading-relaxed [field-sizing:content]`} />
      </div>

      {open.details ? <ItemSection title="Details">
        {(fields.fields || []).length ? <div className="grid gap-3 sm:grid-cols-2">{fields.fields!.map((field) => <label key={field.key} className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{field.label}<input name={field.key} defaultValue={entry?.details?.[field.key] || ''} placeholder={field.placeholder} className={`${quiet} py-1.5 text-[15px] font-bold normal-case tracking-normal text-foreground`} /></label>)}</div> : null}
        {type === 'work_career' ? <WorkTags selected={tags} setSelected={change(setTags)} /> : null}
        {type !== 'work_career' && !(fields.fields || []).length ? <p className="text-sm text-muted-foreground">Nothing more to add for this type.</p> : null}
      </ItemSection> : null}

      {open.photos ? <ItemSection title="Photos" action={<button type="button" onClick={() => setPicker(true)} className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" />Add</button>}>
        <PhotoPicker images={images} setImages={change(setImages)} cover={cover} setCover={change(setCover)} userId={userId} token={token} open={picker} setOpen={setPicker} title="Add a photo" />
        {!images.length ? <p className="text-sm text-muted-foreground">A photo of you there, the place, or something you did. The first one becomes the cover.</p> : null}
      </ItemSection> : null}

      {open.projects ? <ItemSection title="Projects from here">
        <div className="flex flex-wrap gap-2">
          {projects.map((project) => { const on = linked.includes(project.project_uuid); return <button key={project.project_uuid} type="button" aria-pressed={on} onClick={() => change(setLinked)(on ? linked.filter((uuid) => uuid !== project.project_uuid) : [...linked, project.project_uuid])} className={`inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3 text-[13px] font-bold ${on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'}`}>{on ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{project.title}</button> })}
          {entry ? <Link href={`${getUriWithOrg(orgslug, '/portfolio/projects/new')}?experience=${entry.timeline_uuid}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-dashed border-border px-3 text-[13px] font-bold text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" />Something new you made here</Link> : null}
        </div>
        {!projects.length && !entry ? <p className="text-sm text-muted-foreground">Once this is saved you can add something you made here.</p> : null}
      </ItemSection> : null}

      {!open.details || !open.photos || !open.projects ? <div className="flex flex-wrap gap-2">
        {!open.details ? <AddChip icon={ListPlus} onClick={() => setOpen((now) => ({ ...now, details: true }))}>Details</AddChip> : null}
        {!open.photos ? <AddChip icon={Camera} onClick={() => { setOpen((now) => ({ ...now, photos: true })); setPicker(true) }}>Photos</AddChip> : null}
        {!open.projects ? <AddChip icon={FolderOpen} onClick={() => setOpen((now) => ({ ...now, projects: true }))}>Project</AddChip> : null}
      </div> : null}

      <SaveBar show={dirty} busy={busy} label={entry ? 'Save' : 'Add to my portfolio'} mark={entry ? undefined : mark} onCancel={() => entry ? window.location.reload() : router.push(list)} cancelLabel={entry ? 'Undo' : 'Cancel'} />
    </form>
    {ask.dialog}
  </main>
}
