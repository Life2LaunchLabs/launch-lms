'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Award, BookOpen, Briefcase, Camera, Check, ChevronDown, Circle, Eye, EyeOff, FileText, FolderOpen, Globe, Globe2, GraduationCap, GripVertical, Instagram, Linkedin, MailWarning, MapPin, Minus, Pencil, Plus, Printer, Share2, Sparkles, Star, Trash2, WandSparkles, Youtube, X, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { applyMediaAssetToUserAvatar, type MediaAsset } from '@services/media/library'
import { getUserAvatarMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { createPortfolioWork, dismissLegacyPortfolioImport, getMyPortfolio, importLegacyPortfolio, publishMyPortfolio, unpublishMyPortfolio, updateMyPortfolio, updateMyPortfolioBadgeVisibility, updateMyPortfolioFeaturedBadges, updateMyPortfolioFeaturedWork, updateMyPortfolioSections, updateMyPortfolioTraits, updatePortfolioWork } from '@services/portfolio/portfolio'
import { CategorizedMultiSelect, PORTFOLIO_STRENGTHS, PORTFOLIO_VALUES, type CategorizedOption } from '@components/Portfolio/CategorizedMultiSelect'
import { JourneyTimeline, journeyDateLabel, type JourneyEntry } from './Journey'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'

export type Work = { work_uuid: string; slug: string; title: string; subtitle: string; summary: string; story_kind: string; status: string; featured: boolean; revision: number; start_date?: string; end_date?: string; cover_url?: string; cover_asset_uuid?: string; blocks: Array<{ block_uuid?: string; block_type: string; data: Record<string, any> }> }
type PortfolioBadge = { badge_uuid: string; name: string; description?: string; thumbnail_image?: string; status: 'earned' | 'in_progress'; progress?: { completed: number; total: number; percent: number } }
type PortfolioSection = { section_uuid: string; section_type: string; title_override?: string; enabled: boolean; sort_order: number }
type ChecklistItem = { key: string; label: string; supportingText: string; href: string; complete: boolean }
type Shell = { portfolio: Record<string, any>; work: Work[]; journey: JourneyEntry[]; sections?: PortfolioSection[]; traits?: { strength?: string[]; value?: string[] }; badges?: { earned: PortfolioBadge[]; inProgress: PortfolioBadge[]; featured: PortfolioBadge[]; featuredBadgeUuids: string[]; hiddenBadgeUuids: string[] }; views: Array<{ key: string; visible: boolean; itemCount: number }>; readiness: { canPublish: boolean; blockers: string[] }; checklist?: { items: ChecklistItem[]; completed: number; total: number; percent: number; nextIncomplete?: ChecklistItem | null; earned: boolean } }

type PortfolioView = 'overview' | 'journey' | 'work' | 'badges' | 'resume'

function tabs(orgslug: string, username: string | undefined, owner: boolean, shell: Shell, preview = false) {
  const base = owner ? '/portfolio' : `/user/${username}`
  const visible = (key: string) => shell.views.some((view) => view.key === key && view.visible && (!preview || view.itemCount > 0))
  return [{ label: 'Overview', view: 'overview', href: base, visible: true }, { label: 'Timeline', view: 'journey', href: `${base}/journey`, visible: visible('journey') }, { label: 'Projects', view: 'work', href: `${base}/work`, visible: visible('work') }, { label: 'Badges', view: 'badges', href: `${base}/badges`, visible: visible('badges') }, { label: 'Resume', view: 'resume', href: `${base}/resume`, visible: visible('resume') }]
    .filter((tab) => tab.visible).map((tab) => ({ ...tab, href: getUriWithOrg(orgslug, tab.href) }))
}

export function PortfolioShell({ initialShell, orgslug, username, owner = false, active = 'overview', preview = false }: { initialShell: Shell; orgslug: string; username?: string; owner?: boolean; active?: PortfolioView; preview?: boolean }) {
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [activeView, setActiveView] = useState<PortfolioView>(active)
  const [scrolled, setScrolled] = useState(false)
  const [stickyBounds, setStickyBounds] = useState<{ left: number; width: number } | null>(null)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [draftSocials, setDraftSocials] = useState<Array<{ type: string; url: string }>>(() => shellSocials(initialShell))
  const [busy, setBusy] = useState(false)
  const headerRef = useRef<HTMLElement | null>(null)
  const displayName = shell.portfolio.display_name || username || 'Your portfolio'
  const nav = useMemo(() => tabs(orgslug, username, owner, shell, preview), [orgslug, username, owner, shell, preview])
  const compact = activeView !== 'overview'
  const showLaunchGuide = Boolean(shell.checklist?.total && (!shell.portfolio.published_at || shell.checklist.completed < shell.checklist.total))
  const avatarUrl = shell.portfolio.avatar_image
    ? getUserAvatarMediaDirectory(shell.portfolio.user_uuid, shell.portfolio.avatar_image)
    : ''

  useEffect(() => {
    const handleScroll = () => {
      if (activeView !== 'overview') return
      const bounds = headerRef.current?.getBoundingClientRect()
      setScrolled((bounds?.bottom || 1) <= 0)
      if (bounds) setStickyBounds({ left: bounds.left, width: bounds.width })
    }
    const handlePopState = () => setActiveView(window.location.pathname.endsWith('/resume') ? 'resume' : window.location.pathname.endsWith('/badges') ? 'badges' : window.location.pathname.endsWith('/work') ? 'work' : window.location.pathname.endsWith('/journey') ? 'journey' : 'overview')
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [activeView])

  useEffect(() => {
    if (owner && searchParams.get('edit') === 'profile') setEditingIdentity(true)
  }, [owner, searchParams])

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

  return <main className={`${activeView === 'resume' ? 'h-dvh overflow-hidden' : 'min-h-screen pb-20'} bg-background text-foreground`}>
    {preview && <div className="border-b border-border px-4 py-3"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><div><span className="text-sm font-bold">Public preview</span><p className="text-xs text-muted-foreground">This is how visitors will see your portfolio.</p></div><div className="flex items-center gap-2"><Button asChild variant="outline" size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio')}><ArrowLeft className="mr-2 h-4 w-4" />Back to editing</Link></Button>{shell.portfolio.published_at ? <span className="inline-flex h-9 items-center rounded-md bg-muted px-3 text-sm font-semibold text-muted-foreground"><Globe2 className="mr-2 h-4 w-4" />Published</span> : shell.portfolio.email_verified === false ? <VerificationMenu email={shell.portfolio.email} token={token} setShell={setShell} onPublish={publish} busy={busy} /> : <Button size="sm" onClick={publish} disabled={busy}><Globe2 className="mr-2 h-4 w-4" />{busy ? 'Publishing…' : 'Publish portfolio'}</Button>}</div></div></div>}
    <div className="mx-auto max-w-5xl px-5 sm:px-8">
    <motion.header ref={headerRef} className={`${activeView === 'overview' ? 'relative' : 'sticky top-0'} z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 backdrop-blur-xl ${compact ? 'shadow-[0_1px_0_hsl(var(--border)/.25)]' : ''}`}>
      <motion.div layout className={`${compact ? 'py-3' : 'py-8 sm:py-12'}`}>
        <motion.div layout className={`${compact ? 'flex items-center justify-between gap-4' : 'flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left'}`}>
          <motion.div layout className={`${compact ? 'flex min-w-0 items-center gap-3' : 'flex flex-col items-center gap-5 sm:flex-row'}`}>
            <Avatar url={avatarUrl} name={displayName} compact={compact} />
            <motion.div layout className="min-w-0">
              <motion.h1 layout className={`${compact ? 'truncate text-base font-bold' : 'text-3xl font-black tracking-tight sm:text-5xl'}`}>{displayName}</motion.h1>
              <AnimatePresence initial={false}>
                {!compact && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  {shell.portfolio.headline && <p className="mt-2 max-w-xl text-base text-muted-foreground sm:text-lg">{shell.portfolio.headline}</p>}
                  {shell.portfolio.location_label && <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start"><MapPin className="h-3.5 w-3.5" />{shell.portfolio.location_label}</p>}
                  <SocialCircles socials={shell.portfolio.socials || []} />
                  {owner && !preview && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start"><Button variant="outline" onClick={() => setEditingIdentity(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button><Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, '/portfolio/preview')}><Eye className="mr-2 h-4 w-4" />Preview</Link></Button>{shell.portfolio.published_at ? <Button variant="outline" onClick={unpublish} disabled={busy}><EyeOff className="mr-2 h-4 w-4" />Unpublish</Button> : shell.portfolio.email_verified === false ? <VerificationMenu email={shell.portfolio.email} token={token} setShell={setShell} onPublish={publish} busy={busy} /> : <Button onClick={publish} disabled={busy}><Globe2 className="mr-2 h-4 w-4" />Publish</Button>}</motion.div>}
                  {shell.portfolio.short_bio && <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{shell.portfolio.short_bio}</p>}
                </motion.div>}
              </AnimatePresence>
            </motion.div>
          </motion.div>
          {owner && !preview && compact && <div className="flex items-center gap-2">{showLaunchGuide && <ChecklistGauge checklist={shell.checklist} orgslug={orgslug} onPublish={publish} busy={busy} />}{activeView === 'work' && <Button asChild size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio/work/new')}><Plus className="mr-1.5 h-4 w-4" />Add project</Link></Button>}{activeView === 'journey' && <Button asChild size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio/journey/new')}><Plus className="mr-1.5 h-4 w-4" />Add chapter</Link></Button>}{activeView === 'badges' && <Button asChild size="sm"><Link href={getUriWithOrg(orgslug, '/badges?choose=1')}><Award className="mr-1.5 h-4 w-4" />Find badges</Link></Button>}{activeView === 'resume' && <Button type="button" size="sm" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />Print / save PDF</Button>}</div>}
        </motion.div>
      </motion.div>
      {owner && !preview && activeView === 'overview' && showLaunchGuide && <ChecklistBanner checklist={shell.checklist} orgslug={orgslug} onPublish={publish} busy={busy} />}
      {nav.length > 1 && <nav className="flex gap-7 overflow-x-auto" aria-label="Portfolio views">{nav.map((tab) => { const view = tab.view as PortfolioView; const selected = activeView === view; return <button type="button" key={tab.label} onClick={() => changeView(view, tab.href)} className={`relative py-3 text-sm font-semibold transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{tab.label}{selected && <motion.span layoutId="portfolio-active-tab" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}</button>})}</nav>}
    </motion.header>

    <AnimatePresence>
      {activeView === 'overview' && scrolled && stickyBounds && <motion.header initial={reduceMotion ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }} transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }} style={{ left: stickyBounds.left, width: stickyBounds.width }} className="fixed top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="px-5 sm:px-8">
          <div className="flex items-center gap-3 py-2.5"><Avatar url={avatarUrl} name={displayName} compact /><h1 className="min-w-0 flex-1 truncate text-base font-bold">{displayName}</h1>{owner && !preview && showLaunchGuide && <ChecklistGauge checklist={shell.checklist} orgslug={orgslug} onPublish={publish} busy={busy} />}</div>
          {nav.length > 1 && <nav className="flex gap-7 overflow-x-auto" aria-label="Portfolio views">{nav.map((tab) => { const view = tab.view as PortfolioView; const selected = activeView === view; return <button type="button" key={tab.label} onClick={() => changeView(view, tab.href)} className={`relative shrink-0 py-2.5 text-sm font-semibold transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{tab.label}{selected && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />}</button>})}</nav>}
        </div>
      </motion.header>}
    </AnimatePresence>

    <div className={activeView === 'resume' ? '' : 'py-8 sm:py-12'}>
      <AnimatePresence mode="wait" initial={false}>{activeView === 'overview' ? <motion.div key="overview"><Overview shell={shell} setShell={setShell} owner={owner && !preview} orgslug={orgslug} username={username} importLegacy={importLegacy} busy={busy} token={token} /></motion.div> : activeView === 'journey' ? <motion.div key="journey"><JourneyTimeline entries={shell.journey || []} owner={owner && !preview} orgslug={orgslug} username={username} /></motion.div> : activeView === 'badges' ? <motion.div key="badges"><BadgesView shell={shell} setShell={setShell} owner={owner && !preview} orgslug={orgslug} token={token} /></motion.div> : activeView === 'resume' ? <motion.div key="resume">{owner && !preview && !shell.work.length && !shell.journey.length ? <EmptyTab icon={FileText} eyebrow="Your resume" title="Build a resume from your story" description="Your resume grows automatically as you add projects, experience, strengths, and badges." examples={['Projects you’re proud of', 'Education and experience', 'Skills and strengths', 'Verified badges']} action="Add your first project" href="/portfolio/work/new" orgslug={orgslug} /> : <ResumeView shell={shell} orgslug={orgslug} username={username} owner={owner && !preview} />}</motion.div> : <motion.div key="work"><WorkGrid shell={shell} setShell={setShell} owner={owner && !preview} orgslug={orgslug} username={username} token={token} /></motion.div>}</AnimatePresence>
    </div>
    </div>
    {owner && <HeaderEditor open={editingIdentity} onOpenChange={setEditingIdentity} shell={shell} avatarUrl={avatarUrl} displayName={displayName} socials={draftSocials} setSocials={setDraftSocials} onAvatarClick={() => setAvatarPickerOpen(true)} onSubmit={saveIdentity} busy={busy} />}
    {owner && <MediaPickerDialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen} title="Update your profile image" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: Number(shell.portfolio.user_id) }} mediaType="image" accessToken={token} onSave={saveAvatar} />}
  </main>
}

