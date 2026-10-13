'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Award, ChevronDown, Eye, EyeOff, FileText, Globe2, MapPin, Pencil, Plus, Printer } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { applyMediaAssetToUserAvatar, type MediaAsset } from '@services/media/library'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { getMyPortfolio, importLegacyPortfolio, publishMyPortfolio, unpublishMyPortfolio, updateMyPortfolio, updateMyPortfolioFeaturedTimeline } from '@services/portfolio/portfolio'
import { TimelineView, type TimelineEntry } from './Timeline'
import { EXPERIENCE_TYPES, ExperienceEditorDialog } from './ExperienceEditor'
import { ProjectEditorDialog } from './ProjectEditorDialog'
import { PortfolioShareButton } from './PortfolioShareDialog'
import PortfolioSettingsMenu from './PortfolioSettingsMenu'
import Overview from './PortfolioOverview'
import { BadgesView } from './PortfolioBadges'
import { ChecklistBanner, ChecklistGauge, EmptyTab } from './PortfolioChecklist'
import { Avatar, HeaderEditor, SocialCircles, VerificationMenu, normalizeSocialInput, shellSocials } from './PortfolioHeaderParts'
import { ProjectGrid } from './PortfolioProjects'
import { ResumeView } from './PortfolioResume'

import type { Project, Shell } from './portfolioTypes'
export type { Project, Shell } from './portfolioTypes'
export { ProjectCardView, ProjectEditor, ProjectDetail } from './PortfolioProjects'

type PortfolioView = 'overview' | 'timeline' | 'projects' | 'badges' | 'resume'

const VIEW_LABELS: Record<Exclude<PortfolioView, 'overview'>, string> = { timeline: 'Timeline', projects: 'Projects', badges: 'Badges', resume: 'Resume' }

/** The portfolio's detail pages the viewer can open: their own always, a visitor's only when shown and not empty. */
function sectionLinks(orgslug: string, username: string | undefined, owner: boolean, shell: Shell, preview = false) {
  const base = owner ? '/portfolio' : `/user/${username}`
  return (Object.keys(VIEW_LABELS) as Array<keyof typeof VIEW_LABELS>).flatMap((key) => {
    const view = shell.views.find((item) => item.key === key)
    if (!view?.visible || (preview && !view.itemCount)) return []
    return [{ view: key, label: VIEW_LABELS[key], count: view.itemCount, href: getUriWithOrg(orgslug, key === 'timeline' || key === 'projects' || key === 'badges' || key === 'resume' ? `${base}/${key}` : base) }]
  })
}

