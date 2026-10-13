'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Award, BookOpen, Eye, EyeOff, FolderOpen, Grid3X3, GripVertical, Instagram, Pencil, Plus, UserPlus, Users, Youtube, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { dismissLegacyPortfolioImport, updateMyPortfolio, updateMyPortfolioSections, updateMyPortfolioTraits, getSocialPreviews } from '@services/portfolio/portfolio'
import { CategorizedMultiSelect, PORTFOLIO_STRENGTHS, PORTFOLIO_VALUES, type CategorizedOption } from '@components/Portfolio/CategorizedMultiSelect'
import { TimelineView, type TimelineEntry } from './Timeline'
import { FeaturedProjectCards } from './PortfolioProjects'
import { SidebarBadge } from './PortfolioBadges'
import { normalizeSocialInput, socialHandle } from './PortfolioHeaderParts'
import type { Project, Shell, PortfolioBadge, PortfolioSection, SetShell } from './portfolioTypes'

// The portfolio's front page: bio, featured badges, then the owner's sections in their chosen order.

export function AboutSection({ shell, setShell, owner, token }: { shell: Shell; setShell: SetShell; owner: boolean; token?: string }) {
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState(owner && searchParams.get('edit') === 'about')
  const [draft, setDraft] = useState(shell.portfolio.short_bio || '')
  const [saving, setSaving] = useState(false)
  const bio = shell.portfolio.short_bio || ''
  const start = () => { setDraft(bio); setEditing(true) }
  const save = async () => {
    if (!token) return
    setSaving(true)
    try {
      const next = await updateMyPortfolio({ revision: shell.portfolio.revision, short_bio: draft.trim() }, token)
      setShell(next); setEditing(false); toast.success('Bio updated')
    } catch (error: any) { toast.error(error?.message || 'Could not update your bio') }
    finally { setSaving(false) }
  }
  if (!owner && !bio) return null
  if (editing) return <section aria-label="Bio" className="flex flex-col gap-3">
    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} autoFocus aria-label="Bio" placeholder="Tell people a little about yourself, in your own voice…" className="w-full resize-y rounded-2xl border-2 border-border bg-card p-4 text-base leading-7 outline-none focus:border-[var(--org-primary-color)]" />
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button><Button type="button" variant="brand" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save bio'}</Button></div>
  </section>
  return <section aria-label="Bio" className="group/bio relative">
    {bio ? <p className="max-w-3xl whitespace-pre-line text-lg leading-8 text-foreground/90">{bio}</p>
      : <button type="button" onClick={start} className="w-full rounded-2xl border-2 border-dashed border-border px-5 py-6 text-left text-base text-muted-foreground transition hover:border-[var(--org-primary-color)] hover:text-foreground">Write a short bio: who you are, what you’re working toward, what you care about.</button>}
    {owner && bio ? <button type="button" onClick={start} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground transition hover:bg-raised hover:text-foreground" aria-label="Edit bio"><Pencil className="h-3.5 w-3.5" />Edit bio</button> : null}
  </section>
}

