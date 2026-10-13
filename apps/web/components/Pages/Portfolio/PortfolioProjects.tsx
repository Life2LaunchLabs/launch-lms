'use client'

import { EmptyProject } from './PortfolioChecklist'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { FolderOpen, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { getUriWithOrg } from '@services/config/config'
import { type MediaAsset } from '@services/media/library'
import { normalizeMediaUrl } from '@services/media/media'
import { createPortfolioProject, updateMyPortfolioFeaturedProject, updatePortfolioProject } from '@services/portfolio/portfolio'
import type { Project } from './portfolioTypes'

// Projects: the grid, featured cards, the editor page and a project's own page.

export function ProjectGrid({ shell, setShell, owner, orgslug, username, token }: any) {
  const [savingUuid, setSavingUuid] = useState<string | null>(null)
  const toggleFeatured = async (item: Project) => {
    if (!token || savingUuid) return
    setSavingUuid(item.project_uuid)
    try {
      const featuredUuids = shell.projects.filter((project: Project) => project.featured && project.project_uuid !== item.project_uuid).map((project: Project) => project.project_uuid)
      const next = await updateMyPortfolioFeaturedProject({ project_uuids: item.featured ? featuredUuids : [...featuredUuids, item.project_uuid] }, token)
      setShell(next)
      toast.success(item.featured ? 'Removed from featured project' : `${item.title} is now featured`)
    } catch (error: any) { toast.error(error?.message || 'Could not update featured project') }
    finally { setSavingUuid(null) }
  }
  if (!shell.projects.length) return owner ? <EmptyProject orgslug={orgslug} /> : <p className="text-muted-foreground">No public project yet.</p>
  return <section>{owner && <div className="mb-5"><h2 className="text-2xl font-black">Your projects</h2><p className="mt-1 text-sm text-muted-foreground">Star projects to feature them on your overview.</p></div>}<div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 lg:grid-cols-3">{shell.projects.map((item: Project) => <div key={item.project_uuid} className={`group/project relative ${savingUuid === item.project_uuid ? 'pointer-events-none opacity-65' : ''}`}><ProjectCardView item={item} href={getUriWithOrg(orgslug, owner ? `/portfolio/projects/${item.project_uuid}` : `/user/${username}/projects/${item.slug}`)} />{owner && <button type="button" onClick={() => toggleFeatured(item)} aria-label={item.featured ? `Remove ${item.title} from featured project` : `Feature ${item.title}`} aria-pressed={item.featured} className={`absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/95 shadow-md ring-1 ring-border transition hover:scale-105 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${item.featured ? 'text-amber-500 opacity-100' : 'text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover/project:opacity-100'}`}><Star className="h-5 w-5" fill={item.featured ? 'currentColor' : 'none'} /></button>}</div>)}</div></section>
}

export function ProjectCardView({ item, href, preview = false }: { item: Project; href?: string; preview?: boolean }) { const card = <div className="group min-w-0"><div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">{item.cover_url ? <img src={normalizeMediaUrl(item.cover_url)} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-muted-foreground">{item.title || 'Your projects'}</div>}</div><h3 className="mt-3 line-clamp-2 text-sm font-bold leading-snug sm:text-base">{item.title || 'Your projects'}</h3>{(item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')) && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')}</p>}{preview && <span className="sr-only">Preview of your Project card</span>}</div>; return href ? <Link href={href}>{card}</Link> : card }