function shellSocials(shell: Shell) {
  return Array.isArray(shell.portfolio.socials) ? shell.portfolio.socials.filter((social: any) => social?.type && social?.url).map((social: any) => ({ type: String(social.type), url: String(social.url) })) : []
}

const SOCIAL_OPTIONS = [
  { type: 'website', label: 'Website' },
  { type: 'instagram', label: 'Instagram' },
  { type: 'linkedin', label: 'LinkedIn' },
  { type: 'youtube', label: 'YouTube' },
  { type: 'x', label: 'X' },
]

function socialHandle(type: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    if (type === 'website') return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '')
    if (type === 'linkedin' && host === 'linkedin.com') return (parts[0] === 'in' ? parts[1] : parts[0]) || ''
    if (type === 'instagram' && host === 'instagram.com') return parts[0] || ''
    if (type === 'youtube' && host === 'youtube.com') return ['channel', 'c', 'user'].includes(parts[0]) ? parts[1] || '' : parts[0] || ''
    if (type === 'youtube' && host === 'youtu.be') return parts[0] || ''
    if (type === 'x' && (host === 'x.com' || host === 'twitter.com')) return parts[0] || ''
  } catch { /* Parse handles below. */ }
  return trimmed.replace(/^@+/, '').replace(/^https?:\/\//i, '').replace(/^(www\.)?/, '').replace(/^(instagram\.com|x\.com|twitter\.com)\//i, '').replace(/^linkedin\.com\/in\//i, '').replace(/^youtube\.com\/(?:@|channel\/|c\/|user\/)?/i, '').split(/[/?#]/)[0]
}

function normalizeSocialInput(type: string, value: string) {
  const handle = socialHandle(type, value)
  if (!handle) return ''
  if (type === 'website') return /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${handle}`
  if (type === 'linkedin') return `https://linkedin.com/in/${handle}`
  if (type === 'instagram') return `https://instagram.com/${handle}`
  if (type === 'youtube') return /^UC[a-zA-Z0-9_-]{20,}$/.test(handle) ? `https://youtube.com/channel/${handle}` : `https://youtube.com/@${handle.replace(/^@+/, '')}`
  return `https://x.com/${handle}`
}

