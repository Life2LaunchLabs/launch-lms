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
import type { Contact, Project, Quote } from '../portfolioTypes'
import { ItemQuotes } from './AskQuote'
import { ItemConversations } from './PortfolioTalk'
import { EXPERIENCE_LOOKS, KindCover, experienceLook } from './covers'
import { AddChip, ItemHero, ItemSection, PhotoPicker, SaveBar, blockImages, imageBlocks, quiet, type Picked, type Setter } from './inplace'
import { PALETTE, SpotTip } from './parts'

import { tr } from '@/lib/tr'
// One experience, made and edited on its own page: a new one starts as a blank page that reads like the
// finished thing. What did you do, where, and when come first; everything else is an optional chip.

export const EXPERIENCE_TYPES = Object.entries(EXPERIENCE_LOOKS).map(([value, look]) => ({ value, label: look.label }))

type Extra = { key: string; label: string; placeholder?: string }
const TYPE_FIELDS: Record<string, { title: string; organization: string; location?: boolean; fields?: Extra[] }> = {
  work_career: { get title() { return tr('portfolio.experience_page.what_did_you_do', 'What did you do?') }, get organization() { return tr('lit.experience_page.where_the_business_or_organization', 'Where: the business or organization') }, location: true },
  education: { get title() { return tr('portfolio.experience_page.your_program_or_diploma', 'Your program or diploma') }, get organization() { return tr('lit.experience_page.school', 'School') }, location: true, fields: [{ key: 'field', get label() { return tr('portfolio.experience_page.field_of_study', 'Field of study') }, get placeholder() { return tr('portfolio.experience_page.environmental_science', 'Environmental science') } }, { key: 'grade_recognition', get label() { return tr('portfolio.experience_page.grades_and_honors', 'Grades and honors') }, get placeholder() { return tr('portfolio.experience_page.gpa_honor_roll_distinction', 'GPA, honor roll, distinction') } }] },
  leadership_service: { get title() { return tr('portfolio.experience_page.your_role_like_volunteer', 'Your role, like Volunteer') }, get organization() { return tr('lit.experience_page.organization_or_community', 'Organization or community') }, location: true, fields: [{ key: 'cause', get label() { return tr('portfolio.experience_page.cause_or_focus', 'Cause or focus') }, get placeholder() { return tr('portfolio.experience_page.what_did_you_serve_or', 'What did you serve or lead?') } }] },
  learning_experiences: { get title() { return tr('portfolio.experience_page.course_or_program', 'Course or program') }, get organization() { return tr('lit.experience_page.who_ran_it', 'Who ran it') }, location: true, fields: [{ key: 'credential', get label() { return tr('portfolio.experience_page.what_you_came_away_with', 'What you came away with') }, get placeholder() { return tr('portfolio.experience_page.a_certificate_a_skill_an', 'A certificate, a skill, an outcome') } }] },
  teams_activities: { get title() { return tr('portfolio.experience_page.your_role_like_point_guard', 'Your role, like Point guard') }, get organization() { return tr('lit.experience_page.team_club_or_group', 'Team, club or group') }, location: true, fields: [{ key: 'activity_kind', get label() { return tr('portfolio.experience_page.kind_of_activity', 'Kind of activity') }, get placeholder() { return tr('portfolio.experience_page.club_sport_band_community', 'Club, sport, band, community') } }] },
  awards_recognition: { get title() { return tr('portfolio.experience_page.the_award', 'The award') }, get organization() { return tr('lit.experience_page.who_gave_it', 'Who gave it') }, fields: [{ key: 'recognition', get label() { return tr('portfolio.experience_page.level_or_placement', 'Level or placement') }, get placeholder() { return tr('portfolio.experience_page.state_finalist_1st_place', 'State finalist, 1st place') } }] },
  challenges_milestones: { get title() { return tr('portfolio.experience_page.the_challenge_or_milestone', 'The challenge or milestone') }, get organization() { return tr('lit.experience_page.where_it_happened', 'Where it happened') }, location: true, fields: [{ key: 'outcome', get label() { return tr('portfolio.experience_page.how_it_turned_out', 'How it turned out') }, get placeholder() { return tr('portfolio.experience_page.what_changed_for_you', 'What changed for you?') } }] },
  other: { get title() { return tr('portfolio.experience_page.what_did_you_do', 'What did you do?') }, get organization() { return tr('lit.experience_page.where', 'Where') }, location: true },
}
const DETAIL_GROUPS = [
  { get label() { return tr('portfolio.experience_page.where', 'Where') }, exclusive: true, options: ['In-person', 'Hybrid', 'Remote'] },
  { get label() { return tr('portfolio.experience_page.schedule', 'Schedule') }, exclusive: true, options: ['Full-time', 'Part-time'] },
  { get label() { return tr('portfolio.experience_page.arrangement', 'Arrangement') }, exclusive: false, options: ['Contract', 'Internship', 'Self-employed'] },
]
const LEGACY: Record<string, string> = { employment: 'work_career', volunteering: 'leadership_service', training: 'learning_experiences', experience: 'other' }
const typeOf = (type?: string) => { const value = LEGACY[type || ''] || type || ''; return TYPE_FIELDS[value] ? value : 'work_career' }

