'use client'

import Link from 'next/link'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, BriefcaseBusiness, Eye, EyeOff, FolderOpen, MoreHorizontal, Plus, ShieldCheck, Star } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { getMyPortfolio, updateMyPortfolioBadgeVisibility, updateMyPortfolioFeaturedBadges, updateMyPortfolioFeaturedProject, updateMyPortfolioFeaturedTimeline, updatePortfolioProject, updatePortfolioTimeline } from '@services/portfolio/portfolio'
import { credentials as credentialsApi } from '@services/portfolio/records'
import { EXPERIENCE_TYPES, ExperienceEditorDialog } from '../ExperienceEditor'
import { ProjectEditorDialog } from '../ProjectEditorDialog'
import { timelineDateLabel, type TimelineEntry } from '../Timeline'
import { CredentialFace } from './PortfolioTiles'
import { Cover, EmptyAdd, PALETTE, type TileColor } from './parts'
import type { Credential, PortfolioBadge, Project, Shell } from '../portfolioTypes'

// The new portfolio's section pages: a one-row header, then every item with its row controls. The star
// features an item on the front page and the eye hides it from visitors; both stay visible while on.

export type DetailView = 'timeline' | 'projects' | 'badges'

// Older entries used other type names; they sit with the type that replaced them.
const LEGACY_TYPES: Record<string, string> = { employment: 'work_career', volunteering: 'leadership_service', training: 'learning_experiences', experience: 'other' }
const VIEWS: Record<DetailView, { title: string; color: TileColor; icon: ComponentType<{ className?: string }> }> = {
  timeline: { title: 'Experience', color: 'teal', icon: BriefcaseBusiness },
  projects: { title: 'Projects', color: 'pink', icon: FolderOpen },
  badges: { title: 'Credentials & badges', color: 'blue', icon: ShieldCheck },
}

/** A YYYY-MM month as "Jun 2027". */
const month = (value?: string | null) => value && /^\d{4}-\d{2}$/.test(value) ? new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : value || ''

type Controls = { featured: boolean; hidden: boolean; onFeature: () => void; onHide: () => void; name: string; menu?: ReactNode }