function TraitCard({ kind, initial, owner, onShellChange }: { kind: 'strength' | 'value'; initial: string[]; owner: boolean; onShellChange?: SetShell }) {
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
  return <><section><div className="flex items-center gap-2"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>{owner && <button type="button" onClick={openEditor} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Edit ${title.toLowerCase()}`}><Pencil className="h-3.5 w-3.5" /></button>}</div><div className="mt-4">{value.length ? <TraitChips labels={labels} /> : owner ? <button type="button" onClick={openEditor} className="text-sm text-muted-foreground transition hover:text-foreground">Choose the {title.toLowerCase()} you want to share.</button> : null}</div></section><Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0"><DialogHeader className="border-b border-border px-6 py-5"><DialogTitle>Edit {title.toLowerCase()}</DialogTitle><DialogDescription>{kind === 'value' ? 'Values are what matter most to you. They guide your decisions, influence your priorities, and help you choose the kind of life you want to build.' : 'Choose everything that feels true to you. You can change these as you grow.'}</DialogDescription></DialogHeader><div className="overflow-y-auto px-6 py-5"><CategorizedMultiSelect options={options} customOptions={draftCustomOptions} onCustomOptionsChange={setDraftCustomOptions} value={draft} onChange={setDraft} min={1} /></div><div className="flex justify-end gap-2 border-t border-border px-6 py-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving || !draft.length}>{saving ? 'Saving…' : 'Save'}</Button></div></DialogContent></Dialog></>
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
type SocialPreviewProfile = { name: string; handle: string; description?: string; imageUrl?: string; url: string; stats?: { posts?: string; followers?: string; following?: string } }

function cleanSocialProfileText(value: string) {
  let cleaned = value || ''
  for (let pass = 0; pass < 2; pass += 1) {
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  }
  return cleaned.trim()
}

function SocialPreviewCarousel({ type, url }: { type: 'instagram' | 'youtube'; url: string }) {
  const handle = socialHandle(type, url)
  const [items, setItems] = useState<SocialPreviewItem[]>([])
  const [profile, setProfile] = useState<SocialPreviewProfile | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    // A new handle starts a new preview request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getSocialPreviews(type, handle)
      .then((data) => { if (!cancelled) { setItems(Array.isArray(data.items) ? data.items.slice(0, 6) : []); setProfile(data.profile && typeof data.profile === 'object' ? data.profile : null) } })
      .catch(() => { if (!cancelled) { setItems([]); setProfile(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [handle, type])
  const Icon = type === 'instagram' ? Instagram : Youtube
  const label = type === 'instagram' ? 'Instagram' : 'YouTube'
  const profileHref = profile?.url || normalizeSocialInput(type, handle)
  const decodedName = cleanSocialProfileText(profile?.name || `@${handle}`)
  const profileName = type === 'instagram' ? decodedName.replace(/\s*\(@[^)]+\).*$/, '').replace(/\s*•\s*Instagram.*$/i, '').split('|')[0].trim() : decodedName
  const decodedDescription = cleanSocialProfileText(profile?.description || '')
  const cachedStats = /^([\d,.KMB]+) Followers,\s*([\d,.KMB]+) Following,\s*([\d,.KMB]+) Posts/i.exec(decodedDescription)
  const profileStats = profile?.stats || (cachedStats ? { followers: cachedStats[1], following: cachedStats[2], posts: cachedStats[3] } : undefined)
  const profileDescription = type === 'instagram' ? decodedDescription.replace(/^[\d,.KMB]+ Followers,\s*[\d,.KMB]+ Following,\s*[\d,.KMB]+ Posts\s*-\s*/i, '').replace(/^See Instagram photos and videos from\s+/i, '').replace(/\s*\(@[^)]+\)\s*$/, '').replace(new RegExp(`^${profileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*`, 'i'), '').trim() : decodedDescription
  return <section><div className="mb-5 flex items-end justify-between gap-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{label}</h2></div><a href={profileHref} target="_blank" rel="noreferrer" className="text-sm font-semibold transition hover:text-foreground">View profile</a></div>{loading ? <div className="flex gap-3 overflow-hidden">{Array.from({ length: 3 }).map((_, index) => <div key={index} className={`${type === 'instagram' ? 'aspect-[9/16] w-40' : 'aspect-video w-64'} shrink-0 animate-pulse rounded-xl bg-muted`} />)}</div> : items.length ? <div className="flex snap-x gap-3 overflow-x-auto pb-3">{items.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className={`${type === 'instagram' ? 'aspect-[9/16] w-40 sm:w-48' : 'aspect-video w-64 sm:w-72'} group relative shrink-0 snap-start overflow-hidden rounded-xl bg-muted`}>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.title || ''} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : null}{type === 'youtube' && <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white"><Youtube className="h-5 w-5" /></span></span>}</a>)}</div> : <a href={profileHref} target="_blank" rel="noreferrer" className="group flex max-w-2xl items-center gap-4 rounded-xl bg-muted/55 p-3 transition hover:bg-muted"><span className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-background">{profile?.imageUrl ? <img src={profile.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center"><Icon className="h-6 w-6 text-muted-foreground" /></span>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{profileName}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">@{profile?.handle || handle}</span>{profileDescription && <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">{profileDescription}</span>}{profileStats && <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">{profileStats.posts && <span className="flex items-center gap-1.5"><Grid3X3 className="h-3 w-3" />{profileStats.posts} posts</span>}{profileStats.followers && <span className="flex items-center gap-1.5"><Users className="h-3 w-3" />{profileStats.followers} followers</span>}{profileStats.following && <span className="flex items-center gap-1.5"><UserPlus className="h-3 w-3" />{profileStats.following} following</span>}</span>}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" /></a>}</section>
}

export default function Overview({ shell, setShell, owner, orgslug, username, importLegacy, busy, token }: any) {
  const searchParams = useSearchParams()
  const featured = shell.projects.filter((project: Project) => project.featured)
  const featuredTimeline = (shell.timeline || []).filter((entry: TimelineEntry) => entry.featured)
  const [sections, setSections] = useState<PortfolioSection[]>(() => (shell.sections || []).filter((section: PortfolioSection) => section.section_type !== 'identity_hero'))
  const editTarget = searchParams.get('edit')
  const enablingTraitsRef = useRef(false)
  const dismissLegacyImport = async () => {
    if (!token) return
    try { setShell(await dismissLegacyPortfolioImport(token)); toast.success('Legacy import skipped') }
    catch (error: any) { toast.error(error?.message || 'Could not skip the legacy import') }
  }
  const saveSections = async (nextSections: PortfolioSection[]) => {
    if (!token) return
    const omitted = (shell.sections || []).filter((section: PortfolioSection) => section.section_type === 'identity_hero')
    try {
      const next = await updateMyPortfolioSections({ revision: shell.portfolio.revision, sections: [...omitted, ...nextSections].map((section) => ({ section_uuid: section.section_uuid, enabled: section.enabled })) }, token)
      setShell(next); setSections((next.sections || []).filter((section: PortfolioSection) => section.section_type !== 'identity_hero'))
    } catch (error: any) { setSections((shell.sections || []).filter((section: PortfolioSection) => section.section_type !== 'identity_hero')); toast.error(error?.message || 'Could not update sections') }
  }
  useEffect(() => {
    if (!owner || (editTarget !== 'strengths' && editTarget !== 'values') || !token || enablingTraitsRef.current) return
    const traits = sections.find((section) => section.section_type === 'traits')
    if (!traits || traits.enabled) return
    enablingTraitsRef.current = true
    const next = sections.map((section) => section.section_uuid === traits.section_uuid ? { ...section, enabled: true } : section)
    // Opening the strengths editor from a link turns the section on once; the save is the external effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void saveSections(next)
  }, [editTarget, token, sections]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasContent = (type: string) => type === 'about' ? Boolean(shell.portfolio.short_bio)
    : type === 'featured_badges' ? (shell.badges?.featured || []).length > 0
    : type === 'traits' ? (shell.traits?.strength || []).length > 0 || (shell.traits?.value || []).length > 0
    : type === 'current_timeline' ? (owner ? (shell.timeline || []).length > 0 : featuredTimeline.length > 0)
    : type === 'featured_projects' ? shell.projects.length > 0
    : type === 'instagram' || type === 'youtube' ? (shell.portfolio.socials || []).some((social: { type: string; url: string }) => social.type === type && social.url)
    : false
  const renderSection = (type: string) => type === 'about' ? <AboutSection shell={shell} setShell={setShell} owner={owner} token={token} />
    : type === 'featured_badges' ? <section aria-label="Featured badges"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold tracking-tight">Badges</h2><Link href={getUriWithOrg(orgslug, owner ? routePaths.org.portfolioBadges() : `/user/${username}/badges`)} className="text-sm font-bold text-muted-foreground transition hover:text-foreground">See all</Link></div><div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">{shell.badges.featured.map((badge: PortfolioBadge) => <SidebarBadge key={badge.badge_uuid} badge={badge} orgslug={orgslug} />)}</div></section>
    : type === 'traits' ? <div className="grid gap-9"><TraitCard kind="strength" initial={shell.traits?.strength || []} owner={owner} onShellChange={setShell} /><TraitCard kind="value" initial={shell.traits?.value || []} owner={owner} onShellChange={setShell} /></div>
    : type === 'current_timeline' ? <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Timeline</h2><button className="text-sm font-semibold" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, owner ? '/portfolio/timeline' : `/user/${username}/timeline`)); window.dispatchEvent(new PopStateEvent('popstate')) }}>View all</button></div>{featuredTimeline.length ? <TimelineView entries={featuredTimeline} owner={owner} orgslug={orgslug} username={username} variant="overview" /> : owner ? <button type="button" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, '/portfolio/timeline')); window.dispatchEvent(new PopStateEvent('popstate')) }} className="w-full rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm font-semibold text-muted-foreground transition hover:border-foreground hover:text-foreground">Star Timeline experiences to feature them here.</button> : null}</section>
    : type === 'featured_projects' ? <section><div className="mb-5 flex items-end justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Featured project{featured.length > 1 ? 's' : ''}</h2><button className="text-sm font-semibold transition-colors hover:text-foreground" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, owner ? '/portfolio/projects' : `/user/${username}/projects`)); window.dispatchEvent(new PopStateEvent('popstate')) }}>View all</button></div>{featured.length ? <FeaturedProjectCards project={featured} owner={owner} orgslug={orgslug} username={username} /> : owner ? <button type="button" onClick={() => { window.history.pushState({}, '', getUriWithOrg(orgslug, '/portfolio/projects')); window.dispatchEvent(new PopStateEvent('popstate')) }} className="w-full rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm font-semibold text-muted-foreground transition hover:border-foreground hover:text-foreground">Star one of your projects to feature it here.</button> : null}</section>
    : type === 'instagram' || type === 'youtube' ? (() => { const social = (shell.portfolio.socials || []).find((item: { type: string; url: string }) => item.type === type && item.url); return social ? <SocialPreviewCarousel type={type} url={social.url} /> : null })() : null
  const actionConfig: Record<string, { title: string; prompt: string; href: string; icon: React.ComponentType<{ className?: string }> }> = {
    about: { title: 'About', prompt: 'Introduce yourself', href: '/portfolio?edit=about', icon: BookOpen },
    featured_badges: { title: 'Badges', prompt: 'Find one you’d like to start', href: routePaths.org.discover(), icon: Award },
    traits: { title: 'Strengths & values', prompt: 'Highlight what makes you, you', href: '/portfolio?edit=strengths', icon: Zap },
    current_timeline: { title: 'Timeline', prompt: 'Add an experience', href: '/portfolio/timeline?experience=work_career', icon: BookOpen },
    featured_projects: { title: 'Projects', prompt: 'Showcase your project', href: '/portfolio/projects/new', icon: FolderOpen },
    instagram: { title: 'Instagram', prompt: 'Connect your Instagram', href: '/portfolio?edit=profile', icon: Instagram },
    youtube: { title: 'YouTube', prompt: 'Connect your YouTube channel', href: '/portfolio?edit=profile', icon: Youtube },
  }
  const editingTraits = editTarget === 'strengths' || editTarget === 'values'
  const sidebarSectionTypes = ['traits', 'featured_badges', 'about']
  const completedSections = sections.filter((section) => !sidebarSectionTypes.includes(section.section_type) && (hasContent(section.section_type) || (owner && section.section_type === 'about')))
  const traitsSection = sections.find((section) => section.section_type === 'traits')
  const badgesSection = sections.find((section) => section.section_type === 'featured_badges')
  const showTraits = Boolean(traitsSection && (hasContent('traits') || editingTraits))
  const showBadges = Boolean(badgesSection && hasContent('featured_badges'))
  const showSidebar = showTraits
  const emptySections = owner ? sections.filter((section) => !hasContent(section.section_type) && section.section_type !== 'about' && !(editingTraits && section.section_type === 'traits') && actionConfig[section.section_type]) : []
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
    <AboutSection shell={shell} setShell={setShell} owner={owner} token={token} />
    {showBadges ? <div className={badgesSection?.enabled ? '' : 'opacity-40 grayscale'}>{renderSection('featured_badges')}</div> : null}
    <div className={`grid items-start gap-14 ${showSidebar ? 'lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-16' : ''}`}>
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
    {showSidebar && <aside aria-label="Portfolio highlights" className="grid gap-10 border-t border-border/70 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:pl-10">
      {showTraits && <div className={traitsSection?.enabled ? '' : 'opacity-40 grayscale'}>{renderSection('traits')}</div>}
    </aside>}
    </div>
    {emptySections.length > 0 && <section className="max-w-xl space-y-2"><div className="mb-4"><h2 className="text-xl font-extrabold tracking-tight">Keep building</h2><p className="mt-1 text-sm text-muted-foreground">Choose what you want to add next.</p></div>{emptySections.map((section) => { const action = actionConfig[section.section_type]; const Icon = action.icon; return <Link key={section.section_uuid} href={getUriWithOrg(orgslug, action.href)} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{action.title}</span><span className="block truncate text-xs text-muted-foreground">{action.prompt}</span></span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] transition group-hover:scale-105"><Plus className="h-4 w-4" /></span></Link>})}</section>}
    {owner && shell.portfolio.has_legacy_portfolio && <section className="rounded-2xl border border-dashed border-border p-6"><h2 className="font-bold">Have an older Launch LMS portfolio?</h2><p className="mt-1 text-sm text-muted-foreground">Import its project and timeline experiences into the new builder. Your original profile data stays untouched.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={importLegacy}>{busy ? 'Importing…' : 'Import legacy project'}</Button><Button variant="ghost" disabled={busy} onClick={dismissLegacyImport}>Skip import</Button></div></section>}
  </div>
}