function HeaderEditor({ open, onOpenChange, shell, avatarUrl, displayName, socials, setSocials, onAvatarClick, onSubmit, busy }: any) {
  const missing = SOCIAL_OPTIONS.filter((option) => !socials.some((social: any) => social.type === option.type))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="bottom-0 left-0 top-auto h-[92dvh] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-t-3xl border-x-0 border-b-0 p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[88dvh] sm:max-h-[760px] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"><form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col overflow-hidden"><DialogHeader className="shrink-0 border-b border-border px-6 py-5"><DialogTitle>Edit portfolio header</DialogTitle><DialogDescription>Update the identity shown at the top of your portfolio.</DialogDescription></DialogHeader><div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6"><div className="flex justify-center"><button type="button" onClick={onAvatarClick} className="group relative h-28 w-28 overflow-hidden rounded-full border border-border bg-muted" aria-label="Change profile image">{avatarUrl ? <img src={avatarUrl} alt="Profile preview" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">{displayName.slice(0, 1)}</span>}<span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/45"><Camera className="h-6 w-6 opacity-0 transition group-hover:opacity-100" /></span></button></div><div className="grid gap-4"><label className="grid gap-2 text-sm font-semibold">Name<input name="display_name" defaultValue={shell.portfolio.display_name} placeholder={displayName || 'First name Last name'} className="h-11 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 text-sm font-semibold">Tagline<input name="headline" defaultValue={shell.portfolio.headline} placeholder="What do you want people to know first?" className="h-11 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 text-sm font-semibold">Location<input name="location_label" defaultValue={shell.portfolio.location_label} placeholder="City, region" className="h-11 rounded-md border border-input bg-background px-3 font-normal" /></label></div><section><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Social links</h3>{missing.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => setSocials((current: any[]) => [...current, { type: missing[0].type, url: '' }])}><Plus className="mr-1.5 h-4 w-4" />Add</Button>}</div><div className="space-y-3">{socials.map((social: any, index: number) => <div key={`${social.type}-${index}`} className="flex gap-2"><select aria-label="Social platform" value={social.type} onChange={(event) => setSocials((current: any[]) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} className="h-11 w-32 rounded-md border border-input bg-background px-2 text-sm">{SOCIAL_OPTIONS.filter((option) => option.type === social.type || !socials.some((item: any) => item.type === option.type)).map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select><input aria-label={`${social.type} URL`} value={social.url} onChange={(event) => setSocials((current: any[]) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://" className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" /><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${social.type}`} onClick={() => setSocials((current: any[]) => current.filter((_: any, itemIndex: number) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}{!socials.length && <p className="py-3 text-sm text-muted-foreground">Add links so visitors can find you elsewhere.</p>}</div></section></div><div className="shrink-0 flex justify-end gap-2 border-t border-border bg-popover px-6 py-4"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Save header'}</Button></div></form></DialogContent></Dialog>
}

function VerificationMenu({ email, token, setShell, onPublish, busy }: { email: string; token?: string; setShell: (shell: Shell) => void; onPublish: () => void; busy: boolean }) {
  const session = useLHSession() as any
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nextEmail, setNextEmail] = useState(email)
  const [changing, setChanging] = useState(false)
  const continuingPublishRef = useRef(false)
  useEffect(() => {
    if (!token) return
    const refresh = async () => {
      try {
        const next = await getMyPortfolio(token)
        if (next?.portfolio?.email_verified) {
          setShell(next)
          setOpen(false)
          if (sent && !continuingPublishRef.current) {
            continuingPublishRef.current = true
            onPublish()
          }
        }
      } catch {
        // Verification may still be pending or the tab may be offline.
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [token, setShell, sent, onPublish])
  const resend = async () => {
    setSending(true)
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (!response.ok) throw new Error()
      const data = await response.json().catch(() => null)
      if (data?.verified && token) {
        setShell(await getMyPortfolio(token))
        setOpen(false)
        toast.success('Email verified')
        continuingPublishRef.current = true
        onPublish()
      } else {
        setSent(true)
        toast.success('Verification email sent')
      }
    } catch { toast.error('Could not resend verification email') }
    finally { setSending(false) }
  }
  const changeEmail = async () => {
    const normalized = nextEmail.trim().toLowerCase()
    if (!normalized || normalized === email) { setEditing(false); return }
    setChanging(true)
    try {
      const changed = await fetch('/api/auth/change-email', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalized }) })
      const data = await changed.json().catch(() => null)
      if (!changed.ok) throw new Error(data?.detail || 'Could not change email')
      await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalized }) })
      await session?.update?.(true)
      window.location.reload()
    } catch (error: any) { toast.error(error?.message || 'Could not change email'); setChanging(false) }
  }
  return <><Button type="button" onClick={() => setOpen(true)} disabled={busy}><Globe2 className="mr-2 h-4 w-4" />{busy ? 'Publishing…' : 'Publish'}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md">{editing ? <div><DialogHeader><DialogTitle>Change email</DialogTitle><DialogDescription>We’ll send the verification link to your new address.</DialogDescription></DialogHeader><input type="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} className="mt-5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" autoFocus /><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => { setEditing(false); setNextEmail(email) }}>Cancel</Button><Button onClick={changeEmail} disabled={changing}>{changing ? 'Saving…' : 'Save & send'}</Button></div></div> : <div><DialogHeader><DialogTitle>Verify your email to publish</DialogTitle><DialogDescription>We need to confirm that <span className="font-semibold text-foreground">{email}</span> belongs to you. Your portfolio is ready and will publish as soon as verification finishes.</DialogDescription></DialogHeader>{sent ? <div className="mt-5 rounded-xl bg-muted p-4 text-sm"><p className="font-semibold">Check your inbox</p><p className="mt-1 leading-6 text-muted-foreground">Open the verification link, then return here. We’ll continue publishing automatically.</p></div> : <Button type="button" className="mt-5 w-full" onClick={resend} disabled={sending}>{sending ? 'Sending…' : 'Send verification link'}</Button>}<button type="button" onClick={() => setEditing(true)} className="mt-4 w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">Use a different email</button></div>}</DialogContent></Dialog></>
}