/** Star, eye and more. An active star or a closed eye always shows; the rest show on hover or focus. */
function RowControls({ featured, hidden, onFeature, onHide, name, menu }: Controls) {
  const quiet = 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
  const button = 'grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground'
  return <div className="relative z-[1] flex shrink-0 items-center gap-0.5">
    <button type="button" onClick={onFeature} aria-pressed={featured} aria-label={featured ? `Stop featuring ${name}` : `Feature ${name} on your front page`} title={featured ? 'Featured on your front page' : 'Feature on your front page'} className={`${button} ${featured ? '!text-[#F5A524]' : quiet}`}><Star className="h-4 w-4" fill={featured ? 'currentColor' : 'none'} /></button>
    <button type="button" onClick={onHide} aria-pressed={hidden} aria-label={hidden ? `Show ${name} to visitors` : `Hide ${name} from visitors`} title={hidden ? 'Hidden from visitors' : 'Hide from visitors'} className={`${button} ${hidden ? '!text-foreground' : quiet}`}>{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    {menu ? <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`More for ${name}`} className={`${button} ${quiet}`}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44 rounded-2xl p-2">{menu}</DropdownMenuContent></DropdownMenu> : null}
  </div>
}

function Row({ href, children, controls, dim }: { href?: string; children: ReactNode; controls?: ReactNode; dim?: boolean }) {
  return <li className="group/row relative flex min-w-0 items-center gap-3 rounded-2xl p-2 transition hover:bg-muted/60">
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${dim ? 'opacity-55' : ''}`}>{children}</div>
    {href ? <Link href={href} className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground"><span className="sr-only">Open</span></Link> : null}
    {controls}
  </li>
}

export function PortfolioDetail({ view, initialShell, orgslug, username, owner = false }: { view: DetailView; initialShell: Shell; orgslug: string; username?: string; owner?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [shell, setShell] = useState(initialShell)
  // The front page's Add menu opens an experience type here.
  const askedType = owner && view === 'timeline' ? searchParams.get('experience') : null
  const [experience, setExperience] = useState<{ type?: string; entry?: TimelineEntry } | null>(askedType ? { type: askedType } : null)
  const [projectEditor, setProjectEditor] = useState<{ project?: Project } | null>(null)
  const { title, color, icon: Icon } = VIEWS[view]
  const [face, edge] = PALETTE[color]
  const base = owner ? '/portfolio' : `/user/${username}`

  useEffect(() => {
    if (askedType) window.history.replaceState({}, '', pathname)
  }, [askedType, pathname])

  async function run(change: () => Promise<unknown>, failure: string) {
    if (!token) return
    try { await change(); setShell(await getMyPortfolio(token)) } catch (error: any) { toast.error(error?.message || failure) }
  }
  const featureTimeline = (entry: TimelineEntry) => run(() => updateMyPortfolioFeaturedTimeline({ timeline_uuids: entry.featured ? shell.timeline.filter((item) => item.featured && item.timeline_uuid !== entry.timeline_uuid).map((item) => item.timeline_uuid) : [...shell.timeline.filter((item) => item.featured).map((item) => item.timeline_uuid), entry.timeline_uuid] }, token), 'Could not change what’s featured')
  const hideTimeline = (entry: TimelineEntry) => run(() => updatePortfolioTimeline(entry.timeline_uuid, { revision: entry.revision, visibility: (entry as any).visibility === 'private' ? 'public' : 'private' }, token), 'Could not change who sees this')
  const featureProject = (project: Project) => run(() => updateMyPortfolioFeaturedProject({ project_uuids: project.featured ? shell.projects.filter((item) => item.featured && item.project_uuid !== project.project_uuid).map((item) => item.project_uuid) : [...shell.projects.filter((item) => item.featured).map((item) => item.project_uuid), project.project_uuid] }, token), 'Could not change what’s featured')
  const hideProject = (project: Project) => run(() => updatePortfolioProject(project.project_uuid, { revision: project.revision, visibility: (project as any).visibility === 'private' ? 'public' : 'private' }, token), 'Could not change who sees this')
  const featuredBadges = shell.badges?.featuredAwardUuids || []
  const hiddenBadges = shell.badges?.hiddenAwardUuids || []
  const featureBadge = (badge: PortfolioBadge) => run(() => updateMyPortfolioFeaturedBadges({ award_uuids: featuredBadges.includes(badge.award_uuid) ? featuredBadges.filter((uuid) => uuid !== badge.award_uuid) : [...featuredBadges, badge.award_uuid] }, token), 'Could not change what’s featured')
  const hideBadge = (badge: PortfolioBadge) => run(() => updateMyPortfolioBadgeVisibility({ revision: shell.portfolio.revision, hidden_award_uuids: hiddenBadges.includes(badge.award_uuid) ? hiddenBadges.filter((uuid) => uuid !== badge.award_uuid) : [...hiddenBadges, badge.award_uuid] }, token), 'Could not change who sees this')
  const featureCredential = (credential: Credential) => run(() => credentialsApi.update(credential.credential_uuid, { featured: !credential.featured }, token), 'Could not change what’s featured')
  const hideCredential = (credential: Credential) => run(() => credentialsApi.update(credential.credential_uuid, { visibility: credential.visibility === 'private' ? 'public' : 'private' }, token), 'Could not change who sees this')

  const timelineSections = () => {
    const entries = shell.timeline || []
    const typeOf = (entry: TimelineEntry) => LEGACY_TYPES[entry.entry_type] || entry.entry_type
    const present = EXPERIENCE_TYPES.filter((type) => entries.some((entry) => typeOf(entry) === type.value))
    const missing = EXPERIENCE_TYPES.filter((type) => !present.includes(type))
    return <>
      {present.map((type) => <section key={type.value} aria-labelledby={`xp-${type.value}`} className="mb-6">
        <div className="mb-1 flex items-center gap-2 px-2"><h2 id={`xp-${type.value}`} className="flex-1 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">{type.label}</h2>{owner ? <Button type="button" variant="ghost" size="sm" onClick={() => setExperience({ type: type.value })}><Plus className="h-4 w-4" />Add</Button> : null}</div>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{entries.filter((entry) => typeOf(entry) === type.value).map((entry) => <Row key={entry.timeline_uuid} dim={(entry as any).visibility === 'private'} href={getUriWithOrg(orgslug, owner ? `/portfolio/timeline/${entry.timeline_uuid}` : `/user/${username}/timeline/${entry.slug}`)}
          controls={owner ? <RowControls name={entry.title} featured={Boolean(entry.featured)} hidden={(entry as any).visibility === 'private'} onFeature={() => featureTimeline(entry)} onHide={() => hideTimeline(entry)} menu={<DropdownMenuItem onSelect={() => setExperience({ entry })} className="rounded-xl px-3 py-2">Edit</DropdownMenuItem>} /> : null}>
          <span className="block aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-xl"><Cover url={entry.cover_url ? normalizeMediaUrl(entry.cover_url) : ''} seed={entry.timeline_uuid} /></span>
          <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{entry.title}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[entry.organization, timelineDateLabel(entry)].filter(Boolean).join(' · ')}</small></span>
        </Row>)}</ul>
      </section>)}
      {owner && missing.length ? <section aria-label="Add more" className="mt-2 flex flex-wrap gap-2 px-2">{missing.map((type) => <Button key={type.value} type="button" variant="surface" size="sm" onClick={() => setExperience({ type: type.value })}><Plus className="h-4 w-4" />{type.label}</Button>)}</section> : null}
      {!entries.length && !owner ? <p className="px-2 text-muted-foreground">Nothing here yet.</p> : null}
    </>
  }

  const projectGrid = () => {
    const projects = shell.projects || []
    if (!projects.length) return owner ? <EmptyAdd title="Add something you made" hint="Art, video, code, a build. A photo and a line is enough." onClick={() => setProjectEditor({})} /> : <p className="px-2 text-muted-foreground">Nothing here yet.</p>
    return <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">{projects.map((project) => { const hidden = (project as any).visibility === 'private'; return <li key={project.project_uuid} className="group/row relative grid min-w-0 content-start gap-2">
      <div className={`aspect-[4/5] overflow-hidden rounded-2xl ${hidden ? 'opacity-55' : ''}`}><Cover url={project.cover_url ? normalizeMediaUrl(project.cover_url) : ''} seed={project.project_uuid} /></div>
      <div className="flex min-w-0 items-start gap-1"><b className={`line-clamp-2 min-w-0 flex-1 text-sm font-extrabold leading-tight ${hidden ? 'opacity-55' : ''}`}>{project.title}</b>{owner ? <RowControls name={project.title} featured={project.featured} hidden={hidden} onFeature={() => featureProject(project)} onHide={() => hideProject(project)} menu={<DropdownMenuItem onSelect={() => setProjectEditor({ project })} className="rounded-xl px-3 py-2">Edit</DropdownMenuItem>} /> : null}</div>
      <Link href={getUriWithOrg(orgslug, owner ? `/portfolio/projects/${project.project_uuid}` : `/user/${username}/projects/${project.slug}`)} className="absolute inset-x-0 top-0 aspect-[4/5] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground"><span className="sr-only">Open {project.title}</span></Link>
    </li> })}</ul>
  }

  const credentialList = () => {
    const items = shell.credentials || []
    const badges = shell.badges?.earned || []
    return <>
      <section aria-labelledby="creds" className="mb-6">
        <h2 id="creds" className="mb-1 px-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Cards, certificates and diplomas</h2>
        {items.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{items.map((item) => <Row key={item.credential_uuid} dim={item.visibility === 'private'} controls={owner ? <RowControls name={item.name} featured={item.featured} hidden={item.visibility === 'private'} onFeature={() => featureCredential(item)} onHide={() => hideCredential(item)} /> : null}>
          <span className="w-20 shrink-0"><CredentialFace credential={item} /></span>
          <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{item.name}{item.score ? `: ${item.score}` : ''}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[item.issuer, item.expires_on ? `Expires ${month(item.expires_on)}` : item.expected_on && !item.issued_on ? `Expected ${month(item.expected_on)}` : month(item.issued_on)].filter(Boolean).join(' · ')}</small></span>
        </Row>)}</ul> : <p className="px-2 text-sm text-muted-foreground">{owner ? 'Food handler, CPR, a diploma: adding these comes next.' : 'Nothing here yet.'}</p>}
      </section>
      <section aria-labelledby="badges">
        <div className="mb-1 flex items-center gap-2 px-2"><h2 id="badges" className="flex-1 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Badges</h2>{owner ? <Button asChild variant="ghost" size="sm"><Link href={getUriWithOrg(orgslug, routePaths.org.discover())}>Find badges</Link></Button> : null}</div>
        {badges.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{badges.map((badge) => <Row key={badge.award_uuid} dim={hiddenBadges.includes(badge.award_uuid)} href={getUriWithOrg(orgslug, routePaths.org.badgeAward(badge.code))} controls={owner ? <RowControls name={badge.name} featured={featuredBadges.includes(badge.award_uuid)} hidden={hiddenBadges.includes(badge.award_uuid)} onFeature={() => featureBadge(badge)} onHide={() => hideBadge(badge)} /> : null}>
          <span className="grid w-20 shrink-0 place-items-center"><BadgeMedal badge={{ image_url: normalizeMediaUrl(badge.image_url || '') || '', icon: badge.icon, color: badge.color }} size={48} /></span>
          <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{badge.name}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[badge.issuer?.name, badge.earned_on ? `Earned ${new Date(badge.earned_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}</small></span>
        </Row>)}</ul> : <p className="px-2 text-sm text-muted-foreground">{owner ? 'Finish a plan to earn your first badge.' : 'Nothing here yet.'}</p>}
      </section>
    </>
  }

  const action = !owner ? null
    : view === 'projects' ? <Button type="button" variant="brand" className="h-10" onClick={() => setProjectEditor({})}><Plus className="h-4 w-4" />Add</Button>
    : view === 'timeline' ? <Button type="button" variant="brand" className="h-10" onClick={() => setExperience({ type: 'work_career' })}><Plus className="h-4 w-4" />Add</Button> : null

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2={view}>
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="mb-5 mt-1 flex items-center gap-3">
        <Link href={getUriWithOrg(orgslug, base)} aria-label={owner ? 'Back to your portfolio' : 'Back to the portfolio'} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-white" style={{ background: face, boxShadow: `0 3px 0 ${edge}` }}><Icon className="h-5 w-5" /></span>
        <h1 className="min-w-0 flex-1 truncate text-[clamp(24px,3.4vw,32px)] font-extrabold">{title}</h1>
        {action}
      </div>
      {view === 'timeline' ? timelineSections() : view === 'projects' ? projectGrid() : credentialList()}
    </div>
    {owner ? <>
      <ExperienceEditorDialog open={Boolean(experience)} onOpenChange={(open) => { if (!open) setExperience(null) }} projects={shell.projects} initialEntry={experience?.entry} initialType={experience?.type} onSaved={async () => { setExperience(null); if (token) setShell(await getMyPortfolio(token)) }} />
      <ProjectEditorDialog open={Boolean(projectEditor)} onOpenChange={(open) => { if (!open) setProjectEditor(null) }} initialProject={projectEditor?.project} onSaved={async () => { setProjectEditor(null); if (token) setShell(await getMyPortfolio(token)) }} />
    </> : null}
  </main>
}