/** A portfolio: the front page (header, bio, sections) or one of its detail pages, for its owner or a visitor. */
export function PortfolioShell({ initialShell, orgslug, username, owner = false, active = 'overview', preview = false }: { initialShell: Shell; orgslug: string; username?: string; owner?: boolean; active?: PortfolioView; preview?: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [activeView, setActiveView] = useState<PortfolioView>(active)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [draftSocials, setDraftSocials] = useState<Array<{ type: string; url: string }>>(() => shellSocials(initialShell))
  const [busy, setBusy] = useState(false)
  const [savingTimelineUuid, setSavingTimelineUuid] = useState<string | null>(null)
  const [experienceEditorOpen, setExperienceEditorOpen] = useState(false)
  const [projectEditorOpen, setProjectEditorOpen] = useState(false)
  const [experienceType, setExperienceType] = useState<string>('work_career')
  const editingExperience = shell.timeline?.find((item: TimelineEntry) => item.timeline_uuid === searchParams.get('editExperience'))
  const editingProject = shell.projects?.find((item: Project) => item.project_uuid === searchParams.get('editProject'))
  const displayName = shell.portfolio.display_name || username || 'Your portfolio'
  const links = useMemo(() => sectionLinks(orgslug, username, owner, shell, preview), [orgslug, username, owner, shell, preview])
  const home = getUriWithOrg(orgslug, owner ? '/portfolio' : `/user/${username}`)
  const showLaunchGuide = Boolean(shell.checklist?.total && (!shell.portfolio.published_at || shell.checklist.completed < shell.checklist.total))
  const avatarUrl = shell.portfolio.avatar_image
    ? getUserAvatarMediaDirectory(shell.portfolio.user_uuid, shell.portfolio.avatar_image)
    : ''

  useEffect(() => {
    const handlePopState = () => setActiveView(window.location.pathname.endsWith('/resume') ? 'resume' : window.location.pathname.endsWith('/badges') ? 'badges' : window.location.pathname.endsWith('/projects') ? 'projects' : window.location.pathname.endsWith('/timeline') ? 'timeline' : 'overview')
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (owner && searchParams.get('edit') === 'profile') setEditingIdentity(true)
    const createType = searchParams.get('experience')
    if (owner && createType) {
      setExperienceType(createType)
      setExperienceEditorOpen(true)
      const next = new URLSearchParams(searchParams.toString())
      next.delete('experience')
      window.history.replaceState({}, '', `${pathname}${next.size ? `?${next.toString()}` : ''}`)
    }
    if (owner && searchParams.get('newProject') === '1') setProjectEditorOpen(true)
    if (owner && searchParams.get('editExperience')) setExperienceEditorOpen(true)
    if (owner && searchParams.get('editProject')) setProjectEditorOpen(true)
  }, [owner, pathname, searchParams])

  async function experienceSaved() {
    if (!token) return
    setShell(await getMyPortfolio(token))
    window.history.replaceState({}, '', getUriWithOrg(orgslug, '/portfolio/timeline'))
  }

  async function projectSaved() {
    if (!token) return
    setShell(await getMyPortfolio(token))
    window.history.replaceState({}, '', getUriWithOrg(orgslug, '/portfolio/projects'))
  }

  function changeView(view: PortfolioView, href: string) {
    if (view === activeView) return
    setActiveView(view)
    window.history.pushState({}, '', href)
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const normalizedSocials = draftSocials.map((social) => ({ ...social, url: normalizeSocialInput(social.type, social.url) }))
      const next = await updateMyPortfolio({ revision: shell.portfolio.revision, display_name: form.get('display_name'), headline: form.get('headline'), location_label: form.get('location_label'), socials: normalizedSocials }, token)
      setDraftSocials(shellSocials(next)); setShell(next); setEditingIdentity(false); toast.success('Portfolio updated')
    } catch (error: any) { toast.error(error?.message || 'Could not update portfolio') } finally { setBusy(false) }
  }

  async function publish() {
    if (!token) return
    setBusy(true)
    try { const next = await publishMyPortfolio({ revision: shell.portfolio.revision, privacy_confirmed: true }, token); setShell(next); toast.success('Portfolio published') }
    catch (error: any) { toast.error(error?.message || 'Complete the preview checklist before publishing') } finally { setBusy(false) }
  }

  async function unpublish() {
    if (!token || !window.confirm('Take your portfolio offline? You can publish it again later.')) return
    setBusy(true)
    try { const next = await unpublishMyPortfolio(shell.portfolio.revision, token); setShell(next); toast.success('Portfolio unpublished') }
    catch (error: any) { toast.error(error?.message || 'Could not unpublish portfolio') } finally { setBusy(false) }
  }

  async function importLegacy() {
    if (!token) return
    setBusy(true)
    try { const result = await importLegacyPortfolio(token); setShell(result.shell); toast.success(`${result.imported} legacy item${result.imported === 1 ? '' : 's'} imported`) }
    catch (error: any) { toast.error(error?.message || 'The legacy portfolio could not be imported. Your existing data was not changed.') } finally { setBusy(false) }
  }

  async function saveAvatar(asset: MediaAsset) {
    if (!token) return
    const user = await applyMediaAssetToUserAvatar(asset.asset_uuid, token)
    setShell((current) => ({ ...current, portfolio: { ...current.portfolio, avatar_image: user.avatar_image || asset.url } }))
    setAvatarPickerOpen(false)
    toast.success('Profile image updated')
  }

  async function toggleFeaturedTimeline(entry: TimelineEntry) {
    if (!token || savingTimelineUuid) return
    setSavingTimelineUuid(entry.timeline_uuid)
    try {
      const featuredUuids = shell.timeline.filter((item) => item.featured && item.timeline_uuid !== entry.timeline_uuid).map((item) => item.timeline_uuid)
      const next = await updateMyPortfolioFeaturedTimeline({ timeline_uuids: entry.featured ? featuredUuids : [...featuredUuids, entry.timeline_uuid] }, token)
      setShell(next)
      toast.success(entry.featured ? 'Removed from featured timeline' : `${entry.title} is now featured`)
    } catch (error: any) { toast.error(error?.message || 'Could not update featured timeline') }
    finally { setSavingTimelineUuid(null) }
  }

  const editing = owner && !preview
  const publishControl = shell.portfolio.published_at
    ? <Button variant="surface" size="sm" onClick={unpublish} disabled={busy}><EyeOff className="h-4 w-4" />Unpublish</Button>
    : shell.portfolio.email_verified === false ? <VerificationMenu email={shell.portfolio.email} token={token} setShell={setShell} onPublish={publish} busy={busy} />
    : <Button variant="brand" size="sm" onClick={publish} disabled={busy}><Globe2 className="h-4 w-4" />{busy ? 'Publishing…' : 'Publish'}</Button>
  const detailActions = !editing ? null
    : activeView === 'projects' ? <Button type="button" variant="brand" size="sm" onClick={() => setProjectEditorOpen(true)}><Plus className="h-4 w-4" />Add project</Button>
    : activeView === 'timeline' ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="brand" size="sm"><Plus className="h-4 w-4" />Add experience<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60">{EXPERIENCE_TYPES.map((type) => <DropdownMenuItem key={type.value} onSelect={() => { setExperienceType(type.value); setExperienceEditorOpen(true) }}>{type.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    : activeView === 'badges' ? <Button asChild variant="brand" size="sm"><Link href={getUriWithOrg(orgslug, routePaths.org.discover())}><Award className="h-4 w-4" />Find badges</Link></Button>
    : activeView === 'resume' ? <Button type="button" variant="surface" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / save PDF</Button> : null

  return <main className={`${activeView === 'resume' ? 'h-dvh overflow-hidden' : 'min-h-screen pb-20'} bg-background text-foreground`}>
    {preview && <div className="border-b border-border px-4 py-3"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><div><span className="text-sm font-bold">Public preview</span><p className="text-xs text-muted-foreground">This is how visitors will see your portfolio.</p></div><div className="flex items-center gap-2"><Button asChild variant="surface" size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio')}><ArrowLeft className="h-4 w-4" />Back to editing</Link></Button>{shell.portfolio.published_at ? <span className="inline-flex h-9 items-center rounded-xl bg-raised px-3 text-sm font-bold text-muted-foreground"><Globe2 className="mr-2 h-4 w-4" />Published</span> : publishControl}</div></div></div>}
    <div className="mx-auto max-w-5xl px-4 sm:px-8">
      {activeView === 'overview' ? <>
        <header className="pt-4 sm:pt-6">
          <div className="relative h-32 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--org-primary-color)_85%,#000),color-mix(in_srgb,var(--org-primary-color)_45%,hsl(var(--shell))))] sm:h-44">
            <div className="absolute inset-0 bg-[url('/texture_overlay.png')] bg-cover opacity-25 mix-blend-overlay" aria-hidden="true" />
            {editing ? <div className="absolute right-3 top-3 flex gap-2"><PortfolioSettingsMenu orgslug={orgslug} /></div> : null}
          </div>
          <div className="-mt-14 flex flex-col gap-4 px-2 sm:-mt-16 sm:flex-row sm:items-end sm:px-6">
            <div className="relative z-10 w-fit rounded-full bg-background ring-[6px] ring-background"><Avatar url={avatarUrl} name={displayName} compact={false} /></div>
            <div className="min-w-0 flex-1 sm:pb-2">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{displayName}</h1>
              {shell.portfolio.headline && <p className="mt-1 max-w-xl text-base text-muted-foreground sm:text-lg">{shell.portfolio.headline}</p>}
              {shell.portfolio.location_label && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{shell.portfolio.location_label}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 px-2 sm:px-6">
            <SocialCircles socials={shell.portfolio.socials || []} />
            {editing ? <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button variant="surface" size="sm" onClick={() => setEditingIdentity(true)}><Pencil className="h-4 w-4" />Edit</Button>
              <Button asChild variant="surface" size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio/preview')}><Eye className="h-4 w-4" />Preview</Link></Button>
              <PortfolioShareButton orgslug={orgslug} username={username} displayName={displayName} published={Boolean(shell.portfolio.published_at)} onPublish={publish} busy={busy} />
              {publishControl}
            </div> : null}
          </div>
        </header>
        {editing && showLaunchGuide ? <div className="mt-6"><ChecklistBanner checklist={shell.checklist} orgslug={orgslug} onPublish={publish} busy={busy} /></div> : null}
      </> : <div className="flex items-center gap-3 pt-4 sm:pt-6">
        <Link href={home} onClick={(event) => { event.preventDefault(); changeView('overview', home) }} className="flex max-w-[50%] shrink-0 items-center gap-2 rounded-xl py-2 pr-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 shrink-0" /><span className="truncate">{owner ? 'Portfolio' : displayName}</span></Link>
        <h1 className="sr-only">{VIEW_LABELS[activeView]}</h1>
        <span className="flex-1" />
        {editing && showLaunchGuide ? <span className="hidden sm:block"><ChecklistGauge checklist={shell.checklist} orgslug={orgslug} onPublish={publish} busy={busy} /></span> : null}
        {detailActions}
      </div>}

      <div className={activeView === 'resume' ? '' : 'py-8 sm:py-10'}>
        {activeView !== 'overview' && activeView !== 'resume' ? <h2 className="mb-6 text-3xl font-extrabold tracking-tight">{VIEW_LABELS[activeView]}</h2> : null}
        <AnimatePresence mode="wait" initial={false}>{activeView === 'overview' ? <motion.div key="overview"><Overview shell={shell} setShell={setShell} owner={editing} orgslug={orgslug} username={username} importLegacy={importLegacy} busy={busy} token={token} />
          {links.length ? <nav aria-label="More of this portfolio" className="mt-14 grid gap-3 sm:grid-cols-2">{links.map((link) => <Link key={link.view} href={link.href} onClick={(event) => { event.preventDefault(); changeView(link.view, link.href) }} className="group flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-[0_4px_0_hsl(var(--edge))] transition hover:bg-raised">
            <span className="min-w-0 flex-1"><span className="block text-lg font-extrabold">{link.label}</span><span className="block text-sm text-muted-foreground">{link.view === 'resume' ? 'Built from your story' : `${link.count} ${link.count === 1 ? 'item' : 'items'}`}</span></span>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </Link>)}</nav> : null}
        </motion.div> : activeView === 'timeline' ? <motion.div key="timeline"><TimelineView entries={shell.timeline || []} owner={editing} orgslug={orgslug} username={username} onToggleFeatured={editing ? toggleFeaturedTimeline : undefined} savingUuid={savingTimelineUuid} /></motion.div> : activeView === 'badges' ? <motion.div key="badges"><BadgesView shell={shell} setShell={setShell} owner={editing} orgslug={orgslug} token={token} /></motion.div> : activeView === 'resume' ? <motion.div key="resume">{editing && !shell.projects.length && !shell.timeline.length ? <EmptyTab icon={FileText} eyebrow="Your resume" title="Build a resume from your story" description="Your resume grows automatically as you add projects, experience, strengths, and badges." examples={['Projects you’re proud of', 'Education and experience', 'Skills and strengths', 'Verified badges']} action="Add your first project" href="/portfolio/projects/new" orgslug={orgslug} /> : <ResumeView shell={shell} orgslug={orgslug} username={username} owner={editing} />}</motion.div> : <motion.div key="projects"><ProjectGrid shell={shell} setShell={setShell} owner={editing} orgslug={orgslug} username={username} token={token} /></motion.div>}</AnimatePresence>
      </div>
    </div>
    {owner && <HeaderEditor open={editingIdentity} onOpenChange={setEditingIdentity} shell={shell} avatarUrl={avatarUrl} displayName={displayName} socials={draftSocials} setSocials={setDraftSocials} onAvatarClick={() => setAvatarPickerOpen(true)} onSubmit={saveIdentity} busy={busy} />}
    {owner && <ExperienceEditorDialog open={experienceEditorOpen} onOpenChange={setExperienceEditorOpen} projects={shell.projects} initialEntry={editingExperience} initialType={experienceType} onSaved={experienceSaved} />}
    {owner && <ProjectEditorDialog open={projectEditorOpen} onOpenChange={setProjectEditorOpen} initialProject={editingProject} onSaved={projectSaved} />}
    {owner && <MediaPickerDialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen} title="Update your profile image" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: Number(shell.portfolio.user_id) }} mediaType="image" accessToken={token} onSave={saveAvatar} />}
  </main>
}