const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { website: Globe, instagram: Instagram, linkedin: Linkedin, youtube: Youtube, x: X }
function SocialCircles({ socials }: { socials: Array<{ type: string; url: string }> }) {
  const visible = socials.filter((social) => social.url && SOCIAL_ICONS[social.type]).slice(0, 5)
  if (!visible.length) return null
  return <div className="mt-4 flex justify-center gap-2 sm:justify-start">{visible.map((social) => { const Icon = SOCIAL_ICONS[social.type]; const href = /^https?:\/\//i.test(social.url) ? social.url : `https://${social.url}`; return <a key={social.type} href={href} target="_blank" rel="noreferrer" aria-label={social.type} className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition hover:border-foreground"><Icon className="h-4 w-4" /></a> })}</div>
}

function Avatar({ url, name, compact }: { url?: string; name: string; compact: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  return <motion.div layout className={`${compact ? 'h-10 w-10' : 'h-28 w-28 sm:h-36 sm:w-36'} shrink-0 overflow-hidden rounded-full border border-border bg-muted`} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className={`${compact ? 'text-sm' : 'text-3xl'} flex h-full w-full items-center justify-center font-bold text-muted-foreground`}>{initials || 'P'}</span>}</motion.div>
}

function TraitCard({ kind, initial, owner, onShellChange }: { kind: 'strength' | 'value'; initial: string[]; owner: boolean; onShellChange?: (shell: Shell) => void }) {
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const options = kind === 'strength' ? PORTFOLIO_STRENGTHS : PORTFOLIO_VALUES
  const initialCustom: CategorizedOption[] = initial.filter((label) => !options.some((option) => option.text.toLocaleLowerCase() === label.toLocaleLowerCase())).map((text) => ({ id: text, text, category: 'Your own' }))
  const [customOptions, setCustomOptions] = useState(initialCustom)
  const [draftCustomOptions, setDraftCustomOptions] = useState(initialCustom)
  const [value, setValue] = useState(() => initial.map((label) => options.find((option) => option.text.toLocaleLowerCase() === label.toLocaleLowerCase())?.id || label))
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const title = kind === 'strength' ? 'Strengths' : 'Values'
  useEffect(() => {
    const target = searchParams.get('edit')
    if (owner && target === (kind === 'strength' ? 'strengths' : 'values')) setOpen(true)
  }, [kind, owner, searchParams])
  if (!owner && !value.length) return null
  const save = async () => {
    if (!token) return
    setSaving(true)
    try { const next = await updateMyPortfolioTraits({ trait_type: kind, labels: draft.map((id) => options.find((option) => option.id === id)?.text || draftCustomOptions.find((option) => option.id === id)?.text || id) }, token); setValue(draft); setCustomOptions(draftCustomOptions); onShellChange?.(next); setOpen(false); toast.success(`${title} updated`) }
    catch (error: any) { toast.error(error?.message || `Could not update ${title.toLowerCase()}`) }
    finally { setSaving(false) }
  }
  const openEditor = () => { setDraft(value); setDraftCustomOptions(customOptions); setOpen(true) }
  const labels = value.map((id) => options.find((option) => option.id === id)?.text || customOptions.find((option) => option.id === id)?.text || id)
  return <><section><div className="flex items-center gap-2"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>{owner && <button type="button" onClick={openEditor} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Edit ${title.toLowerCase()}`}><Pencil className="h-3.5 w-3.5" /></button>}</div><div className="mt-4">{value.length ? <TraitChips labels={labels} /> : owner ? <button type="button" onClick={openEditor} className="text-sm text-muted-foreground transition hover:text-foreground">Choose the {title.toLowerCase()} you want to share.</button> : null}</div></section><Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0"><DialogHeader className="border-b border-border px-6 py-5"><DialogTitle>Edit {title.toLowerCase()}</DialogTitle><DialogDescription>Choose everything that feels true to you. You can change these as you grow.</DialogDescription></DialogHeader><div className="overflow-y-auto px-6 py-5"><CategorizedMultiSelect options={options} customOptions={draftCustomOptions} onCustomOptionsChange={setDraftCustomOptions} value={draft} onChange={setDraft} min={1} /></div><div className="flex justify-end gap-2 border-t border-border px-6 py-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving || !draft.length}>{saving ? 'Saving…' : 'Save'}</Button></div></DialogContent></Dialog></>
}

function TraitChips({ labels }: { labels: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const moreMeasureRef = useRef<HTMLSpanElement>(null)
  const [visibleCount, setVisibleCount] = useState(labels.length)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      setVisibleCount(labels.length)
      window.requestAnimationFrame(() => {
        const chips = Array.from(container.querySelectorAll<HTMLElement>('[data-trait-chip]'))
        if (!chips.length) return
        const rowTops = [...new Set(chips.map((chip) => chip.offsetTop))]
        if (rowTops.length <= 3) return
        const thirdTop = rowTops[2]
        const initiallyVisible = chips.filter((chip) => chip.offsetTop <= thirdTop)
        const hidden = labels.length - initiallyVisible.length
        if (hidden <= 0) return
        if (moreMeasureRef.current) moreMeasureRef.current.textContent = `+${hidden} more`
        const reserve = (moreMeasureRef.current?.offsetWidth || 72) + 8
        const rightEdge = container.clientWidth - reserve
        const fit = initiallyVisible.filter((chip) => chip.offsetTop < thirdTop || chip.offsetLeft + chip.offsetWidth <= rightEdge).length
        setVisibleCount(Math.max(0, fit))
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [labels])
  const hidden = Math.max(0, labels.length - visibleCount)
  return <div ref={containerRef} className="relative flex flex-wrap items-center gap-2 overflow-hidden" style={{ maxHeight: 'calc(3 * 2rem + 2 * 0.5rem)' }}>{labels.slice(0, visibleCount).map((label, index) => <span data-trait-chip key={`${label}-${index}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-full border border-border px-3 text-sm font-semibold leading-none">{label}</span>)}{hidden > 0 && <span className="inline-flex h-8 items-center whitespace-nowrap text-sm font-medium leading-none text-muted-foreground">+{hidden} more</span>}<span ref={moreMeasureRef} aria-hidden className="pointer-events-none absolute invisible inline-flex h-8 items-center whitespace-nowrap text-sm font-medium">+99 more</span></div>
}

type SocialPreviewItem = { id: string; title: string; url: string; thumbnailUrl?: string }

function SocialPreviewCarousel({ type, url }: { type: 'instagram' | 'youtube'; url: string }) {
  const handle = socialHandle(type, url)
  const [items, setItems] = useState<SocialPreviewItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/portfolio/social-previews?site=${type}&handle=${encodeURIComponent(handle)}`)
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((data) => { if (!cancelled) setItems(Array.isArray(data.items) ? data.items.slice(0, 6) : []) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [handle, type])
  const Icon = type === 'instagram' ? Instagram : Youtube
  return <div><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4" /><h3 className="text-sm font-bold">{type === 'instagram' ? 'Instagram' : 'YouTube'}</h3></div><div className="flex snap-x gap-3 overflow-x-auto pb-3">{loading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className={`${type === 'instagram' ? 'aspect-[9/16] w-40' : 'aspect-video w-64'} shrink-0 animate-pulse rounded-xl bg-muted`} />) : items.length ? items.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className={`${type === 'instagram' ? 'aspect-[9/16] w-40 sm:w-48' : 'aspect-video w-64 sm:w-72'} group relative shrink-0 snap-start overflow-hidden rounded-xl bg-muted`}>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.title || ''} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : null}{type === 'youtube' && <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white"><Youtube className="h-5 w-5" /></span></span>}</a>) : <a href={normalizeSocialInput(type, handle)} target="_blank" rel="noreferrer" className="text-sm font-medium text-muted-foreground hover:text-foreground">View @{handle} on {type === 'instagram' ? 'Instagram' : 'YouTube'}</a>}</div></div>
}

function SocialPreviews({ socials }: { socials: Array<{ type: string; url: string }> }) {
  const previewSocials = socials.filter((social) => (social.type === 'instagram' || social.type === 'youtube') && social.url) as Array<{ type: 'instagram' | 'youtube'; url: string }>
  if (!previewSocials.length) return null
  return <section><h2 className="mb-5 text-sm font-bold uppercase tracking-widest text-muted-foreground">Elsewhere</h2><div className="space-y-8">{previewSocials.map((social) => <SocialPreviewCarousel key={social.type} type={social.type} url={social.url} />)}</div></section>
}

function Overview({ shell, setShell, owner, orgslug, username, importLegacy, busy, token }: any) {
  const searchParams = useSearchParams()
  const featured = shell.work.filter((work: Work) => work.featured).slice(0, 1)
  const [sections, setSections] = useState<PortfolioSection[]>(() => (shell.sections || []).filter((section: PortfolioSection) => !['identity_hero', 'about'].includes(section.section_type)))
  const editTarget = searchParams.get('edit')
  const enablingTraitsRef = useRef(false)
  const dismissLegacyImport = async () => {
    if (!token) return
    try { setShell(await dismissLegacyPortfolioImport(token)); toast.success('Legacy import skipped') }
    catch (error: any) { toast.error(error?.message || 'Could not skip the legacy import') }
  }
  const saveSections = async (nextSections: PortfolioSection[]) => {
    if (!token) return
    const omitted = (shell.sections || []).filter((section: PortfolioSection) => ['identity_hero', 'about'].includes(section.section_type))
    try {
      const next = await updateMyPortfolioSections({ revision: shell.portfolio.revision, sections: [...omitted, ...nextSections].map((section) => ({ section_uuid: section.section_uuid, enabled: section.enabled })) }, token)
      setShell(next); setSections((next.sections || []).filter((section: PortfolioSection) => !['identity_hero', 'about'].includes(section.section_type)))
    } catch (error: any) { setSections((shell.sections || []).filter((section: PortfolioSection) => !['identity_hero', 'about'].includes(section.section_type))); toast.error(error?.message || 'Could not update sections') }
  }
  useEffect(() => {
    if (!owner || (editTarget !== 'strengths' && editTarget !== 'values') || !token || enablingTraitsRef.current) return
    const traits = sections.find((section) => section.section_type === 'traits')
    if (!traits || traits.enabled) return
    enablingTraitsRef.current = true
    const next = sections.map((section) => section.section_uuid === traits.section_uuid ? { ...section, enabled: true } : section)
    void saveSections(next)
  }, [editTarget, token, sections])
  const hasContent = (type: string) => type === 'about' ? Boolean(shell.portfolio.short_bio)
    : type === 'featured_badges' ? (shell.badges?.featured || []).length > 0
    : type === 'traits' ? (shell.traits?.strength || []).length > 0 || (shell.traits?.value || []).length > 0
    : type === 'current_journey' ? (shell.journey || []).length > 0
    : type === 'featured_work' ? shell.work.length > 0
    : type === 'links' ? (shell.portfolio.socials || []).length > 0
    : false
  const renderSection = (type: string) => type === 'about' ? <section><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">About</h2><p className="mt-4 max-w-3xl text-xl leading-relaxed">{shell.portfolio.short_bio}</p></section>
    : type === 'featured_badges' ? <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Badges</h2><Link href={getUriWithOrg(orgslug, owner ? '/portfolio/badges' : `/user/${username}/badges`)} className="text-sm font-semibold">View all</Link></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{shell.badges.featured.map((badge: PortfolioBadge) => <BadgeCard key={badge.badge_uuid} badge={badge} compact orgslug={orgslug} />)}</div></section>
    : type === 'traits' ? <div className="grid gap-10 sm:grid-cols-2 sm:gap-12"><TraitCard kind="strength" initial={shell.traits?.strength || []} owner={owner} onShellChange={setShell} /><TraitCard kind="value" initial={shell.traits?.value || []} owner={owner} onShellChange={setShell} /></div>
    : type === 'current_journey' ? <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Recent experience</h2><button className="text-sm font-semibold" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, owner ? '/portfolio/journey' : `/user/${username}/journey`)); window.dispatchEvent(new PopStateEvent('popstate')) }}>View timeline</button></div><JourneyTimeline entries={((shell.journey || []).filter((entry: JourneyEntry) => entry.is_current).slice(0, 1).length ? (shell.journey || []).filter((entry: JourneyEntry) => entry.is_current).slice(0, 1) : (shell.journey || []).slice(0, 1))} owner={owner} orgslug={orgslug} username={username} /></section>
    : type === 'featured_work' ? <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-black uppercase tracking-[0.16em] text-lime-600 dark:text-lime-400">Featured project</h2><button className="text-sm font-semibold transition-colors hover:text-lime-600" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, owner ? '/portfolio/work' : `/user/${username}/work`)); window.dispatchEvent(new PopStateEvent('popstate')) }}>View all</button></div>{featured.length ? <FeaturedWorkCards work={featured} owner={owner} orgslug={orgslug} username={username} /> : owner ? <button type="button" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, '/portfolio/work')); window.dispatchEvent(new PopStateEvent('popstate')) }} className="w-full rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm font-semibold text-muted-foreground transition hover:border-foreground hover:text-foreground">Star one of your projects to feature it here.</button> : null}</section>
    : type === 'links' ? <SocialPreviews socials={shell.portfolio.socials || []} /> : null
  const actionConfig: Record<string, { title: string; prompt: string; href: string; icon: React.ComponentType<{ className?: string }> }> = {
    about: { title: 'Profile', prompt: 'Introduce yourself', href: '/portfolio?edit=profile', icon: BookOpen },
    featured_badges: { title: 'Badges', prompt: 'Find one you’d like to start', href: '/badges?choose=1', icon: Award },
    traits: { title: 'Strengths & values', prompt: 'Highlight what makes you, you', href: '/portfolio?edit=strengths', icon: Zap },
    current_journey: { title: 'Timeline', prompt: 'Add experience or education', href: '/portfolio/journey/new', icon: BookOpen },
    featured_work: { title: 'Projects', prompt: 'Showcase your work', href: '/portfolio/work/new', icon: FolderOpen },
    links: { title: 'Socials', prompt: 'Connect your world', href: '/portfolio?edit=profile', icon: Share2 },
  }
  const editingTraits = editTarget === 'strengths' || editTarget === 'values'
  const completedSections = sections.filter((section) => hasContent(section.section_type) || (editingTraits && section.section_type === 'traits'))
  const emptySections = owner ? sections.filter((section) => !hasContent(section.section_type) && !(editingTraits && section.section_type === 'traits') && actionConfig[section.section_type]) : []
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return
    const sourceSection = completedSections[result.source.index]
    const destinationSection = completedSections[result.destination.index]
    if (!sourceSection || !destinationSection) return
    const next = Array.from(sections)
    const sourceIndex = next.findIndex((section) => section.section_uuid === sourceSection.section_uuid)
    const destinationIndex = next.findIndex((section) => section.section_uuid === destinationSection.section_uuid)
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(destinationIndex, 0, moved)
    setSections(next)
    void saveSections(next)
  }
  return <div className="space-y-14">
    <DragDropContext onDragEnd={onDragEnd} autoScrollerOptions={{ disabled: false }}>
      <Droppable droppableId="portfolio-overview-sections">
        {(dropProvided, dropSnapshot) => <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className={`space-y-14 ${dropSnapshot.isDraggingOver ? 'portfolio-sections-dragging' : ''}`}>
          {completedSections.map((section, index) => { const content = renderSection(section.section_type); if (!content) return null; return <Draggable key={section.section_uuid} draggableId={section.section_uuid} index={index} isDragDisabled={!owner}>
            {(dragProvided, dragSnapshot) => <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} style={dragProvided.draggableProps.style} className={`group/section relative before:absolute before:-bottom-5 before:-left-16 before:-top-5 before:w-16 before:content-[''] ${dragSnapshot.isDragging ? 'z-50 rounded-2xl bg-background p-5 shadow-2xl ring-1 ring-border' : 'transition-opacity'} ${section.enabled ? '' : 'opacity-40 grayscale'}`}>
              {owner && <div className={`absolute left-0 top-0 z-10 -translate-x-[calc(100%+12px)] flex-col items-center gap-1 rounded-xl border border-border bg-background/95 p-1 shadow-md backdrop-blur transition duration-200 sm:flex ${dragSnapshot.isDragging ? 'cursor-grabbing opacity-100' : 'pointer-events-none -translate-x-[calc(100%+6px)] opacity-0 group-hover/section:pointer-events-auto group-hover/section:-translate-x-[calc(100%+12px)] group-hover/section:opacity-100 group-focus-within/section:pointer-events-auto group-focus-within/section:opacity-100'}`}>
                <button type="button" {...dragProvided.dragHandleProps} className="cursor-grab rounded-lg p-2 text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground active:cursor-grabbing" aria-label={`Reorder ${section.title_override || section.section_type.replaceAll('_', ' ')} section`} title="Drag to reorder"><GripVertical className="h-4 w-4" /></button>
                <button type="button" onClick={() => { const next = sections.map((item) => item.section_uuid === section.section_uuid ? { ...item, enabled: !item.enabled } : item); setSections(next); void saveSections(next) }} className="rounded-lg p-2 text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground" aria-label={section.enabled ? 'Hide section from visitors' : 'Show section to visitors'}>{section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              </div>}
              {content}
            </div>}
          </Draggable> })}
          {dropProvided.placeholder}
        </div>}
      </Droppable>
    </DragDropContext>
    {emptySections.length > 0 && <section className="max-w-xl space-y-2"><div className="mb-4"><h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Keep building</h2><p className="mt-1 text-sm text-muted-foreground">Choose what you want to add next.</p></div>{emptySections.map((section) => { const action = actionConfig[section.section_type]; const Icon = action.icon; return <Link key={section.section_uuid} href={getUriWithOrg(orgslug, action.href)} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{action.title}</span><span className="block truncate text-xs text-muted-foreground">{action.prompt}</span></span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] transition group-hover:scale-105"><Plus className="h-4 w-4" /></span></Link>})}</section>}
    {owner && shell.portfolio.has_legacy_portfolio && <section className="rounded-2xl border border-dashed border-border p-6"><h2 className="font-bold">Have an older Launch LMS portfolio?</h2><p className="mt-1 text-sm text-muted-foreground">Import its work and journey items into the new builder. Your original profile data stays untouched.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={importLegacy}>{busy ? 'Importing…' : 'Import legacy work'}</Button><Button variant="ghost" disabled={busy} onClick={dismissLegacyImport}>Skip import</Button></div></section>}
  </div>
}

function BadgeCard({ badge, orgslug, compact = false, featured, hidden, onFeature, onVisibility }: { badge: PortfolioBadge; orgslug: string; compact?: boolean; featured?: boolean; hidden?: boolean; onFeature?: () => void; onVisibility?: () => void }) {
  const inProgress = badge.status === 'in_progress'
  const percent = Math.max(0, Math.min(100, badge.progress?.percent || 0))
  const content = <><div className={`mx-auto ${compact ? 'h-28 w-28' : 'h-32 w-32 sm:h-36 sm:w-36'} overflow-visible ${inProgress ? 'grayscale opacity-55' : ''}`}>{badge.thumbnail_image ? <BadgeThumbnailImage src={normalizeMediaUrl(badge.thumbnail_image)} alt="" hoverScale /> : <div className="flex h-full w-full items-center justify-center"><Award className="h-10 w-10 text-muted-foreground" /></div>}</div><div className="mt-2"><h3 className={`${compact ? 'text-sm' : 'text-sm sm:text-base'} font-bold leading-tight`}>{badge.name}</h3><div className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground"><span>{inProgress ? 'In progress' : 'Earned'}</span>{inProgress && <span>{percent}%</span>}</div>{inProgress && <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted" aria-label={`${percent}% complete`}><div className="h-full rounded-full bg-foreground/50 transition-[width]" style={{ width: `${percent}%` }} /></div>}</div></>
  return <div className={`group relative rounded-xl transition hover:bg-muted/60 ${hidden ? 'opacity-45 grayscale' : ''}`}><Link href={getUriWithOrg(orgslug, routePaths.org.badgeStatus(badge.badge_uuid))} className="block p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{content}</Link>{onFeature && <button type="button" onClick={onFeature} aria-label={featured ? `Remove ${badge.name} from featured badges` : `Feature ${badge.name}`} className={`absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-sm transition hover:scale-105 ${featured ? 'text-amber-500 opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100'}`}><Star className="h-5 w-5" fill={featured ? 'currentColor' : 'none'} /></button>}{onVisibility && <button type="button" onClick={onVisibility} aria-label={hidden ? `Show ${badge.name} publicly` : `Hide ${badge.name} from visitors`} className="absolute left-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:scale-105 hover:text-foreground">{hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>}</div>
}

function InProgressBadgeCard({ badge, orgslug }: { badge: PortfolioBadge; orgslug: string }) {
  const percent = Math.max(0, Math.min(100, badge.progress?.percent || 0))
  return <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}`)} className="group flex w-[280px] shrink-0 items-center gap-4 rounded-lg border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"><div className="h-16 w-16 shrink-0 overflow-visible grayscale opacity-60">{badge.thumbnail_image ? <BadgeThumbnailImage src={normalizeMediaUrl(badge.thumbnail_image)} alt="" hoverScale /> : <div className="flex h-full items-center justify-center"><Award className="h-7 w-7 text-muted-foreground" /></div>}</div><div className="min-w-0 flex-1"><div className="line-clamp-2 text-sm font-bold leading-tight">{badge.name}</div><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${percent}%` }} /></div><span className="text-xs font-bold tabular-nums text-muted-foreground">{percent}%</span></div></div></Link>
}

function BadgesView({ shell, setShell, owner, orgslug, token }: { shell: Shell; setShell: (shell: Shell) => void; owner: boolean; orgslug: string; token?: string }) {
  const earned = shell.badges?.earned || []
  const inProgress = shell.badges?.inProgress || []
  const [selected, setSelected] = useState<string[]>(shell.badges?.featuredBadgeUuids || [])
  const [hidden, setHidden] = useState<string[]>(shell.badges?.hiddenBadgeUuids || [])
  const [savingUuid, setSavingUuid] = useState<string | null>(null)
  const toggle = async (uuid: string) => {
    if (!token) return
    const nextSelected = selected.includes(uuid) ? selected.filter((item) => item !== uuid) : [...selected, uuid]
    setSelected(nextSelected); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioFeaturedBadges({ badge_uuids: nextSelected }, token); setShell(next) }
    catch (error: any) { setSelected(selected); toast.error(error?.message || 'Could not update featured badges') }
    finally { setSavingUuid(null) }
  }
  const toggleVisibility = async (uuid: string) => {
    if (!token) return
    const nextHidden = hidden.includes(uuid) ? hidden.filter((item) => item !== uuid) : [...hidden, uuid]
    setHidden(nextHidden); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioBadgeVisibility({ hidden_badge_uuids: nextHidden, revision: shell.portfolio.revision }, token); setShell(next) }
    catch (error: any) { setHidden(hidden); toast.error(error?.message || 'Could not update badge visibility') }
    finally { setSavingUuid(null) }
  }
  if (owner && !earned.length && !inProgress.length) return <EmptyTab icon={Award} eyebrow="Your badges" title="Turn progress into proof" description="Badge paths help you practice skills, collect evidence, and show what you can do." examples={['Choose a skill to grow', 'Complete hands-on activities', 'Collect evidence of your work', 'Share verified achievements']} action="Find your first badge" href="/badges?choose=1" orgslug={orgslug} />
  return <div className="space-y-12">
    {inProgress.length > 0 && <section><div className="mb-5 flex items-end justify-between"><div><h2 className="text-2xl font-black">In progress</h2><p className="mt-1 text-sm text-muted-foreground">Keep going on the badge paths you’ve started.</p></div>{owner && <Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, '/badges?choose=1')}>Find more badges</Link></Button>}</div><div className="flex gap-4 overflow-x-auto pb-2">{inProgress.map((badge) => <InProgressBadgeCard key={badge.badge_uuid} badge={badge} orgslug={orgslug} />)}</div></section>}
    <section><div className="mb-5"><h2 className="text-2xl font-black">Earned badges</h2>{owner && <p className="mt-1 text-sm text-muted-foreground">Star badges for your overview. Use the eye control to hide a badge from visitors.</p>}</div>{earned.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{earned.map((badge) => <div key={badge.badge_uuid} className={savingUuid === badge.badge_uuid ? 'pointer-events-none opacity-70' : ''}><BadgeCard badge={badge} orgslug={orgslug} featured={selected.includes(badge.badge_uuid)} hidden={hidden.includes(badge.badge_uuid)} onFeature={owner ? () => toggle(badge.badge_uuid) : undefined} onVisibility={owner ? () => toggleVisibility(badge.badge_uuid) : undefined} /></div>)}</div> : <div className="rounded-2xl border border-dashed border-border py-14 text-center"><Award className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Your earned badges will appear here.</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Start a badge path to practice a skill and collect evidence you can share.</p>{owner && <Button asChild className="mt-6"><Link href={getUriWithOrg(orgslug, '/badges?choose=1')}>Find a badge</Link></Button>}</div>}</section>
  </div>
}

function ChecklistMenu({ checklist, orgslug, children, align = 'end' }: { checklist?: Shell['checklist']; orgslug: string; children: React.ReactNode; align?: 'start' | 'center' | 'end' }) {
  if (!checklist?.total) return null
  return <Popover><PopoverTrigger asChild>{children}</PopoverTrigger><PopoverContent align={align} sideOffset={8} collisionPadding={16} className="z-[10001] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-border bg-popover p-4 shadow-2xl"><div className="flex items-end justify-between"><div><p className="text-lg font-black">Launch Ready</p><p className="mt-0.5 text-xs text-muted-foreground">Let’s build your portfolio</p></div><span className="text-sm font-black tabular-nums text-muted-foreground">{checklist.completed}/{checklist.total}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)] transition-[width]" style={{ width: `${checklist.percent}%` }} /></div><div className="mt-3 space-y-0.5">{checklist.items.map((item) => item.complete ? <div key={item.key} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-foreground"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] shadow-sm"><Check className="h-3 w-3" /></span><span className="text-sm font-semibold">{item.label}</span></div> : <Link key={item.key} href={getUriWithOrg(orgslug, item.href)} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-muted"><Circle className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 text-sm font-semibold">{item.label}</span><ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></Link>)}</div></PopoverContent></Popover>
}

function ProgressRing({ checklist, size = 'compact', inverse = false }: { checklist: NonNullable<Shell['checklist']>; size?: 'compact' | 'expanded'; inverse?: boolean }) {
  const dimensions = size === 'compact' ? 'h-6 w-6' : 'h-7 w-7'
  const progressColor = inverse ? 'var(--org-on-primary-color)' : 'var(--org-primary-color)'
  const trackColor = inverse ? 'color-mix(in srgb, var(--org-on-primary-color) 24%, transparent)' : 'hsl(var(--muted))'
  const centerColor = inverse ? 'var(--org-primary-color)' : 'hsl(var(--background))'
  return <span role="progressbar" aria-label={`${checklist.completed} of ${checklist.total} Launch Ready items complete`} aria-valuemin={0} aria-valuemax={checklist.total} aria-valuenow={checklist.completed} className={`${dimensions} relative shrink-0 rounded-full`} style={{ background: `conic-gradient(${progressColor} ${checklist.percent}%, ${trackColor} 0)` }}><span className="absolute inset-[3px] rounded-full" style={{ backgroundColor: centerColor }} /></span>
}

function CompletionStar({ size = 'compact' }: { size?: 'compact' | 'expanded' }) {
  const dimensions = size === 'compact' ? 'h-6 w-6' : 'h-8 w-8'
  return <span className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]`}><Star className={size === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="currentColor" /></span>
}

function ChecklistGauge({ checklist, orgslug, onPublish, busy }: { checklist?: Shell['checklist']; orgslug: string; onPublish: () => void; busy: boolean }) {
  if (!checklist?.total) return null
  if (checklist.completed === checklist.total) return <Popover><PopoverTrigger asChild><button type="button" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-background px-2.5 text-xs font-black shadow-sm transition hover:bg-muted" aria-label="Your portfolio is ready to publish"><CompletionStar /><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></button></PopoverTrigger><PopoverContent align="end" sideOffset={8} collisionPadding={16} className="z-[10001] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border-border bg-popover p-4 shadow-2xl"><div className="flex items-start gap-3"><CompletionStar size="expanded" /><div><p className="font-black">Your portfolio is ready to share</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Publish it so others can see what you’ve built.</p></div></div><Button variant="brand" className="mt-4 w-full" onClick={onPublish} disabled={busy}><Globe2 className="mr-2 h-4 w-4" />{busy ? 'Publishing…' : 'Publish portfolio'}</Button></PopoverContent></Popover>
  return <ChecklistMenu checklist={checklist} orgslug={orgslug}><button type="button" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-black shadow-sm transition hover:bg-muted" aria-label={`Open Launch Ready checklist, ${checklist.completed} of ${checklist.total} complete`}><span className="tabular-nums">{checklist.completed}/{checklist.total}</span><ProgressRing checklist={checklist} /><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></button></ChecklistMenu>
}

function ChecklistBanner({ checklist, orgslug, onPublish, busy }: { checklist?: Shell['checklist']; orgslug: string; onPublish: () => void; busy: boolean }) {
  if (!checklist?.total) return null
  const next = checklist.nextIncomplete
  if (!next) return <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm"><CompletionStar size="expanded" /><div className="min-w-0"><p className="text-sm font-black">Your portfolio is ready to share</p><p className="text-xs text-muted-foreground">Publish it so others can see what you’ve built.</p></div><Button variant="brand" size="sm" onClick={onPublish} disabled={busy}><Globe2 className="mr-1.5 h-4 w-4" />{busy ? 'Publishing…' : 'Publish'}</Button></div>
  return <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl bg-[var(--org-primary-color)] px-4 py-3 text-[var(--org-on-primary-color)] shadow-sm"><div className="flex flex-col items-center gap-0.5"><ProgressRing checklist={checklist} size="expanded" inverse /><span className="text-[10px] font-black tabular-nums opacity-75">{checklist.completed}/{checklist.total}</span></div><div className="min-w-0"><p className="truncate text-sm font-black">{next.label}</p><p className="mt-0.5 truncate text-xs opacity-80">{next.supportingText}</p><Button asChild size="sm" className="mt-2 h-8 bg-[var(--org-on-primary-color)] px-3 text-xs font-black text-[var(--org-primary-color)] shadow-sm hover:bg-[var(--org-on-primary-color)] hover:opacity-90"><Link href={getUriWithOrg(orgslug, next.href)}>Continue<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button></div><ChecklistMenu checklist={checklist} orgslug={orgslug}><button type="button" aria-label="View all Launch Ready checklist items" className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--org-on-primary-color)] transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-on-primary-color)]"><ChevronDown className="h-5 w-5" /></button></ChecklistMenu></div>
}

function EmptyTab({ icon: Icon, eyebrow, title, description, examples, action, href, orgslug }: { icon: React.ComponentType<{ className?: string }>; eyebrow: string; title: string; description: string; examples: string[]; action: string; href: string; orgslug: string }) {
  return <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-3 text-center sm:py-5"><div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="h-8 w-8" /><Sparkles className="absolute -right-2 top-1 h-4 w-4" /><WandSparkles className="absolute -left-2 bottom-2 h-3.5 w-3.5" /></div><p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl">{title}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p><ul className="mt-4 grid w-full max-w-md grid-cols-1 gap-x-5 gap-y-1.5 text-left sm:grid-cols-2">{examples.map((example) => <li key={example} className="flex items-center gap-2 text-sm"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground"><Check className="h-3 w-3" /></span>{example}</li>)}</ul><Button asChild variant="brand" className="mt-5 w-full max-w-sm"><Link href={getUriWithOrg(orgslug, href)}>{action}<ArrowRight className="ml-auto h-4 w-4" /></Link></Button></section>
}

function EmptyWork({ orgslug }: { orgslug: string }) { return <EmptyTab icon={FolderOpen} eyebrow="Your projects" title="Let’s add your first project" description="Projects can be anything you’re proud of—not just formal work." examples={['School work', 'Personal projects', 'Clubs and activities', 'Volunteering', 'Anything you’ve built']} action="Add project" href="/portfolio/work/new" orgslug={orgslug} /> }

function WorkGrid({ shell, setShell, owner, orgslug, username, token }: any) {
  const [savingUuid, setSavingUuid] = useState<string | null>(null)
  const toggleFeatured = async (item: Work) => {
    if (!token || savingUuid) return
    setSavingUuid(item.work_uuid)
    try {
      const next = await updateMyPortfolioFeaturedWork({ work_uuid: item.featured ? null : item.work_uuid }, token)
      setShell(next)
      toast.success(item.featured ? 'Removed from featured work' : `${item.title} is now featured`)
    } catch (error: any) { toast.error(error?.message || 'Could not update featured work') }
    finally { setSavingUuid(null) }
  }
  if (!shell.work.length) return owner ? <EmptyWork orgslug={orgslug} /> : <p className="text-muted-foreground">No public work yet.</p>
  return <section>{owner && <div className="mb-5"><h2 className="text-2xl font-black">Your projects</h2><p className="mt-1 text-sm text-muted-foreground">Star one item to feature on your overview. Choosing another replaces the current selection.</p></div>}<div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 lg:grid-cols-3">{shell.work.map((item: Work) => <div key={item.work_uuid} className={`group/work relative ${savingUuid === item.work_uuid ? 'pointer-events-none opacity-65' : ''}`}><WorkCardView item={item} href={getUriWithOrg(orgslug, owner ? `/portfolio/work/${item.work_uuid}` : `/user/${username}/work/${item.slug}`)} />{owner && <button type="button" onClick={() => toggleFeatured(item)} aria-label={item.featured ? `Remove ${item.title} from featured work` : `Feature ${item.title}`} aria-pressed={item.featured} className={`absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/95 shadow-md ring-1 ring-border transition hover:scale-105 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${item.featured ? 'text-amber-500 opacity-100' : 'text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover/work:opacity-100'}`}><Star className="h-5 w-5" fill={item.featured ? 'currentColor' : 'none'} /></button>}</div>)}</div></section>
}

function ResumeView({ shell, username }: { shell: Shell; orgslug: string; username?: string; owner: boolean }) {
  const displayName = shell.portfolio.display_name || username || 'Your name'
  const experience = (shell.journey || []).filter((entry) => ['employment', 'volunteering', 'experience', 'other'].includes(entry.entry_type))
  const education = (shell.journey || []).filter((entry) => ['education', 'training'].includes(entry.entry_type))
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLElement | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pageHeight, setPageHeight] = useState(1056)
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const scale = fitScale * zoom
  useEffect(() => {
    const canvas = canvasRef.current
    const page = pageRef.current
    if (!canvas || !page) return
    const measure = () => {
      setFitScale(Math.min(1, Math.max(0.25, (canvas.clientWidth - 48) / 816)))
      setPageHeight(Math.max(1056, page.scrollHeight))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(canvas); observer.observe(page)
    return () => observer.disconnect()
  }, [])
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || (event.target as HTMLElement).closest('[data-resume-canvas-controls], a, button')) return
    panRef.current = { x: event.clientX, y: event.clientY, left: canvasRef.current.scrollLeft, top: canvasRef.current.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || !canvasRef.current) return
    canvasRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x)
    canvasRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y)
  }
  return <section className="relative">
    <style jsx global>{`[data-portfolio-resume] { color: #0a0a0a !important; } [data-portfolio-resume] .text-foreground { color: #0a0a0a !important; } [data-portfolio-resume] .text-muted-foreground { color: #666 !important; } [data-portfolio-resume] .bg-muted { background-color: #f0f0f0 !important; } [data-portfolio-resume] .border-border { border-color: #d9d9d9 !important; } [data-portfolio-resume] svg { color: #777 !important; } @page { size: letter; margin: 0; } @media print { body * { visibility: hidden !important; } [data-portfolio-resume], [data-portfolio-resume] * { visibility: visible !important; } [data-portfolio-resume] { position: absolute !important; inset: 0 !important; width: 8.5in !important; min-height: 11in !important; transform: none !important; border: 0 !important; } [data-resume-canvas-controls] { display: none !important; } }`}</style>
    <div data-resume-canvas-controls className="absolute right-4 top-4 z-20 flex w-fit items-center gap-1 rounded-xl border border-border bg-popover/95 p-1 text-popover-foreground backdrop-blur">
      <button type="button" onClick={() => setZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
      <button type="button" onClick={() => setZoom(1)} className="h-8 min-w-14 rounded-lg px-2 text-xs font-bold hover:bg-muted" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.25).toFixed(2))))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
    </div>
    <div ref={canvasRef} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={() => { panRef.current = null }} onPointerCancel={() => { panRef.current = null }} className="relative h-[calc(100dvh-6.625rem)] cursor-grab overflow-auto overscroll-contain bg-muted/70 p-6 active:cursor-grabbing">
      <div className="mx-auto mt-2" style={{ width: 816 * scale, height: pageHeight * scale }}>
    <article ref={pageRef} data-portfolio-resume style={{ width: 816, minHeight: 1056, transform: `scale(${scale})`, transformOrigin: 'top left', '--background': '0 0% 100%', '--foreground': '0 0% 4%', '--card': '0 0% 100%', '--card-foreground': '0 0% 4%', '--muted': '0 0% 95%', '--muted-foreground': '0 0% 40%', '--border': '0 0% 86%' } as React.CSSProperties} className="grid grid-cols-[260px_minmax(0,1fr)] gap-7 border border-neutral-200 bg-white p-10 text-neutral-950">
      <aside className="space-y-6 border-r border-border pr-6">
        <header>
          <h1 className="text-3xl font-semibold leading-tight text-foreground">{displayName}</h1>
          {shell.portfolio.headline && <p className="mt-2 text-sm font-medium text-muted-foreground">{shell.portfolio.headline}</p>}
          {shell.portfolio.location_label && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{shell.portfolio.location_label}</p>}
        </header>
        {shell.portfolio.socials?.length ? <ResumeSection title="Links"><div className="space-y-2">{shell.portfolio.socials.map((social: any) => <a key={`${social.type}-${social.url}`} href={social.url} target="_blank" rel="noreferrer" className="block break-all text-sm text-muted-foreground hover:text-foreground">{social.url}</a>)}</div></ResumeSection> : null}
        {((shell.traits?.strength || []).length || (shell.traits?.value || []).length) ? <ResumeSection title="What I Bring"><div className="flex flex-wrap gap-2">{[...(shell.traits?.strength || []), ...(shell.traits?.value || [])].map((trait) => <span key={trait} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{trait}</span>)}</div></ResumeSection> : null}
      </aside>
      <div className="space-y-7">
        {shell.portfolio.short_bio && <ResumeSection title="Summary"><p className="leading-7 text-muted-foreground">{shell.portfolio.short_bio}</p></ResumeSection>}
        <ResumeSection title="Experience">{experience.length ? experience.map((entry) => <ResumeJourneyEntry key={entry.journey_uuid} entry={entry} />) : <p className="text-sm text-muted-foreground">Add jobs, internships, or other experience to your timeline.</p>}</ResumeSection>
        {education.length > 0 && <ResumeSection title="Education & Training">{education.map((entry) => <ResumeJourneyEntry key={entry.journey_uuid} entry={entry} />)}</ResumeSection>}
        <ResumeSection title="Projects">{shell.work?.length ? shell.work.slice(0, 5).map((work) => { const description = String(work.blocks.find((block) => block.block_type === 'text')?.data?.text || work.summary || ''); return <div key={work.work_uuid} className="break-inside-avoid"><div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">{work.title}</h3></div>{formatWorkDate(work.start_date, work.end_date) && <p className="mt-1 text-sm font-medium text-muted-foreground">{formatWorkDate(work.start_date, work.end_date)}</p>}{description && <p className="mt-1.5 whitespace-pre-wrap leading-6 text-muted-foreground">{description}</p>}</div> }) : <p className="text-sm text-muted-foreground">Add projects to fill this section.</p>}</ResumeSection>
      </div>
    </article>
      </div>
    </div>
  </section>
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid"><h2 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2><div className="mt-3 space-y-4">{children}</div></section>
}

function ResumeJourneyEntry({ entry }: { entry: JourneyEntry }) {
  return <div className="grid break-inside-avoid grid-cols-[1fr_auto] gap-x-4"><div><div className="flex items-center gap-2">{['education', 'training'].includes(entry.entry_type) ? <GraduationCap className="h-4 w-4 text-muted-foreground" /> : <Briefcase className="h-4 w-4 text-muted-foreground" />}<h3 className="font-semibold">{entry.title}</h3></div>{entry.organization && <p className="mt-1 text-sm font-medium text-muted-foreground">{entry.organization}</p>}{entry.summary && <p className="mt-1.5 whitespace-pre-wrap leading-6 text-muted-foreground">{entry.summary}</p>}</div><p className="text-right text-sm font-medium text-muted-foreground">{journeyDateLabel(entry)}</p></div>
}

export function WorkCardView({ item, href, preview = false }: { item: Work; href?: string; preview?: boolean }) { const card = <div className="group min-w-0"><div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">{item.cover_url ? <img src={normalizeMediaUrl(item.cover_url)} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-muted-foreground">{item.title || 'Your projects'}</div>}</div><h3 className="mt-3 line-clamp-2 text-sm font-bold leading-snug sm:text-base">{item.title || 'Your projects'}</h3>{(item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')) && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')}</p>}{preview && <span className="sr-only">Preview of your Work card</span>}</div>; return href ? <Link href={href}>{card}</Link> : card }