export function ProjectCards({ project, owner, orgslug, username }: { project: Project[]; owner: boolean; orgslug: string; username?: string }) { return <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 lg:grid-cols-3">{project.map((item) => <ProjectCardView key={item.project_uuid} item={item} href={getUriWithOrg(orgslug, owner ? `/portfolio/projects/${item.project_uuid}` : `/user/${username}/projects/${item.slug}`)} />)}</div> }

export function FeaturedProjectCards({ project, owner, orgslug, username }: { project: Project[]; owner: boolean; orgslug: string; username?: string }) {
  const reduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)
  const [scrolling, setScrolling] = useState(false)
  const scrollTimerRef = useRef<number | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const active = project[Math.min(activeIndex, project.length - 1)] || project[0]
  useEffect(() => () => { if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current) }, [])
  useEffect(() => {
    if (project.length < 2 || reduceMotion) return
    const timer = window.setTimeout(() => setActiveIndex((current) => (current + 1) % project.length), 6000)
    return () => window.clearTimeout(timer)
  }, [activeIndex, reduceMotion, project.length])
  useEffect(() => {
    const container = tabsRef.current
    const tab = tabRefs.current[activeIndex]
    if (!container || !tab) return
    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    const visibleLeft = container.scrollLeft
    const visibleRight = visibleLeft + container.clientWidth
    if (left < visibleLeft) container.scrollTo({ left, behavior: reduceMotion ? 'auto' : 'smooth' })
    else if (right > visibleRight) container.scrollTo({ left: right - container.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeIndex, reduceMotion])
  if (!active) return null
  const projectHref = (item: Project) => getUriWithOrg(orgslug, owner ? `/portfolio/projects/${item.project_uuid}` : `/user/${username}/projects/${item.slug}`)
  const excerpt = active.summary || String(active.blocks.find((block) => block.block_type === 'text')?.data?.text || '')
  const hero = <Link href={projectHref(active)} className={`group grid min-h-28 grid-cols-[minmax(0,1fr)_44%] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground transition-colors hover:border-foreground/25 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground sm:grid-cols-[42%_minmax(0,1fr)] ${project.length === 1 ? 'sm:h-44' : 'sm:h-56'}`}>
    <div className="order-1 flex min-w-0 flex-col justify-center px-3.5 py-3 sm:order-2 sm:px-6"><h3 className="line-clamp-2 text-[15px] font-bold leading-tight tracking-tight sm:text-lg">{active.title}</h3>{excerpt && <p className="mt-3 hidden line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:block">{excerpt}</p>}</div>
    <div className="order-2 min-w-0 overflow-hidden border-l border-border bg-muted sm:order-1 sm:border-l-0 sm:border-r">{active.cover_url ? <img src={normalizeMediaUrl(active.cover_url)} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-muted-foreground">{active.title}</div>}</div>
  </Link>
  if (project.length === 1) return <div className="max-w-3xl">{hero}</div>
  const onScroll = () => {
    setScrolling(true)
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = window.setTimeout(() => setScrolling(false), 700)
  }
  return <div className="grid gap-3">{hero}{!reduceMotion && <div className="h-0.5 overflow-hidden rounded-full"><div key={active.project_uuid} className="featured-projects-progress h-full bg-foreground/45" /></div>}<style jsx>{`@keyframes featured-projects-timer{from{width:0}to{width:100%}}.featured-projects-progress{width:0;animation:featured-projects-timer 6s linear forwards}.featured-projects-tabs::-webkit-scrollbar{height:${scrolling ? '4px' : '0'}}.featured-projects-tabs::-webkit-scrollbar-thumb{border-radius:999px;background:hsl(var(--border))}.featured-projects-tabs::-webkit-scrollbar-track{background:transparent}`}</style><div ref={tabsRef} onScroll={onScroll} className="featured-projects-tabs flex max-w-full snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1" style={{ scrollbarWidth: scrolling ? 'thin' : 'none' }}>{project.map((item, index) => { const selected = index === activeIndex; return <button ref={(node) => { tabRefs.current[index] = node }} type="button" key={item.project_uuid} onClick={() => setActiveIndex(index)} aria-pressed={selected} className={`relative flex h-16 w-[calc((100%_-_1.5rem)/3.5)] min-w-44 max-w-56 shrink-0 snap-start items-center gap-3 overflow-hidden rounded-lg px-2 text-left outline-none transition hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-foreground ${selected ? 'bg-muted' : ''}`}><span className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">{item.cover_url ? <img src={normalizeMediaUrl(item.cover_url)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center"><FolderOpen className="h-4 w-4 text-muted-foreground" /></span>}</span><span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug">{item.title}</span></button>})}</div></div>
}

export function ProjectEditor({ initialProject, orgslug }: { initialProject?: Project; orgslug: string }) {
  const router = useRouter(); const session = useLHSession() as any; const token = session?.data?.tokens?.access_token; const userId = Number(session?.data?.user?.id || 0); const [busy, setBusy] = useState(false); const [pickerOpen, setPickerOpen] = useState(false)
  const initialImages = (initialProject?.blocks || []).filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: block.data.asset_uuid, url: block.data.url, title: block.data.caption || '', owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
  const [images, setImages] = useState<MediaAsset[]>(initialImages)
  const [coverUuid, setCoverUuid] = useState<string | undefined>(initialProject?.cover_asset_uuid || initialImages[0]?.asset_uuid)
  function addImage(asset: MediaAsset) { setImages((current) => current.some((item) => item.asset_uuid === asset.asset_uuid) ? current : [...current, asset]); setCoverUuid((current) => current || asset.asset_uuid); setPickerOpen(false) }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!token) return; const form = new FormData(event.currentTarget); setBusy(true); try { const body: any = { title: form.get('title'), subtitle: '', start_date: form.get('start_date') || null, end_date: form.get('end_date') || null, cover_asset_uuid: coverUuid || null, blocks: [{ block_type: 'text', data: { text: form.get('story') } }, ...images.map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } }))] }; const saved = initialProject ? await updatePortfolioProject(initialProject.project_uuid, { ...body, revision: initialProject.revision }, token) : await createPortfolioProject({ ...body, idempotency_key: crypto.randomUUID() }, token); router.push(getUriWithOrg(orgslug, `/portfolio/projects/${saved.project_uuid}`)); router.refresh() } catch (error: any) { toast.error(error?.message || 'Could not save project') } finally { setBusy(false) } }
  return <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6"><ContentPageHeader orgslug={orgslug} backLabel="Projects" noHorizontalBleed /><form onSubmit={submit} className="grid gap-7"><h1 className="text-3xl font-black sm:text-4xl">{initialProject ? 'Edit project' : 'Add project'}</h1><label className="grid gap-2 font-semibold">Title<input required name="title" defaultValue={initialProject?.title} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><div className="grid grid-cols-2 gap-4"><label className="grid gap-2 font-semibold">Start date<input type="date" name="start_date" defaultValue={initialProject?.start_date || ''} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 font-semibold">End date<input type="date" name="end_date" defaultValue={initialProject?.end_date || ''} className="h-12 rounded-md border border-input bg-background px-3 font-normal" /></label></div><label className="grid gap-2 font-semibold">Description<textarea name="story" defaultValue={initialProject?.blocks?.find((block) => block.block_type === 'text')?.data?.text || ''} rows={10} className="rounded-md border border-input bg-background p-3 font-normal" /></label><section><div className="flex items-center justify-between"><div><h2 className="font-semibold">Images</h2><p className="text-sm text-muted-foreground">Choose one image as the cover.</p></div><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4" />Add image</Button></div>{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.asset_uuid} className={`group relative overflow-hidden rounded-xl border-2 ${coverUuid === image.asset_uuid ? 'border-foreground' : 'border-transparent'}`}><button type="button" onClick={() => setCoverUuid(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{coverUuid === image.asset_uuid ? 'Cover' : 'Make cover'}</span></button><button type="button" aria-label="Remove image" onClick={() => { setImages((current) => current.filter((item) => item.asset_uuid !== image.asset_uuid)); if (coverUuid === image.asset_uuid) setCoverUuid(images.find((item) => item.asset_uuid !== image.asset_uuid)?.asset_uuid) }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><Trash2 className="h-4 w-4" /></button></div>)}</div>}</section><Button size="lg" disabled={busy}>{busy ? 'Saving…' : initialProject ? 'Save changes' : 'Save project'}</Button></form><MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Add a project image" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={addImage} /></main>
}

