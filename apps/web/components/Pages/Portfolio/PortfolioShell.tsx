'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Award, Briefcase, Camera, Copy, Eye, FilePlus2, Globe, Globe2, GraduationCap, Heart, Instagram, Linkedin, MapPin, Pencil, Plus, Printer, Sparkles, Star, Trash2, Youtube, X, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { applyMediaAssetToUserAvatar, type MediaAsset } from '@services/media/library'
import { getUserAvatarMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { createPortfolioWork, importLegacyPortfolio, publishMyPortfolio, updateMyPortfolio, updateMyPortfolioFeaturedBadges, updateMyPortfolioTraits, updatePortfolioWork } from '@services/portfolio/portfolio'
import { CategorizedMultiSelect, PORTFOLIO_STRENGTHS, PORTFOLIO_VALUES, type CategorizedOption } from '@components/Portfolio/CategorizedMultiSelect'
import { JourneyTimeline, type JourneyEntry } from './Journey'
import nextStepIllustration from '../../../public/images/portfolio/next-step-illustration.png'
import { resolveLearningActivityImage } from '@services/learning/launchReadyImages'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'

export type Work = { work_uuid: string; slug: string; title: string; subtitle: string; summary: string; story_kind: string; status: string; featured: boolean; revision: number; start_date?: string; end_date?: string; cover_url?: string; cover_asset_uuid?: string; blocks: Array<{ block_uuid?: string; block_type: string; data: Record<string, any> }> }
type PortfolioBadge = { badge_uuid: string; name: string; description?: string; thumbnail_image?: string; status: 'earned' | 'in_progress'; progress?: { completed: number; total: number; percent: number } }
type Shell = { portfolio: Record<string, any>; work: Work[]; journey: JourneyEntry[]; traits?: { strength?: string[]; value?: string[] }; badges?: { earned: PortfolioBadge[]; inProgress: PortfolioBadge[]; featured: PortfolioBadge[]; featuredBadgeUuids: string[] }; views: Array<{ key: string; visible: boolean; itemCount: number }>; readiness: { canPublish: boolean; blockers: string[] }; capabilities?: Record<string, { unlocked: boolean; reason: string; requiredActivity?: string }>; launchReady?: { completed: number; total: number }; nextAction?: { label: string; supportingText?: string; estimatedMinutes?: number; thumbnailImage?: string; href: string; progress?: { completed: number; total: number } } | null }

type PortfolioView = 'overview' | 'journey' | 'work' | 'badges' | 'resume'

function tabs(orgslug: string, username: string | undefined, owner: boolean, shell: Shell) {
  const base = owner ? '/portfolio' : `/user/${username}`
  return [{ label: 'Overview', view: 'overview', href: base, visible: true }, { label: 'Journey', view: 'journey', href: `${base}/journey`, visible: shell.views.some((view) => view.key === 'journey' && view.visible) }, { label: 'Work', view: 'work', href: `${base}/work`, visible: shell.views.some((view) => view.key === 'work' && view.visible) }, { label: 'Badges', view: 'badges', href: `${base}/badges`, visible: shell.views.some((view) => view.key === 'badges' && view.visible) }, { label: 'Resume', view: 'resume', href: `${base}/resume`, visible: shell.views.some((view) => view.key === 'resume' && view.visible) }]
    .filter((tab) => tab.visible).map((tab) => ({ ...tab, href: getUriWithOrg(orgslug, tab.href) }))
}

export function PortfolioShell({ initialShell, orgslug, username, owner = false, active = 'overview', preview = false }: { initialShell: Shell; orgslug: string; username?: string; owner?: boolean; active?: PortfolioView; preview?: boolean }) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [activeView, setActiveView] = useState<PortfolioView>(active)
  const [scrolled, setScrolled] = useState(false)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [draftSocials, setDraftSocials] = useState<Array<{ type: string; url: string }>>(() => shellSocials(initialShell))
  const [busy, setBusy] = useState(false)
  const shellColumnRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const compactThresholdRef = useRef(180)
  const [fixedHeaderStyle, setFixedHeaderStyle] = useState<CSSProperties>({})
  const displayName = shell.portfolio.display_name || username || 'Your portfolio'
  const nav = useMemo(() => tabs(orgslug, username, owner, shell), [orgslug, username, owner, shell])
  const compact = activeView !== 'overview' || scrolled
  const avatarUrl = shell.portfolio.avatar_image
    ? getUserAvatarMediaDirectory(shell.portfolio.user_uuid, shell.portfolio.avatar_image)
    : ''

  useEffect(() => {
    if (activeView === 'overview' && !scrolled && headerRef.current) compactThresholdRef.current = Math.max(120, headerRef.current.offsetHeight)
    const syncFixedHeader = () => {
      if (activeView !== 'overview' || !scrolled || !shellColumnRef.current) {
        setFixedHeaderStyle({})
        return
      }
      const rect = shellColumnRef.current.getBoundingClientRect()
      setFixedHeaderStyle({ left: rect.left, width: rect.width })
    }
    const handleScroll = () => {
      if (activeView !== 'overview') return
      setScrolled((current) => current ? window.scrollY > 16 : window.scrollY > compactThresholdRef.current)
      syncFixedHeader()
    }
    const handleResize = () => {
      if (!scrolled && headerRef.current) compactThresholdRef.current = Math.max(120, headerRef.current.offsetHeight)
      syncFixedHeader()
    }
    const handlePopState = () => setActiveView(window.location.pathname.endsWith('/resume') ? 'resume' : window.location.pathname.endsWith('/badges') ? 'badges' : window.location.pathname.endsWith('/work') ? 'work' : window.location.pathname.endsWith('/journey') ? 'journey' : 'overview')
    handleScroll()
    syncFixedHeader()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [activeView, scrolled])

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

  async function importLegacy() {
    if (!token) return
    setBusy(true)
    try { const result = await importLegacyPortfolio(token); setShell(result.shell); toast.success(`${result.imported} legacy item${result.imported === 1 ? '' : 's'} imported`) }
    catch { toast.error('Could not import the legacy portfolio') } finally { setBusy(false) }
  }

  async function saveAvatar(asset: MediaAsset) {
    if (!token) return
    const user = await applyMediaAssetToUserAvatar(asset.asset_uuid, token)
    setShell((current) => ({ ...current, portfolio: { ...current.portfolio, avatar_image: user.avatar_image || asset.url } }))
    setAvatarPickerOpen(false)
    toast.success('Profile image updated')
  }

  return <main className="min-h-screen bg-background pb-20 text-foreground">
    {preview && <div className="border-b border-border px-4 py-3"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4"><span className="text-sm font-medium">Public preview</span><Button asChild variant="outline" size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio')}><ArrowLeft className="mr-2 h-4 w-4" />Back to editing</Link></Button></div></div>}
    <div ref={shellColumnRef} className="mx-auto max-w-5xl px-5 sm:px-8">
    <div style={activeView === 'overview' && scrolled ? { height: compactThresholdRef.current } : undefined}>
    <motion.header ref={headerRef} style={activeView === 'overview' && scrolled ? fixedHeaderStyle : undefined} className={`${activeView === 'overview' ? (scrolled ? 'fixed top-0 box-border px-5 sm:px-8' : 'relative') : 'sticky top-0'} z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 backdrop-blur-xl ${compact ? 'shadow-[0_1px_0_hsl(var(--border)/.25)]' : ''}`} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}>
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
                  {owner && !preview && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start"><Button variant="outline" onClick={() => setEditingIdentity(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button><Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, '/portfolio/preview')}><Eye className="mr-2 h-4 w-4" />Preview</Link></Button>{!shell.portfolio.published_at && shell.capabilities?.launch?.unlocked && <Button onClick={publish} disabled={busy}><Globe2 className="mr-2 h-4 w-4" />Publish</Button>}</motion.div>}
                </motion.div>}
              </AnimatePresence>
            </motion.div>
          </motion.div>
          {owner && !preview && compact && activeView === 'work' && shell.capabilities?.work?.unlocked && <Button asChild size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio/work/new')}><Plus className="mr-1.5 h-4 w-4" />Add work</Link></Button>}
          {owner && !preview && compact && activeView === 'journey' && shell.capabilities?.journey?.unlocked && <Button asChild size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio/journey/new')}><Plus className="mr-1.5 h-4 w-4" />Add chapter</Link></Button>}
        </motion.div>
      </motion.div>
      {nav.length > 1 && <nav className="flex gap-7 overflow-x-auto" aria-label="Portfolio views">{nav.map((tab) => { const view = tab.view as PortfolioView; const selected = activeView === view; return <button type="button" key={tab.label} onClick={() => changeView(view, tab.href)} className={`relative py-3 text-sm font-semibold transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{tab.label}{selected && <motion.span layoutId="portfolio-active-tab" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}</button>})}</nav>}
    </motion.header>
    </div>

    <div className="py-8 sm:py-12">
      <AnimatePresence mode="wait" initial={false}>{activeView === 'overview' ? <motion.div key="overview"><Overview shell={shell} owner={owner && !preview} orgslug={orgslug} username={username} importLegacy={importLegacy} busy={busy} /></motion.div> : activeView === 'journey' ? <motion.div key="journey"><JourneyTimeline entries={shell.journey || []} owner={owner && !preview} orgslug={orgslug} username={username} /></motion.div> : activeView === 'badges' ? <motion.div key="badges"><BadgesView shell={shell} setShell={setShell} owner={owner && !preview} orgslug={orgslug} token={token} /></motion.div> : activeView === 'resume' ? <motion.div key="resume"><ResumeView shell={shell} orgslug={orgslug} username={username} owner={owner && !preview} /></motion.div> : <motion.div key="work"><WorkGrid shell={shell} owner={owner && !preview} orgslug={orgslug} username={username} /></motion.div>}</AnimatePresence>
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

function TraitCard({ kind, initial, owner }: { kind: 'strength' | 'value'; initial: string[]; owner: boolean }) {
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
  const Icon = kind === 'strength' ? Zap : Heart
  const title = kind === 'strength' ? 'Strengths' : 'Values'
  if (!owner && !value.length) return null
  const save = async () => {
    if (!token) return
    setSaving(true)
    try { await updateMyPortfolioTraits({ trait_type: kind, labels: draft.map((id) => options.find((option) => option.id === id)?.text || draftCustomOptions.find((option) => option.id === id)?.text || id) }, token); setValue(draft); setCustomOptions(draftCustomOptions); setOpen(false); toast.success(`${title} updated`) }
    catch (error: any) { toast.error(error?.message || `Could not update ${title.toLowerCase()}`) }
    finally { setSaving(false) }
  }
  return <><button type="button" disabled={!owner} onClick={() => { setDraft(value); setDraftCustomOptions(customOptions); setOpen(true) }} className="min-h-40 rounded-2xl border border-border p-5 text-left disabled:cursor-default"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5" />{title}</span>{owner && <Pencil className="h-4 w-4 text-muted-foreground" />}</div><div className="mt-5 flex flex-wrap gap-2">{value.length ? value.map((id) => <span key={id} className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-semibold">{options.find((option) => option.id === id)?.text || customOptions.find((option) => option.id === id)?.text || id}</span>) : <span className="text-sm text-muted-foreground">Choose the {title.toLowerCase()} you want to share.</span>}</div></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0"><DialogHeader className="border-b border-border px-6 py-5"><DialogTitle>Edit {title.toLowerCase()}</DialogTitle><DialogDescription>Choose up to five. You can change these as you grow.</DialogDescription></DialogHeader><div className="overflow-y-auto px-6 py-5"><CategorizedMultiSelect options={options} customOptions={draftCustomOptions} onCustomOptionsChange={setDraftCustomOptions} value={draft} onChange={setDraft} min={1} max={5} /></div><div className="flex justify-end gap-2 border-t border-border px-6 py-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving || !draft.length}>{saving ? 'Saving…' : 'Save'}</Button></div></DialogContent></Dialog></>
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

function Overview({ shell, owner, orgslug, username, importLegacy, busy }: any) {
  const featured = shell.work.filter((work: Work) => work.featured || shell.work.length <= 3).slice(0, 3)
  return <div className="space-y-14">
    {shell.nextAction && owner && <NextStepCard action={shell.nextAction} orgslug={orgslug} />}
    {shell.portfolio.short_bio && <section><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">About</h2><p className="mt-4 max-w-3xl text-xl leading-relaxed">{shell.portfolio.short_bio}</p></section>}
    {(shell.badges?.featured || []).length > 0 && <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Badges</h2><Link href={getUriWithOrg(orgslug, owner ? '/portfolio/badges' : `/user/${username}/badges`)} className="text-sm font-semibold">View all</Link></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{shell.badges.featured.map((badge: PortfolioBadge) => <BadgeCard key={badge.badge_uuid} badge={badge} compact orgslug={orgslug} />)}</div></section>}
    {((shell.traits?.strength || []).length > 0 || (shell.traits?.value || []).length > 0 || shell.capabilities?.traits?.unlocked) && <section><h2 className="mb-5 text-sm font-bold uppercase tracking-widest text-muted-foreground">What I bring</h2><div className="grid gap-4 sm:grid-cols-2"><TraitCard kind="strength" initial={shell.traits?.strength || []} owner={owner} /><TraitCard kind="value" initial={shell.traits?.value || []} owner={owner} /></div></section>}
    {(shell.journey || []).length > 0 && <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Current chapter</h2><button className="text-sm font-semibold" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, owner ? '/portfolio/journey' : `/user/${username}/journey`)); window.dispatchEvent(new PopStateEvent('popstate')) }}>View journey</button></div><JourneyTimeline entries={((shell.journey || []).filter((entry: JourneyEntry) => entry.is_current).slice(0, 1).length ? (shell.journey || []).filter((entry: JourneyEntry) => entry.is_current).slice(0, 1) : (shell.journey || []).slice(0, 1))} owner={owner} orgslug={orgslug} username={username} /></section>}
    {(featured.length > 0 || (owner && shell.capabilities?.work?.unlocked)) && <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Selected work</h2>{shell.work.length > 0 && <button className="text-sm font-semibold" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, owner ? '/portfolio/work' : `/user/${username}/work`)); window.dispatchEvent(new PopStateEvent('popstate')) }}>View all</button>}</div>{featured.length ? <WorkCards work={featured} owner={owner} orgslug={orgslug} username={username} /> : owner ? <EmptyWork orgslug={orgslug} /> : null}</section>}
    {owner && shell.portfolio.has_legacy_portfolio && <section className="rounded-2xl border border-dashed border-border p-6"><h2 className="font-bold">Have an older Launch LMS portfolio?</h2><p className="mt-1 text-sm text-muted-foreground">Import a copy into the new builder. Your original profile data stays untouched.</p><Button className="mt-4" variant="outline" disabled={busy} onClick={importLegacy}>Preview and import legacy work</Button></section>}
    <SocialPreviews socials={shell.portfolio.socials || []} />
  </div>
}

function BadgeCard({ badge, orgslug, compact = false, featured, onFeature }: { badge: PortfolioBadge; orgslug: string; compact?: boolean; featured?: boolean; onFeature?: () => void }) {
  const inProgress = badge.status === 'in_progress'
  const percent = Math.max(0, Math.min(100, badge.progress?.percent || 0))
  const content = <><div className={`mx-auto ${compact ? 'h-28 w-28' : 'h-32 w-32 sm:h-36 sm:w-36'} overflow-visible ${inProgress ? 'grayscale opacity-55' : ''}`}>{badge.thumbnail_image ? <BadgeThumbnailImage src={normalizeMediaUrl(badge.thumbnail_image)} alt="" hoverScale /> : <div className="flex h-full w-full items-center justify-center"><Award className="h-10 w-10 text-muted-foreground" /></div>}</div><div className="mt-2"><h3 className={`${compact ? 'text-sm' : 'text-sm sm:text-base'} font-bold leading-tight`}>{badge.name}</h3><div className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground"><span>{inProgress ? 'In progress' : 'Earned'}</span>{inProgress && <span>{percent}%</span>}</div>{inProgress && <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted" aria-label={`${percent}% complete`}><div className="h-full rounded-full bg-foreground/50 transition-[width]" style={{ width: `${percent}%` }} /></div>}</div></>
  return <div className="group relative rounded-xl transition hover:bg-muted/60"><Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}`)} className="block p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{content}</Link>{onFeature && <button type="button" onClick={onFeature} aria-label={featured ? `Remove ${badge.name} from featured badges` : `Feature ${badge.name}`} className={`absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-sm transition hover:scale-105 ${featured ? 'text-amber-500 opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100'}`}><Star className="h-5 w-5" fill={featured ? 'currentColor' : 'none'} /></button>}</div>
}

function InProgressBadgeCard({ badge, orgslug }: { badge: PortfolioBadge; orgslug: string }) {
  const percent = Math.max(0, Math.min(100, badge.progress?.percent || 0))
  return <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}`)} className="group flex w-[280px] shrink-0 items-center gap-4 rounded-lg border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"><div className="h-16 w-16 shrink-0 overflow-visible grayscale opacity-60">{badge.thumbnail_image ? <BadgeThumbnailImage src={normalizeMediaUrl(badge.thumbnail_image)} alt="" hoverScale /> : <div className="flex h-full items-center justify-center"><Award className="h-7 w-7 text-muted-foreground" /></div>}</div><div className="min-w-0 flex-1"><div className="line-clamp-2 text-sm font-bold leading-tight">{badge.name}</div><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${percent}%` }} /></div><span className="text-xs font-bold tabular-nums text-muted-foreground">{percent}%</span></div></div></Link>
}

function BadgesView({ shell, setShell, owner, orgslug, token }: { shell: Shell; setShell: (shell: Shell) => void; owner: boolean; orgslug: string; token?: string }) {
  const earned = shell.badges?.earned || []
  const inProgress = shell.badges?.inProgress || []
  const [selected, setSelected] = useState<string[]>(shell.badges?.featuredBadgeUuids || [])
  const [savingUuid, setSavingUuid] = useState<string | null>(null)
  const toggle = async (uuid: string) => {
    if (!token) return
    const nextSelected = selected.includes(uuid) ? selected.filter((item) => item !== uuid) : [...selected, uuid]
    setSelected(nextSelected); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioFeaturedBadges({ badge_uuids: nextSelected }, token); setShell(next) }
    catch (error: any) { setSelected(selected); toast.error(error?.message || 'Could not update featured badges') }
    finally { setSavingUuid(null) }
  }
  return <div className="space-y-12">
    {inProgress.length > 0 && <section><div className="mb-5 flex items-end justify-between"><div><h2 className="text-2xl font-black">In progress</h2><p className="mt-1 text-sm text-muted-foreground">Keep going on the badge paths you’ve started.</p></div>{owner && <Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, '/badges')}>Find more badges</Link></Button>}</div><div className="flex gap-4 overflow-x-auto pb-2">{inProgress.map((badge) => <InProgressBadgeCard key={badge.badge_uuid} badge={badge} orgslug={orgslug} />)}</div></section>}
    <section><div className="mb-5"><h2 className="text-2xl font-black">Earned badges</h2>{owner && <p className="mt-1 text-sm text-muted-foreground">Use the star on any badge to feature it on your overview. The first five featured badges are shown there.</p>}</div>{earned.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{earned.map((badge) => <div key={badge.badge_uuid} className={savingUuid === badge.badge_uuid ? 'pointer-events-none opacity-70' : ''}><BadgeCard badge={badge} orgslug={orgslug} featured={selected.includes(badge.badge_uuid)} onFeature={owner ? () => toggle(badge.badge_uuid) : undefined} /></div>)}</div> : <div className="rounded-2xl border border-dashed border-border py-14 text-center"><Award className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Earned badges will appear here.</p></div>}</section>
  </div>
}

