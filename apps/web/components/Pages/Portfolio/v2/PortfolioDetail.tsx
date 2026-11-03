'use client'

import Link from 'next/link'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, BriefcaseBusiness, Clock, Eye, EyeOff, FolderOpen, MoreHorizontal, Plus, ShieldCheck, Star } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { Button } from '@components/ui/button'
import { useAsk } from '@components/ui/ask-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { deletePortfolioProject, deletePortfolioTimeline, getMyPortfolio, updateMyPortfolioBadgeVisibility, updateMyPortfolioFeaturedBadges, updateMyPortfolioFeaturedProject, updateMyPortfolioFeaturedTimeline, updatePortfolioProject, updatePortfolioTimeline } from '@services/portfolio/portfolio'
import { credentials as credentialsApi } from '@services/portfolio/records'
import { EXPERIENCE_TYPES } from './ExperiencePage'
import { KindCover, experienceLook } from './covers'
import { timelineDateLabel, type TimelineEntry } from '../Timeline'
import { CredentialDialog } from './CredentialDialog'
import { CredentialFace } from './PortfolioTiles'
import { EmptyAdd, PALETTE, type TileColor } from './parts'
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
export function RowControls({ featured, hidden, onFeature, onHide, name, menu }: Controls) {
  const quiet = 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
  const button = 'grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground'
  return <div className="relative z-[1] flex shrink-0 items-center gap-0.5">
    <button type="button" onClick={onFeature} aria-pressed={featured} aria-label={featured ? `Stop featuring ${name}` : `Feature ${name} on your front page`} title={featured ? 'Featured on your front page' : 'Feature on your front page'} className={`${button} ${featured ? '!text-[#F5A524]' : quiet}`}><Star className="h-4 w-4" fill={featured ? 'currentColor' : 'none'} /></button>
    <button type="button" onClick={onHide} aria-pressed={hidden} aria-label={hidden ? `Show ${name} to visitors` : `Hide ${name} from visitors`} title={hidden ? 'Hidden from visitors' : 'Hide from visitors'} className={`${button} ${hidden ? '!text-foreground' : quiet}`}>{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    {menu ? <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`More for ${name}`} className={`${button} ${quiet}`}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44 rounded-2xl p-2">{menu}</DropdownMenuContent></DropdownMenu> : null}
  </div>
}

export function Row({ href, children, controls, dim }: { href?: string; children: ReactNode; controls?: ReactNode; dim?: boolean }) {
  return <li className="group/row relative flex min-w-0 items-center gap-3 rounded-2xl p-2 transition hover:bg-muted/60">
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${dim ? 'opacity-55' : ''}`}>{children}</div>
    {href ? <Link href={href} className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground"><span className="sr-only">Open</span></Link> : null}
    {controls}
  </li>
}

/** Back, the section's icon and title, and its actions, in one row. */
export function DetailHeader({ href, owner, color, icon: Icon, title, children }: { href: string; owner: boolean; color: TileColor; icon: ComponentType<{ className?: string }>; title: string; children?: ReactNode }) {
  const [face, edge] = PALETTE[color]
  return <div className="mb-5 mt-1 flex items-center gap-3">
    <Link href={href} aria-label={owner ? 'Back to your portfolio' : 'Back to the portfolio'} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-white" style={{ background: face, boxShadow: `0 3px 0 ${edge}` }}><Icon className="h-5 w-5" /></span>
    <h1 className="min-w-0 flex-1 truncate text-[clamp(24px,3.4vw,32px)] font-extrabold">{title}</h1>
    {children}
  </div>
}

export function PortfolioDetail({ view, initialShell, orgslug, username, owner = false }: { view: DetailView; initialShell: Shell; orgslug: string; username?: string; owner?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [shell, setShell] = useState(initialShell)
  const ask = useAsk()
  // Experiences and projects are made on their own pages; older links that opened an editor here go there.
  // Credentials still open their dialog here (?add=credential, from earlier links).
  const [credentialEditor, setCredentialEditor] = useState<{ credential?: Credential } | null>(null)
  const [filter, setFilter] = useState('all')
  const { title, color, icon: Icon } = VIEWS[view]
  const base = owner ? '/portfolio' : `/user/${username}`

  useEffect(() => {
    if (!owner) return
    const go = (path: string) => router.replace(getUriWithOrg(orgslug, path))
    const type = searchParams.get('experience'), entry = searchParams.get('editExperience'), project = searchParams.get('editProject')
    if (view === 'timeline' && type) go(`/portfolio/timeline/new?type=${encodeURIComponent(type)}`)
    else if (view === 'timeline' && entry) go(`/portfolio/timeline/${encodeURIComponent(entry)}`)
    else if (view === 'projects' && searchParams.get('newProject') === '1') go('/portfolio/projects/new')
    else if (view === 'projects' && project) go(`/portfolio/projects/${encodeURIComponent(project)}`)
    else if (searchParams.has('add')) window.history.replaceState({}, '', pathname)
  }, [owner, view, orgslug, router, pathname, searchParams])

  async function run(change: () => Promise<unknown>, failure: string) {
    if (!token) return
    try { await change(); setShell(await getMyPortfolio(token)) } catch (error: any) { toast.error(error?.message || failure) }
  }
  const featureTimeline = (entry: TimelineEntry) => run(() => updateMyPortfolioFeaturedTimeline({ timeline_uuids: entry.featured ? shell.timeline.filter((item) => item.featured && item.timeline_uuid !== entry.timeline_uuid).map((item) => item.timeline_uuid) : [...shell.timeline.filter((item) => item.featured).map((item) => item.timeline_uuid), entry.timeline_uuid] }, token), 'Could not change what’s featured')
  const hideTimeline = (entry: TimelineEntry) => run(() => updatePortfolioTimeline(entry.timeline_uuid, { revision: entry.revision, visibility: (entry as any).visibility === 'private' ? 'public' : 'private' }, token), 'Could not change who sees this')
  const featureProject = (project: Project) => run(() => updateMyPortfolioFeaturedProject({ project_uuids: project.featured ? shell.projects.filter((item) => item.featured && item.project_uuid !== project.project_uuid).map((item) => item.project_uuid) : [...shell.projects.filter((item) => item.featured).map((item) => item.project_uuid), project.project_uuid] }, token), 'Could not change what’s featured')
  const hideProject = (project: Project) => run(() => updatePortfolioProject(project.project_uuid, { revision: project.revision, visibility: (project as any).visibility === 'private' ? 'public' : 'private' }, token), 'Could not change who sees this')
  const removeTimeline = async (entry: TimelineEntry) => {
    if (await ask.confirm({ title: `Delete ${entry.title}?`, body: 'It comes off your portfolio and your résumés. This can’t be undone.', action: 'Delete', danger: true })) run(() => deletePortfolioTimeline(entry.timeline_uuid, entry.revision, token), 'Could not delete this')
  }
  const removeProject = async (project: Project) => {
    if (await ask.confirm({ title: `Delete ${project.title}?`, body: 'It comes off your portfolio and your résumés. This can’t be undone.', action: 'Delete', danger: true })) run(() => deletePortfolioProject(project.project_uuid, project.revision, token), 'Could not delete this')
  }
  const featuredBadges = shell.badges?.featuredAwardUuids || []
  const hiddenBadges = shell.badges?.hiddenAwardUuids || []
  const featureBadge = (badge: PortfolioBadge) => run(() => updateMyPortfolioFeaturedBadges({ award_uuids: featuredBadges.includes(badge.award_uuid) ? featuredBadges.filter((uuid) => uuid !== badge.award_uuid) : [...featuredBadges, badge.award_uuid] }, token), 'Could not change what’s featured')
  const hideBadge = (badge: PortfolioBadge) => run(() => updateMyPortfolioBadgeVisibility({ revision: shell.portfolio.revision, hidden_award_uuids: hiddenBadges.includes(badge.award_uuid) ? hiddenBadges.filter((uuid) => uuid !== badge.award_uuid) : [...hiddenBadges, badge.award_uuid] }, token), 'Could not change who sees this')
  const featureCredential = (credential: Credential) => run(() => credentialsApi.update(credential.credential_uuid, { featured: !credential.featured }, token), 'Could not change what’s featured')
  const hideCredential = (credential: Credential) => run(() => credentialsApi.update(credential.credential_uuid, { visibility: credential.visibility === 'private' ? 'public' : 'private' }, token), 'Could not change who sees this')

  /** One list, newest first, with a chip per type in use to narrow it. */
  const timelineList = () => {
    const entries = shell.timeline || []
    const typeOf = (entry: TimelineEntry) => LEGACY_TYPES[entry.entry_type] || entry.entry_type
    const present = EXPERIENCE_TYPES.filter((type) => entries.some((entry) => typeOf(entry) === type.value))
    const shown = entries.filter((entry) => filter === 'all' || typeOf(entry) === filter)
    if (!entries.length) return owner ? <EmptyAdd title="Add where you are right now" hint="School, a job, a team or a club. Start with one." href={getUriWithOrg(orgslug, '/portfolio/timeline/new')} /> : <p className="px-2 text-muted-foreground">Nothing here yet.</p>
    return <>
      {present.length > 1 ? <div role="group" aria-label="Show by type" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {[{ value: 'all', label: 'All' }, ...present].map((type) => <button key={type.value} type="button" aria-pressed={filter === type.value} onClick={() => setFilter(type.value)} className={`h-9 shrink-0 rounded-full border-2 px-3.5 text-[13px] font-bold ${filter === type.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'}`}>{type.label}</button>)}
      </div> : null}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{shown.map((entry) => { const look = experienceLook(entry.entry_type); const TypeIcon = look.icon; const hidden = (entry as any).visibility === 'private'; return <Row key={entry.timeline_uuid} dim={hidden} href={getUriWithOrg(orgslug, owner ? `/portfolio/timeline/${entry.timeline_uuid}` : `/user/${username}/timeline/${entry.slug}`)}
        controls={owner ? <RowControls name={entry.title} featured={Boolean(entry.featured)} hidden={hidden} onFeature={() => featureTimeline(entry)} onHide={() => hideTimeline(entry)} menu={<DropdownMenuItem onSelect={() => removeTimeline(entry)} className="rounded-xl px-3 py-2 text-destructive focus:text-destructive">Delete</DropdownMenuItem>} /> : null}>
        <span className="relative block aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-2xl sm:w-44"><KindCover kind="experience" type={entry.entry_type} url={entry.cover_url ? normalizeMediaUrl(entry.cover_url) : ''} /><span className="absolute bottom-1.5 left-1.5 hidden items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur sm:inline-flex"><TypeIcon className="h-3 w-3" />{look.label}</span></span>
        <span className="grid min-w-0 gap-0.5"><b className="line-clamp-2 break-words text-[16px] font-extrabold leading-snug sm:text-[17px]">{entry.title}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[entry.organization, timelineDateLabel(entry)].filter(Boolean).join(' · ')}</small>{entry.summary ? <span className="mt-1 hidden text-[13.5px] leading-snug text-muted-foreground [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] overflow-hidden sm:block">{entry.summary}</span> : null}</span>
      </Row> })}</ul>
    </>
  }

  const projectGrid = () => {
    const projects = shell.projects || []
    if (!projects.length) return owner ? <EmptyAdd title="Add something you made" hint="Art, video, code, a build. A photo and a line is enough." href={getUriWithOrg(orgslug, '/portfolio/projects/new')} /> : <p className="px-2 text-muted-foreground">Nothing here yet.</p>
    return <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">{projects.map((project) => { const hidden = (project as any).visibility === 'private'; return <li key={project.project_uuid} className="group/row relative grid min-w-0 content-start gap-2">
      <div className={`aspect-[4/3] overflow-hidden rounded-2xl ${hidden ? 'opacity-55' : ''}`}><KindCover kind="project" url={project.cover_url ? normalizeMediaUrl(project.cover_url) : ''} /></div>
      <div className="flex min-w-0 items-start gap-1"><span className={`min-w-0 flex-1 ${hidden ? 'opacity-55' : ''}`}><b className="line-clamp-2 text-[15px] font-extrabold leading-tight">{project.title}</b>{project.subtitle ? <small className="block truncate text-[13px] font-semibold text-muted-foreground">{project.subtitle}</small> : null}</span>{owner ? <RowControls name={project.title} featured={project.featured} hidden={hidden} onFeature={() => featureProject(project)} onHide={() => hideProject(project)} menu={<DropdownMenuItem onSelect={() => removeProject(project)} className="rounded-xl px-3 py-2 text-destructive focus:text-destructive">Delete</DropdownMenuItem>} /> : null}</div>
      <Link href={getUriWithOrg(orgslug, owner ? `/portfolio/projects/${project.project_uuid}` : `/user/${username}/projects/${project.slug}`)} className="absolute inset-x-0 top-0 aspect-[4/3] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground"><span className="sr-only">Open {project.title}</span></Link>
    </li> })}</ul>
  }

  const credentialList = () => {
    const items = shell.credentials || []
    const badges = shell.badges?.earned || []
    return <>
      <section aria-labelledby="badges">
        <div className="mb-1 flex items-center gap-2 px-2"><h2 id="badges" className="flex-1 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Badges</h2></div>
        {badges.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{badges.map((badge) => <Row key={badge.award_uuid} dim={hiddenBadges.includes(badge.award_uuid)} href={getUriWithOrg(orgslug, routePaths.org.badgeAward(badge.code))} controls={owner ? <RowControls name={badge.name} featured={featuredBadges.includes(badge.award_uuid)} hidden={hiddenBadges.includes(badge.award_uuid)} onFeature={() => featureBadge(badge)} onHide={() => hideBadge(badge)} /> : null}>
          <span className="grid w-16 shrink-0 place-items-center sm:w-20"><BadgeMedal badge={{ image_url: normalizeMediaUrl(badge.image_url || '') || '', icon: badge.icon, color: badge.color }} size={48} /></span>
          <span className="min-w-0"><b className="line-clamp-2 break-words text-[15px] font-extrabold leading-snug">{badge.name}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[badge.issuer?.name, badge.earned_on ? `Earned ${new Date(badge.earned_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}</small></span>
        </Row>)}</ul> : <p className="px-2 text-sm text-muted-foreground">{owner ? 'Finish a plan to earn your first badge.' : 'Nothing here yet.'}</p>}
      </section>
      {items.length || owner ? <section aria-labelledby="creds" className="mt-8">
        <h2 id="creds" className="mb-1 px-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Cards, certificates and diplomas</h2>
        {items.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{items.map((item) => <Row key={item.credential_uuid} dim={item.visibility === 'private'} controls={owner ? <RowControls name={item.name} featured={item.featured} hidden={item.visibility === 'private'} onFeature={() => featureCredential(item)} onHide={() => hideCredential(item)} menu={<DropdownMenuItem onSelect={() => setCredentialEditor({ credential: item })} className="rounded-xl px-3 py-2">Edit</DropdownMenuItem>} /> : null}>
          <span className="w-16 shrink-0 sm:w-20"><CredentialFace credential={item} /></span>
          <span className="min-w-0"><b className="line-clamp-2 break-words text-[15px] font-extrabold leading-snug">{item.name}{item.score ? `: ${item.score}` : ''}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[item.issuer, item.expires_on ? `Expires ${month(item.expires_on)}` : item.expected_on && !item.issued_on ? `Expected ${month(item.expected_on)}` : month(item.issued_on)].filter(Boolean).join(' · ')}</small></span>
        </Row>)}</ul> : null}
        {owner ? <div className="mt-2 flex items-start gap-3 rounded-2xl border-2 border-dashed border-border p-3.5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Clock className="h-5 w-5" /></span><span className="min-w-0"><b className="block text-[14.5px] font-extrabold">Coming soon: cards and certificates</b><small className="block text-[12.5px] font-semibold text-muted-foreground">Upload your food handler card, CPR card or diploma and we’ll check it before it shows here. Until then, badges you earn here are what count.</small></span></div> : null}
      </section> : null}
    </>
  }

  const action = !owner ? null
    : view === 'badges' ? <Button asChild variant="brand" className="h-10"><Link href={getUriWithOrg(orgslug, routePaths.org.discover())}><Plus className="h-4 w-4" />Earn a badge</Link></Button>
    : <Button asChild variant="brand" className="h-10"><Link href={getUriWithOrg(orgslug, view === 'projects' ? '/portfolio/projects/new' : '/portfolio/timeline/new')}><Plus className="h-4 w-4" />Add</Link></Button>

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2={view}>
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, base)} owner={owner} color={color} icon={Icon} title={title}>{action}</DetailHeader>
      {view === 'timeline' ? timelineList() : view === 'projects' ? projectGrid() : credentialList()}
    </div>
    {owner ? <>
      {ask.dialog}
      <CredentialDialog key={credentialEditor?.credential?.credential_uuid || 'new'} open={Boolean(credentialEditor)} onOpenChange={(open) => { if (!open) setCredentialEditor(null) }} credential={credentialEditor?.credential} shell={shell} token={token} userId={Number(shell.portfolio.user_id)} onSaved={async () => { setCredentialEditor(null); if (token) setShell(await getMyPortfolio(token)) }} />
    </> : null}
  </main>
}