export function formatProjectDate(start?: string, end?: string) { if (!start && !end) return ''; const format = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)); if (start && end) return `${format(start)} – ${format(end)}`; return start ? format(start) : `Through ${format(end!)}` }
export function ProjectDetail({ project, orgslug, owner }: { project: Project; portfolio: any; orgslug: string; owner: boolean; username?: string }) { const gallery = project.blocks.filter((block) => block.block_type === 'image' && block.data.asset_uuid !== project.cover_asset_uuid); const story = project.blocks.find((block) => block.block_type === 'text'); return <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6"><ContentPageHeader orgslug={orgslug} backLabel="Projects" noHorizontalBleed />{owner && <div className="mb-4 flex justify-end"><Button asChild variant="outline"><Link href={getUriWithOrg(orgslug, `/portfolio/projects/${project.project_uuid}/edit`)}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button></div>}<article>{project.cover_url && <div className="aspect-[16/9] overflow-hidden rounded-xl bg-muted"><img src={normalizeMediaUrl(project.cover_url)} alt="" className="h-full w-full object-cover" /></div>}<h1 className="mt-7 text-3xl font-black sm:text-5xl">{project.title}</h1>{formatProjectDate(project.start_date, project.end_date) && <p className="mt-2 text-sm text-muted-foreground">{formatProjectDate(project.start_date, project.end_date)}</p>}{story?.data?.text && <div className="prose prose-lg mt-8 max-w-3xl whitespace-pre-wrap dark:prose-invert">{story.data.text}</div>}{gallery.length > 0 && <div className="mt-10 grid gap-3 sm:grid-cols-2">{gallery.map((block, index) => <img key={block.block_uuid || index} src={normalizeMediaUrl(block.data.url)} alt={block.data.caption || ''} className="w-full rounded-xl object-cover" />)}</div>}</article></main> }