function NextStepCard({ action, orgslug }: { action: NonNullable<Shell['nextAction']>; orgslug: string }) {
  const progress = action.progress
  const percent = progress ? Math.round((progress.completed / Math.max(1, progress.total)) * 100) : 0
  return <section className="relative overflow-hidden rounded-2xl border border-dashed border-primary/70 bg-primary/[0.035] p-6 sm:p-8">
    <div className="relative z-10 max-w-2xl sm:pr-48">
      <p className="text-sm font-semibold text-primary">Keep going{action.estimatedMinutes ? ` · about ${action.estimatedMinutes} min` : ''}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight">{action.label}</h2>
      {action.supportingText && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{action.supportingText}</p>}
      {progress && <div className="mt-5 max-w-sm"><div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground"><span>Launch Ready</span><span>{progress.completed} of {progress.total}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></div></div>}
      <Button asChild className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90"><Link href={getUriWithOrg(orgslug, action.href)}><Sparkles className="mr-2 h-4 w-4" />{action.progress?.completed ? 'Continue' : 'Get started'}</Link></Button>
    </div>
    <img src={resolveLearningActivityImage(action.thumbnailImage) || nextStepIllustration.src} onError={(event) => { event.currentTarget.src = nextStepIllustration.src }} alt="" className="pointer-events-none absolute bottom-5 right-5 hidden h-36 w-48 rounded-xl object-cover opacity-95 sm:block" />
  </section>
}

function EmptyWork({ orgslug }: { orgslug: string }) { return <div className="border-y border-dashed border-border py-14 text-center"><FilePlus2 className="mx-auto h-9 w-9 text-muted-foreground" /><h3 className="mt-4 text-lg font-bold">Your work belongs here</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">A class project, performance, volunteer effort, hobby, or something you learned all count.</p><Button asChild className="mt-6"><Link href={getUriWithOrg(orgslug, '/portfolio/work/new')}><Plus className="mr-2 h-4 w-4" />Add something</Link></Button></div> }

function WorkGrid({ shell, owner, orgslug, username }: any) { return <section>{shell.work.length ? <WorkCards work={shell.work} owner={owner} orgslug={orgslug} username={username} /> : owner ? <EmptyWork orgslug={orgslug} /> : <p className="text-muted-foreground">No public work yet.</p>}</section> }

function ResumeView({ shell, orgslug, username, owner }: { shell: Shell; orgslug: string; username?: string; owner: boolean }) {
  const displayName = shell.portfolio.display_name || username || 'Your name'
  const publicHref = getUriWithOrg(orgslug, `/user/${username || shell.portfolio.username}`)
  const resumeHref = getUriWithOrg(orgslug, owner ? '/portfolio/resume' : `/user/${username}/resume`)
  const copyLink = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    await navigator.clipboard?.writeText(`${origin}${publicHref}`)
    toast.success('Portfolio link copied')
  }
  return <section className="resume-no-print">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Resume</h2>
        <p className="mt-1 text-sm text-muted-foreground">A print-friendly version of your portfolio for employers.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {owner && <Button type="button" variant="outline" onClick={copyLink}><Copy className="mr-2 h-4 w-4" />Copy portfolio link</Button>}
        <Button asChild variant="outline"><Link href={resumeHref}><Printer className="mr-2 h-4 w-4" />Print view</Link></Button>
      </div>
    </div>
    <article className="grid gap-6 rounded-lg border border-border bg-card p-6 shadow-sm sm:grid-cols-[260px_minmax(0,1fr)] sm:p-8">
      <aside className="space-y-6 border-border sm:border-r sm:pr-6">
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
        <ResumeSection title="Current Chapter">{shell.journey?.length ? shell.journey.slice(0, 4).map((entry) => <ResumeJourneyEntry key={entry.journey_uuid} entry={entry} />) : <p className="text-sm text-muted-foreground">Add Journey chapters to fill this section.</p>}</ResumeSection>
        <ResumeSection title="Selected Work">{shell.work?.length ? shell.work.slice(0, 5).map((work) => <div key={work.work_uuid} className="break-inside-avoid"><div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">{work.title}</h3></div>{work.subtitle && <p className="mt-1 text-sm font-medium text-muted-foreground">{work.subtitle}</p>}{work.summary && <p className="mt-1.5 leading-6 text-muted-foreground">{work.summary}</p>}</div>) : <p className="text-sm text-muted-foreground">Add Work items to fill this section.</p>}</ResumeSection>
      </div>
    </article>
  </section>
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid"><h2 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2><div className="mt-3 space-y-4">{children}</div></section>
}

function ResumeJourneyEntry({ entry }: { entry: JourneyEntry }) {
  return <div className="break-inside-avoid"><div className="flex items-center gap-2">{entry.entry_type === 'education' ? <GraduationCap className="h-4 w-4 text-muted-foreground" /> : <Briefcase className="h-4 w-4 text-muted-foreground" />}<h3 className="font-semibold">{entry.title}</h3></div>{entry.organization && <p className="mt-1 text-sm font-medium text-muted-foreground">{entry.organization}</p>}{entry.summary && <p className="mt-1.5 leading-6 text-muted-foreground">{entry.summary}</p>}</div>
}

export function WorkCardView({ item, href, preview = false }: { item: Work; href?: string; preview?: boolean }) { const card = <div className="group min-w-0"><div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">{item.cover_url ? <img src={normalizeMediaUrl(item.cover_url)} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-muted-foreground">{item.title || 'Your work'}</div>}</div><h3 className="mt-3 line-clamp-2 text-sm font-bold leading-snug sm:text-base">{item.title || 'Your work'}</h3>{item.subtitle && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground sm:text-sm">{item.subtitle}</p>}{item.summary && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>}{preview && <span className="sr-only">Preview of your Work card</span>}</div>; return href ? <Link href={href}>{card}</Link> : card }

function WorkCards({ work, owner, orgslug, username }: { work: Work[]; owner: boolean; orgslug: string; username?: string }) { return <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 lg:grid-cols-3">{work.map((item) => <WorkCardView key={item.work_uuid} item={item} href={getUriWithOrg(orgslug, owner ? `/portfolio/work/${item.work_uuid}` : `/user/${username}/work/${item.slug}`)} />)}</div> }

export function WorkEditor({ initialWork, orgslug }: { initialWork?: Work; orgslug: string }) {
  const router = useRouter(); const session = useLHSession() as any; const token = session?.data?.tokens?.access_token; const userId = Number(session?.data?.user?.id || 0); const [busy, setBusy] = useState(false); const [pickerOpen, setPickerOpen] = useState(false)
  const initialImages = (initialWork?.blocks || []).filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: block.data.asset_uuid, url: block.data.url, title: block.data.caption || '', owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
  const [images, setImages] = useState<MediaAsset[]>(initialImages)
  const [coverUuid, setCoverUuid] = useState<string | undefined>(initialWork?.cover_asset_uuid || initialImages[0]?.asset_uuid)
  function addImage(asset: MediaAsset) { setImages((current) => current.some((item) => item.asset_uuid === asset.asset_uuid) ? current : [...current, asset]); setCoverUuid((current) => current || asset.asset_uuid); setPickerOpen(false) }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!token) return; const form = new FormData(event.currentTarget); setBusy(true); try { const body: any = { title: form.get('title'), subtitle: form.get('tagline'), start_date: form.get('start_date') || null, end_date: form.get('end_date') || null, cover_asset_uuid: coverUuid || null, blocks: [{ block_type: 'text', data: { text: form.get('story') } }, ...images.map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } }))] }; const saved = initialWork ? await updatePortfolioWork(initialWork.work_uuid, { ...body, revision: initialWork.revision }, token) : await createPortfolioWork({ ...body, idempotency_key: crypto.randomUUID() }, token); router.push(getUriWithOrg(orgslug, `/portfolio/work/${saved.work_uuid}`)); router.refresh() } catch (error: any) { toast.error(error?.message || 'Could not save work') } finally { setBusy(false) } }
  return <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6"><ContentPageHeader orgslug={orgslug} backLabel="Work" noHorizontalBleed /><form onSubmit={submit} className="grid gap-7"><h1 className="text-3xl font-black sm:text-4xl">{initialWork ? 'Edit work' : 'Add work'}</h1><label className="grid gap-2 font-semibold">Title<input required name="title" defaultValue={initialWork?.title} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 font-semibold">Tagline<input name="tagline" defaultValue={initialWork?.subtitle} placeholder="A short line about this work" className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><div className="grid grid-cols-2 gap-4"><label className="grid gap-2 font-semibold">Start date<input type="date" name="start_date" defaultValue={initialWork?.start_date || ''} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 font-semibold">End date<input type="date" name="end_date" defaultValue={initialWork?.end_date || ''} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label></div><label className="grid gap-2 font-semibold">Story<textarea name="story" defaultValue={initialWork?.blocks?.find((block) => block.block_type === 'text')?.data?.text || ''} rows={10} className="rounded-md border border-input bg-background p-3 font-normal" /></label><section><div className="flex items-center justify-between"><div><h2 className="font-semibold">Images</h2><p className="text-sm text-muted-foreground">Choose one image as the cover.</p></div><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4" />Add image</Button></div>{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.asset_uuid} className={`group relative overflow-hidden rounded-xl border-2 ${coverUuid === image.asset_uuid ? 'border-foreground' : 'border-transparent'}`}><button type="button" onClick={() => setCoverUuid(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{coverUuid === image.asset_uuid ? 'Cover' : 'Make cover'}</span></button><button type="button" aria-label="Remove image" onClick={() => { setImages((current) => current.filter((item) => item.asset_uuid !== image.asset_uuid)); if (coverUuid === image.asset_uuid) setCoverUuid(images.find((item) => item.asset_uuid !== image.asset_uuid)?.asset_uuid) }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><Trash2 className="h-4 w-4" /></button></div>)}</div>}</section><Button size="lg" disabled={busy}>{busy ? 'Publishing…' : initialWork ? 'Save changes' : 'Publish work'}</Button></form><MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Add a work image" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={addImage} /></main>
}