function WorkCards({ work, owner, orgslug, username }: { work: Work[]; owner: boolean; orgslug: string; username?: string }) { return <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 lg:grid-cols-3">{work.map((item) => <WorkCardView key={item.work_uuid} item={item} href={getUriWithOrg(orgslug, owner ? `/portfolio/work/${item.work_uuid}` : `/user/${username}/work/${item.slug}`)} />)}</div> }

function FeaturedWorkCards({ work, owner, orgslug, username }: { work: Work[]; owner: boolean; orgslug: string; username?: string }) {
  return <div>{work.map((item) => {
    const href = getUriWithOrg(orgslug, owner ? `/portfolio/work/${item.work_uuid}` : `/user/${username}/work/${item.slug}`)
    const excerpt = item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')
    return <Link key={item.work_uuid} href={href} className="group grid min-h-28 max-w-3xl grid-cols-[minmax(0,1fr)_44%] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground transition-colors hover:border-foreground/25 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground sm:h-44 sm:grid-cols-[42%_minmax(0,1fr)]">
      <div className="order-1 flex min-w-0 flex-col justify-center px-3.5 py-3 sm:order-2 sm:px-6"><h3 className="line-clamp-2 text-[15px] font-bold leading-tight tracking-tight sm:text-lg">{item.title}</h3>{excerpt && <p className="mt-3 hidden line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:block">{excerpt}</p>}</div>
      <div className="order-2 min-w-0 overflow-hidden border-l border-border bg-muted sm:order-1 sm:border-l-0 sm:border-r">{item.cover_url ? <img src={normalizeMediaUrl(item.cover_url)} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-muted-foreground">{item.title}</div>}</div>
    </Link>
  })}</div>
}

export function WorkEditor({ initialWork, orgslug }: { initialWork?: Work; orgslug: string }) {
  const router = useRouter(); const session = useLHSession() as any; const token = session?.data?.tokens?.access_token; const userId = Number(session?.data?.user?.id || 0); const [busy, setBusy] = useState(false); const [pickerOpen, setPickerOpen] = useState(false)
  const initialImages = (initialWork?.blocks || []).filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: block.data.asset_uuid, url: block.data.url, title: block.data.caption || '', owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
  const [images, setImages] = useState<MediaAsset[]>(initialImages)
  const [coverUuid, setCoverUuid] = useState<string | undefined>(initialWork?.cover_asset_uuid || initialImages[0]?.asset_uuid)
  function addImage(asset: MediaAsset) { setImages((current) => current.some((item) => item.asset_uuid === asset.asset_uuid) ? current : [...current, asset]); setCoverUuid((current) => current || asset.asset_uuid); setPickerOpen(false) }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!token) return; const form = new FormData(event.currentTarget); setBusy(true); try { const body: any = { title: form.get('title'), subtitle: '', start_date: form.get('start_date') || null, end_date: form.get('end_date') || null, cover_asset_uuid: coverUuid || null, blocks: [{ block_type: 'text', data: { text: form.get('story') } }, ...images.map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } }))] }; const saved = initialWork ? await updatePortfolioWork(initialWork.work_uuid, { ...body, revision: initialWork.revision }, token) : await createPortfolioWork({ ...body, idempotency_key: crypto.randomUUID() }, token); router.push(getUriWithOrg(orgslug, `/portfolio/work/${saved.work_uuid}`)); router.refresh() } catch (error: any) { toast.error(error?.message || 'Could not save work') } finally { setBusy(false) } }
  return <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6"><ContentPageHeader orgslug={orgslug} backLabel="Projects" noHorizontalBleed /><form onSubmit={submit} className="grid gap-7"><h1 className="text-3xl font-black sm:text-4xl">{initialWork ? 'Edit project' : 'Add project'}</h1><label className="grid gap-2 font-semibold">Title<input required name="title" defaultValue={initialWork?.title} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><div className="grid grid-cols-2 gap-4"><label className="grid gap-2 font-semibold">Start date<input type="date" name="start_date" defaultValue={initialWork?.start_date || ''} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 font-semibold">End date<input type="date" name="end_date" defaultValue={initialWork?.end_date || ''} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label></div><label className="grid gap-2 font-semibold">Description<textarea name="story" defaultValue={initialWork?.blocks?.find((block) => block.block_type === 'text')?.data?.text || ''} rows={10} className="rounded-md border border-input bg-background p-3 font-normal" /></label><section><div className="flex items-center justify-between"><div><h2 className="font-semibold">Images</h2><p className="text-sm text-muted-foreground">Choose one image as the cover.</p></div><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4" />Add image</Button></div>{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.asset_uuid} className={`group relative overflow-hidden rounded-xl border-2 ${coverUuid === image.asset_uuid ? 'border-foreground' : 'border-transparent'}`}><button type="button" onClick={() => setCoverUuid(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{coverUuid === image.asset_uuid ? 'Cover' : 'Make cover'}</span></button><button type="button" aria-label="Remove image" onClick={() => { setImages((current) => current.filter((item) => item.asset_uuid !== image.asset_uuid)); if (coverUuid === image.asset_uuid) setCoverUuid(images.find((item) => item.asset_uuid !== image.asset_uuid)?.asset_uuid) }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><Trash2 className="h-4 w-4" /></button></div>)}</div>}</section><Button size="lg" disabled={busy}>{busy ? 'Publishing…' : initialWork ? 'Save changes' : 'Publish project'}</Button></form><MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Add a project image" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={addImage} /></main>
}

