'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Camera, ChevronDown, Link2, PencilLine, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useAsk } from '@components/ui/ask-dialog'
import { getUriWithOrg } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { createPortfolioProject, deletePortfolioProject, updatePortfolioProject, updatePortfolioTimeline } from '@services/portfolio/portfolio'
import { MonthDateRangeField } from '../MonthDateRangeField'
import type { TimelineEntry } from '../Timeline'
import type { Contact, Project, Quote } from '../portfolioTypes'
import { ItemQuotes } from './AskQuote'
import { ItemConversations } from './PortfolioTalk'
import { KindCover, experienceLook } from './covers'
import { AddChip, ItemHero, ItemSection, PhotoPicker, SaveBar, blockImages, imageBlocks, quiet, type Picked, type Setter } from './inplace'

import { tr } from '@/lib/tr'
// One project, made and edited on its own page like the prototype: a name and a line are enough, the story
// behind it, photos and a link are optional, and it can say which experience it came from.

const STORY = [
  { type: 'process', get label() { return tr('portfolio.project_page.the_challenge', 'The challenge') }, get placeholder() { return tr('portfolio.project_page.what_were_you_trying_to', 'What were you trying to make or solve?') } },
  { type: 'contribution', get label() { return tr('portfolio.project_page.what_i_did', 'What I did') }, get placeholder() { return tr('portfolio.project_page.your_part_the_steps_the', 'Your part: the steps, the tools, the decisions.') } },
  { type: 'outcome', get label() { return tr('portfolio.experience_page.how_it_turned_out', 'How it turned out') }, get placeholder() { return tr('portfolio.project_page.what_happened_what_you_learned', 'What happened, what you learned, what you would change.') } },
] as const

const textOf = (project: Project | undefined, type: string) => String(project?.blocks.find((block) => block.block_type === type)?.data?.text || '')
const links = (entry: TimelineEntry) => (entry.projects || []).map((item: any) => ({ project_uuid: item.project_uuid, relationship_label: item.relationship_label || tr('lit.experience_page.related_to_this_experience', 'Related to this experience') }))