function formatWorkDate(start?: string, end?: string) { if (!start && !end) return ''; const format = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)); if (start && end) return `${format(start)} – ${format(end)}`; return start ? format(start) : `Through ${format(end!)}` }
export function WorkDetail({ work, portfolio, orgslug, owner, username }: { work: Work; portfolio: any; orgslug: string; owner: boolean; username?: string }) { const gallery = work.blocks.filter((block) => block.block_type === 'image' && block.data.asset_uuid !== work.cover_asset_uuid); const story = work.blocks.find((block) => block.block_type === 'text'); return <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6"><ContentPageHeader orgslug={orgslug} backLabel="Work" noHorizontalBleed />{owner && <div className="mb-4 flex justify-end"><Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, `/portfolio/work/${work.work_uuid}/edit`)}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button></div>}<article>{work.cover_url && <div className="aspect-[16/9] overflow-hidden rounded-xl bg-muted"><img src={normalizeMediaUrl(work.cover_url)} alt="" className="h-full w-full object-cover" /></div>}<h1 className="mt-7 text-3xl font-black sm:text-5xl">{work.title}</h1>{work.subtitle && <p className="mt-2 text-lg text-muted-foreground">{work.subtitle}</p>}{formatWorkDate(work.start_date, work.end_date) && <p className="mt-2 text-sm text-muted-foreground">{formatWorkDate(work.start_date, work.end_date)}</p>}{story?.data?.text && <div className="prose prose-lg mt-8 max-w-3xl whitespace-pre-wrap dark:prose-invert">{story.data.text}</div>}{gallery.length > 0 && <div className="mt-10 grid gap-3 sm:grid-cols-2">{gallery.map((block, index) => <img key={block.block_uuid || index} src={normalizeMediaUrl(block.data.url)} alt={block.data.caption || ''} className="w-full rounded-xl object-cover" />)}</div>}</article></main> }