/** Work arrangement tags, each group picked from in place. */
function WorkTags({ selected, setSelected }: { selected: string[]; setSelected: Setter<string[]> }) {
  const toggle = (option: string, group: typeof DETAIL_GROUPS[number]) => setSelected(selected.includes(option) ? selected.filter((item) => item !== option) : [...(group.exclusive ? selected.filter((item) => !group.options.includes(item)) : selected), option])
  return <div className="grid gap-3 sm:grid-cols-3">{DETAIL_GROUPS.map((group) => <fieldset key={group.label}><legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{group.label}</legend><div className="flex flex-wrap gap-1.5">{group.options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => toggle(option, group)} className={`h-8 rounded-full border-2 px-3 text-xs font-bold ${selected.includes(option) ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'}`}>{option}</button>)}</div></fieldset>)}</div>
}

export function ExperiencePage({ entry, projects, orgslug, initialType, mark, quotes = [], contacts = [], portfolioUuid }: { entry?: TimelineEntry; projects: Project[]; orgslug: string; initialType?: string; mark?: string; quotes?: Quote[]; contacts?: Contact[]; portfolioUuid?: string }) {
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
      cover_asset_uuid: cover || null, blocks: imageBlocks(images), project_links: linked.map((project_uuid) => ({ project_uuid, relationship_label: tr('lit.experience_page.related_to_this_experience', 'Related to this experience') })),
    }
    setBusy(true)
    try {
      if (entry) {
        await updatePortfolioTimeline(entry.timeline_uuid, { ...body, revision: entry.revision }, token)
        toast.success(tr('portfolio.experience_page.saved', 'Saved')); setDirty(false); router.refresh()
      } else {
        const saved = await createPortfolioTimeline({ ...body, idempotency_key: crypto.randomUUID() }, token) as TimelineEntry
        toast.success(tr('portfolio.experience_page.added_to_your_portfolio', 'Added to your portfolio'))
        router.replace(getUriWithOrg(orgslug, `/portfolio/timeline/${saved.timeline_uuid}`)); router.refresh()
      }
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_save_this', 'Could not save this')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!entry || !token) return
    if (!await ask.confirm({ title: tr('portfolio.experience_page.delete_title', 'Delete {{title}}?', { title: entry.title }), body: tr('lit.experience_page.it_comes_off_your_portfolio', 'It comes off your portfolio and your résumés. This can’t be undone.'), action: tr('lit.experience_page.delete', 'Delete'), danger: true })) return
    try { await deletePortfolioTimeline(entry.timeline_uuid, entry.revision, token); router.push(list); router.refresh() } catch (error: any) { toast.error(error?.message || tr('portfolio.experience_page.could_not_delete_this', 'Could not delete this')) }
  }

  return <main className="min-h-screen bg-background pb-24 text-foreground" data-experience-page={entry ? 'edit' : 'new'}>
    <form onSubmit={submit} onChange={() => setDirty(true)} className="mx-auto grid max-w-[760px] gap-7 px-4 pt-2 sm:px-6">
      <div>
        <ItemHero back={list} backLabel={tr('lit.experience_page.experience', 'Experience')} cover={<KindCover kind="experience" type={type} url={coverUrl ? normalizeMediaUrl(coverUrl) : ''} />} onCover={() => { setOpen((now) => ({ ...now, photos: true })); setPicker(true) }}>
          {entry ? <button type="button" onClick={() => void remove()} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" />{tr('portfolio.experience_page.delete', 'Delete')}</button> : null}
        </ItemHero>
        <div className="mt-5 grid gap-2">
          <label className="relative inline-flex h-8 w-fit items-center gap-1.5 rounded-full pl-3 pr-8 text-[12.5px] font-extrabold" style={{ background: `color-mix(in srgb, ${face} 16%, hsl(var(--card)))`, color: edge }}>
            <Icon className="h-4 w-4" />
            <select aria-label={tr('portfolio.experience_page.type', 'Type')} value={type} onChange={(event) => change(setType)(event.target.value)} className="appearance-none bg-transparent font-extrabold outline-none dark:text-white">{EXPERIENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5" />
          </label>
          <input name="title" required aria-label={tr('portfolio.experience_page.what_did_you_do', 'What did you do?')} defaultValue={entry?.title} autoFocus={!entry} placeholder={fields.title} className={`${quiet} text-[clamp(26px,4vw,38px)] font-extrabold leading-tight`} />
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <label className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4 shrink-0" /><input name="organization" aria-label={tr('portfolio.experience_page.organization', 'Organization')} defaultValue={entry?.organization} placeholder={fields.organization} className={`${quiet} py-1.5 text-[15px] font-bold text-foreground`} /></label>
            {fields.location ? <label className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><input name="location_label" aria-label={tr('portfolio.portfolio_header_parts.location', 'Location')} defaultValue={entry?.location_label} placeholder={tr('portfolio.experience_page.city_or_online', 'City, or online')} className={`${quiet} py-1.5 text-[15px] font-bold text-foreground`} /></label> : null}
          </div>
          <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 pt-1 text-muted-foreground" onClickCapture={() => setDirty(true)}><CalendarDays className="mt-3.5 h-4 w-4" /><div className="text-foreground"><MonthDateRangeField startDate={entry?.start_date} endDate={entry?.end_date} isCurrent={entry ? entry.is_current : true} startPrecision={entry?.start_precision} endPrecision={entry?.end_precision} /></div></div>
        </div>
      </div>

      {/* A saved experience opened for "Tell your stories" carries the "!" here. */}
      <div className={`group relative rounded-2xl ${entry && mark ? 'ring-4 ring-[#ffc21a]/45' : ''}`}>
        {entry && mark ? <SpotTip label={mark} className="absolute -top-3.5 right-3" /> : null}
        <textarea name="summary" aria-label={tr('portfolio.experience_page.what_you_did_there', 'What you did there')} defaultValue={entry?.summary} rows={3} placeholder={entry && mark ? tr('portfolio.experience_page.tell_it_in_a_few', 'Tell it in a few sentences: what you did, what was hard, what you’d do again.') : tr('portfolio.experience_page.what_did_you_do_there', 'What did you do there? A sentence or two is plenty.')} className={`${quiet} min-h-[5.5rem] resize-none py-2 text-[17px] font-semibold leading-relaxed [field-sizing:content]`} />
      </div>

      {open.details ? <ItemSection title={tr('portfolio.experience_page.details', 'Details')}>
        {(fields.fields || []).length ? <div className="grid gap-3 sm:grid-cols-2">{fields.fields!.map((field) => <label key={field.key} className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{field.label}<input name={field.key} defaultValue={entry?.details?.[field.key] || ''} placeholder={field.placeholder} className={`${quiet} py-1.5 text-[15px] font-bold normal-case tracking-normal text-foreground`} /></label>)}</div> : null}
        {type === 'work_career' ? <WorkTags selected={tags} setSelected={change(setTags)} /> : null}
        {type !== 'work_career' && !(fields.fields || []).length ? <p className="text-sm text-muted-foreground">{tr('portfolio.experience_page.nothing_more_to_add_for', 'Nothing more to add for this type.')}</p> : null}
      </ItemSection> : null}

      {open.photos ? <ItemSection title={tr('portfolio.experience_page.photos', 'Photos')} action={<button type="button" onClick={() => setPicker(true)} className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" />{tr('portfolio.portfolio_header_parts.add', 'Add')}</button>}>
        <PhotoPicker images={images} setImages={change(setImages)} cover={cover} setCover={change(setCover)} userId={userId} token={token} open={picker} setOpen={setPicker} title={tr('portfolio.inplace.add_a_photo', 'Add a photo')} />
        {!images.length ? <p className="text-sm text-muted-foreground">{tr('portfolio.experience_page.a_photo_of_you_there', 'A photo of you there, the place, or something you did. The first one becomes the cover.')}</p> : null}
      </ItemSection> : null}

      {open.projects ? <ItemSection title={tr('portfolio.experience_page.projects_from_here', 'Projects from here')}>
        <div className="flex flex-wrap gap-2">
          {projects.map((project) => { const on = linked.includes(project.project_uuid); return <button key={project.project_uuid} type="button" aria-pressed={on} onClick={() => change(setLinked)(on ? linked.filter((uuid) => uuid !== project.project_uuid) : [...linked, project.project_uuid])} className={`inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3 text-[13px] font-bold ${on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'}`}>{on ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{project.title}</button> })}
          {entry ? <Link href={`${getUriWithOrg(orgslug, '/portfolio/projects/new')}?experience=${entry.timeline_uuid}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-dashed border-border px-3 text-[13px] font-bold text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" />{tr('portfolio.experience_page.something_new_you_made_here', 'Something new you made here')}</Link> : null}
        </div>
        {!projects.length && !entry ? <p className="text-sm text-muted-foreground">{tr('portfolio.experience_page.once_this_is_saved_you', 'Once this is saved you can add something you made here.')}</p> : null}
      </ItemSection> : null}

      {!open.details || !open.photos || !open.projects ? <div className="flex flex-wrap gap-2">
        {!open.details ? <AddChip icon={ListPlus} onClick={() => setOpen((now) => ({ ...now, details: true }))}>{tr('portfolio.experience_page.details', 'Details')}</AddChip> : null}
        {!open.photos ? <AddChip icon={Camera} onClick={() => { setOpen((now) => ({ ...now, photos: true })); setPicker(true) }}>{tr('portfolio.experience_page.photos', 'Photos')}</AddChip> : null}
        {!open.projects ? <AddChip icon={FolderOpen} onClick={() => setOpen((now) => ({ ...now, projects: true }))}>{tr('portfolio.experience_page.project', 'Project')}</AddChip> : null}
      </div> : null}

      <SaveBar show={dirty} busy={busy} label={entry ? tr('portfolio.resume_builder.save', 'Save') : tr('portfolio.experience_page.add_to_my_portfolio', 'Add to my portfolio')} mark={entry ? undefined : mark} onCancel={() => entry ? window.location.reload() : router.push(list)} cancelLabel={entry ? tr('portfolio.experience_page.undo', 'Undo') : tr('portfolio.connect_request.cancel', 'Cancel')} />
    </form>
    {/* Outside the form: asking for a quote is its own action, not part of saving the page. */}
    {entry ? <div className="mx-auto mt-10 max-w-[760px] px-4 sm:px-6"><ItemQuotes item={{ kind: 'experience', uuid: entry.timeline_uuid, title: entry.title }} quotes={quotes} contacts={contacts} token={token} /><ItemConversations portfolioUuid={portfolioUuid} item={{ uuid: entry.timeline_uuid, title: entry.title }} orgslug={orgslug} token={token} /></div> : null}
    {ask.dialog}
  </main>
}