export function ProjectPage({ project, timeline, orgslug, experience: askedExperience, mark, quotes = [], contacts = [], portfolioUuid }: { project?: Project; timeline: TimelineEntry[]; orgslug: string; experience?: string; mark?: string; quotes?: Quote[]; contacts?: Contact[]; portfolioUuid?: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const userId = Number(session?.data?.user?.id || 0)
  const router = useRouter()
  const ask = useAsk()
  const partOf = project ? timeline.find((entry) => (entry.projects || []).some((item: any) => item.project_uuid === project.project_uuid))?.timeline_uuid || '' : askedExperience || ''
  const [experience, setExperience] = useState(partOf)
  const [images, setImages] = useState<Picked[]>(blockImages(project?.blocks))
  const [cover, setCover] = useState(project?.cover_asset_uuid || '')
  const [open, setOpen] = useState({ story: STORY.some((part) => textOf(project, part.type)), photos: images.length > 0, link: Boolean(project?.blocks.find((block) => block.block_type === 'link')) })
  const [picker, setPicker] = useState(false)
  const [dirty, setDirty] = useState(!project)
  const [busy, setBusy] = useState(false)
  const list = getUriWithOrg(orgslug, '/portfolio/projects')
  const coverUrl = images.find((image) => image.asset_uuid === cover)?.url || project?.cover_url || ''
  const change = <T,>(set: Setter<T>) => (value: T) => { set(value); setDirty(true) }
  const linkBlock = project?.blocks.find((block) => block.block_type === 'link')

  /** Moves the project to the experience picked here, taking it off the one it was part of. */
  async function relink(uuid: string) {
    if (experience === partOf) return
    for (const entry of timeline) {
      const had = links(entry).filter((item) => item.project_uuid !== uuid)
      if (entry.timeline_uuid === partOf) await updatePortfolioTimeline(entry.timeline_uuid, { revision: entry.revision, project_links: had }, token)
      if (entry.timeline_uuid === experience) await updatePortfolioTimeline(entry.timeline_uuid, { revision: entry.revision, project_links: [...had, { project_uuid: uuid, relationship_label: tr('lit.experience_page.related_to_this_experience', 'Related to this experience') }] }, token)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const data = new FormData(event.currentTarget)
    const ongoing = data.get('is_ongoing') === 'true'
    const url = String(data.get('link_url') || '').trim()
    const body = {
      title: String(data.get('title') || '').trim(), subtitle: String(data.get('subtitle') || ''),
      start_date: String(data.get('start_date') || '') || null, end_date: ongoing ? null : String(data.get('end_date') || '') || null, is_ongoing: ongoing,
      cover_asset_uuid: cover || null,
      blocks: [
        { block_type: 'text', data: { text: String(data.get('story') || '') } },
        ...STORY.map((part) => ({ block_type: part.type, data: { text: String(data.get(part.type) || '') } })).filter((block) => block.data.text.trim()),
        ...(url ? [{ block_type: 'link', data: { url: /^https?:\/\//.test(url) ? url : `https://${url}`, label: String(data.get('link_label') || '') } }] : []),
        ...imageBlocks(images),
      ],
    }
    setBusy(true)
    try {
      if (project) {
        await updatePortfolioProject(project.project_uuid, { ...body, revision: project.revision }, token)
        await relink(project.project_uuid)
        toast.success(tr('portfolio.experience_page.saved', 'Saved')); setDirty(false); router.refresh()
      } else {
        const saved = await createPortfolioProject({ ...body, idempotency_key: crypto.randomUUID() }, token) as Project
        await relink(saved.project_uuid)
        toast.success(tr('portfolio.experience_page.added_to_your_portfolio', 'Added to your portfolio'))
        router.replace(getUriWithOrg(orgslug, `/portfolio/projects/${saved.project_uuid}`)); router.refresh()
      }
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_save_this', 'Could not save this')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!project || !token) return
    if (!await ask.confirm({ title: tr('portfolio.experience_page.delete_title', 'Delete {{title}}?', { title: project.title }), body: tr('lit.experience_page.it_comes_off_your_portfolio', 'It comes off your portfolio and your résumés. This can’t be undone.'), action: tr('lit.experience_page.delete', 'Delete'), danger: true })) return
    try { await deletePortfolioProject(project.project_uuid, project.revision, token); router.push(list); router.refresh() } catch (error: any) { toast.error(error?.message || tr('portfolio.experience_page.could_not_delete_this', 'Could not delete this')) }
  }

  const picked = timeline.find((entry) => entry.timeline_uuid === experience)
  const PickedIcon = experienceLook(picked?.entry_type).icon
  return <main className="min-h-screen bg-background pb-24 text-foreground" data-project-page={project ? 'edit' : 'new'}>
    <form onSubmit={submit} onChange={() => setDirty(true)} className="mx-auto grid max-w-[760px] gap-7 px-4 pt-2 sm:px-6">
      <div>
        <ItemHero back={list} backLabel={tr('lit.portfolio_projects.projects', 'Projects')} cover={<KindCover kind="project" url={coverUrl ? normalizeMediaUrl(coverUrl) : ''} />} onCover={() => { setOpen((now) => ({ ...now, photos: true })); setPicker(true) }}>
          {project ? <button type="button" onClick={() => void remove()} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" />{tr('portfolio.experience_page.delete', 'Delete')}</button> : null}
        </ItemHero>
        <div className="mt-5 grid gap-2">
          <input name="title" required aria-label={tr('portfolio.project_page.what_did_you_make', 'What did you make?')} defaultValue={project?.title} autoFocus={!project} placeholder={tr('portfolio.project_page.what_did_you_make', 'What did you make?')} className={`${quiet} text-[clamp(26px,4vw,38px)] font-extrabold leading-tight`} />
          <input name="subtitle" aria-label={tr('portfolio.project_page.what_it_is', 'What it is')} defaultValue={project?.subtitle} placeholder={tr('portfolio.project_page.what_it_is_in_a', 'What it is, in a few words: a mural, an app, a short film')} className={`${quiet} py-1.5 text-[15px] font-bold text-muted-foreground`} />
          <label className="relative mt-1 inline-flex h-9 w-fit max-w-full items-center gap-2 rounded-full border-2 border-border bg-card pl-3 pr-8 text-[13px] font-bold">
            {picked ? <PickedIcon className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
            <select aria-label={tr('portfolio.project_page.part_of_an_experience', 'Part of an experience')} value={experience} onChange={(event) => change(setExperience)(event.target.value)} className="min-w-0 appearance-none truncate bg-transparent outline-none">
              <option value="">{tr('portfolio.project_page.link_to_an_experience', 'Link to an experience')}</option>
              {timeline.map((entry) => <option key={entry.timeline_uuid} value={entry.timeline_uuid}>{tr('portfolio.project_page.part_of_title', 'Part of {{title}}', { title: entry.title })}{entry.organization ? `, ${entry.organization}` : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5" />
          </label>
          <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 pt-1 text-muted-foreground" onClickCapture={() => setDirty(true)}><CalendarDays className="mt-3.5 h-4 w-4" /><div className="text-foreground"><MonthDateRangeField startDate={project?.start_date} endDate={project?.end_date} isCurrent={project?.is_ongoing} currentFieldName="is_ongoing" /></div></div>
        </div>
      </div>

      <textarea name="story" aria-label={tr('portfolio.project_page.about_it', 'About it')} defaultValue={textOf(project, 'text') || project?.summary || ''} rows={3} placeholder={tr('portfolio.project_page.a_line_about_it_what', 'A line about it: what it is and why you made it.')} className={`${quiet} min-h-[5.5rem] resize-none py-2 text-[17px] font-semibold leading-relaxed [field-sizing:content]`} />

      {open.story ? <ItemSection title={tr('portfolio.project_page.the_story_behind_it', 'The story behind it')}>
        {STORY.map((part) => <label key={part.type} className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{part.label}<textarea name={part.type} defaultValue={textOf(project, part.type)} rows={2} placeholder={part.placeholder} className={`${quiet} resize-none py-1.5 text-[15px] font-semibold normal-case leading-relaxed tracking-normal text-foreground [field-sizing:content]`} /></label>)}
      </ItemSection> : null}

      {open.photos ? <ItemSection title={tr('portfolio.experience_page.photos', 'Photos')}>
        <PhotoPicker images={images} setImages={change(setImages)} cover={cover} setCover={change(setCover)} userId={userId} token={token} open={picker} setOpen={setPicker} title={tr('portfolio.inplace.add_a_photo', 'Add a photo')} />
        {!images.length ? <p className="text-sm text-muted-foreground">{tr('portfolio.project_page.the_thing_itself_you_making', 'The thing itself, you making it, or the finished result. The first one becomes the cover.')}</p> : null}
      </ItemSection> : null}

      {open.link ? <ItemSection title={tr('portfolio.project_page.link', 'Link')}>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <input name="link_url" aria-label={tr('portfolio.project_page.link', 'Link')} inputMode="url" defaultValue={String(linkBlock?.data?.url || '')} placeholder={tr('portfolio.project_page.where_people_can_see_it', 'Where people can see it: a site, a video, a repo')} className={`${quiet} py-1.5 text-[15px] font-bold`} />
          <input name="link_label" aria-label={tr('portfolio.project_page.link_name', 'Link name')} defaultValue={String(linkBlock?.data?.label || '')} placeholder={tr('portfolio.project_page.name_it_optional', 'Name it (optional)')} className={`${quiet} py-1.5 text-[15px] font-bold`} />
        </div>
      </ItemSection> : null}

      {!open.story || !open.photos || !open.link ? <div className="flex flex-wrap gap-2">
        {!open.story ? <AddChip icon={PencilLine} onClick={() => setOpen((now) => ({ ...now, story: true }))}>{tr('portfolio.project_page.tell_the_story_behind_it', 'Tell the story behind it')}</AddChip> : null}
        {!open.photos ? <AddChip mark={project ? mark : undefined} icon={Camera} onClick={() => { setOpen((now) => ({ ...now, photos: true })); setPicker(true) }}>{tr('portfolio.experience_page.photos', 'Photos')}</AddChip> : null}
        {!open.link ? <AddChip icon={Link2} onClick={() => setOpen((now) => ({ ...now, link: true }))}>{tr('portfolio.project_page.add_a_link', 'Add a link')}</AddChip> : null}
      </div> : null}

      <SaveBar show={dirty} busy={busy} label={project ? tr('portfolio.resume_builder.save', 'Save') : tr('portfolio.experience_page.add_to_my_portfolio', 'Add to my portfolio')} mark={project ? undefined : mark} onCancel={() => project ? window.location.reload() : router.push(list)} cancelLabel={project ? tr('portfolio.experience_page.undo', 'Undo') : tr('portfolio.connect_request.cancel', 'Cancel')} />
    </form>
    {/* Outside the form: asking for a quote is its own action, not part of saving the page. */}
    {project ? <div className="mx-auto mt-10 max-w-[760px] px-4 sm:px-6"><ItemQuotes item={{ kind: 'project', uuid: project.project_uuid, title: project.title }} quotes={quotes} contacts={contacts} token={token} /><ItemConversations portfolioUuid={portfolioUuid} item={{ uuid: project.project_uuid, title: project.title }} orgslug={orgslug} token={token} /></div> : null}
    {ask.dialog}
  </main>
}