function formatWorkDate(start?: string, end?: string) { if (!start && !end) return ''; const format = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)); if (start && end) return `${format(start)} – ${format(end)}`; return start ? format(start) : `Through ${format(end!)}` }
export function WorkDetail({ work, portfolio, orgslug, owner, username }: { work: Work; portfolio: any; orgslug: string; owner: boolean; username?: string }) { const gallery = work.blocks.filter((block) => block.block_type === 'image' && block.data.asset_uuid !== work.cover_asset_uuid); const story = work.blocks.find((block) => block.block_type === 'text'); return <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6"><ContentPageHeader orgslug={orgslug} backLabel="Projects" noHorizontalBleed />{owner && <div className="mb-4 flex justify-end"><Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, `/portfolio/work/${work.work_uuid}/edit`)}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button></div>}<article>{work.cover_url && <div className="aspect-[16/9] overflow-hidden rounded-xl bg-muted"><img src={normalizeMediaUrl(work.cover_url)} alt="" className="h-full w-full object-cover" /></div>}<h1 className="mt-7 text-3xl font-black sm:text-5xl">{work.title}</h1>{formatWorkDate(work.start_date, work.end_date) && <p className="mt-2 text-sm text-muted-foreground">{formatWorkDate(work.start_date, work.end_date)}</p>}{story?.data?.text && <div className="prose prose-lg mt-8 max-w-3xl whitespace-pre-wrap dark:prose-invert">{story.data.text}</div>}{gallery.length > 0 && <div className="mt-10 grid gap-3 sm:grid-cols-2">{gallery.map((block, index) => <img key={block.block_uuid || index} src={normalizeMediaUrl(block.data.url)} alt={block.data.caption || ''} className="w-full rounded-xl object-cover" />)}</div>}</article></main> }
