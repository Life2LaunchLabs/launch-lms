'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, NotebookText, Presentation, Video } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import type { StepMaterial } from '@services/goals/types'
import { cn } from '@/lib/utils'

/** One thing in the guide: the notes, or a file or link shown the way it reads best. */
type Item =
  | { key: string; kind: 'notes'; title: string; text: string }
  | { key: string; kind: 'pdf' | 'image' | 'video' | 'embed' | 'link'; title: string; url: string }

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

/** Where a link can be shown inside the app: Google Slides, Docs, Sheets and Drive files, and YouTube. */
export function embedUrl(url: string): string | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  const host = parsed.hostname.replace(/^www\./, '')
  if (host === 'docs.google.com') {
    const match = parsed.pathname.match(/^\/(presentation|document|spreadsheets)\/d\/([^/]+)/)
    if (!match) return null
    const [, kind, id] = match
    return kind === 'presentation' ? `https://docs.google.com/presentation/d/${id}/embed` : `https://docs.google.com/${kind}/d/${id}/preview`
  }
  if (host === 'drive.google.com') {
    const id = parsed.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  const youtube = host === 'youtu.be' ? parsed.pathname.slice(1) : host === 'youtube.com' || host === 'm.youtube.com' ? parsed.searchParams.get('v') : null
  return youtube ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtube)}` : null
}

/** The guide as items to step through: notes first, then each file or link. */
export function guideItems(notes: string, materials: StepMaterial[]): Item[] {
  const items: Item[] = notes.trim() ? [{ key: 'notes', kind: 'notes', title: 'Notes', text: notes }] : []
  materials.forEach((item, index) => {
    const url = item.url || ''
    if (!url) return
    const title = item.title || hostOf(url)
    const path = url.split(/[?#]/)[0].toLowerCase()
    const embed = embedUrl(url)
    const kind = item.media_type === 'document' || path.endsWith('.pdf') ? 'pdf'
      : item.media_type === 'image' || /\.(png|jpe?g|gif|webp|avif)$/.test(path) ? 'image'
        : item.media_type === 'video' || /\.(mp4|webm|mov)$/.test(path) ? 'video'
          : embed ? 'embed' : 'link'
    items.push({ key: `${index}`, kind, title, url: kind === 'embed' ? embed! : url })
  })
  return items
}

const ICONS = { notes: NotebookText, pdf: FileText, image: ImageIcon, video: Video, embed: Presentation, link: Link2 } as const

/** What's in a guide, in a few words: "Notes · 2 files". */
export function guideSummary(items: Item[]) {
  const files = items.filter((item) => item.kind !== 'notes').length
  return [items.some((item) => item.kind === 'notes') ? 'Notes' : null, files ? `${files} ${files === 1 ? 'file' : 'files'}` : null].filter(Boolean).join(' · ')
}

/**
 * A step's staff guide full-size: a header to move between the notes and each file, and the
 * item itself below: notes as formatted text, a PDF page by page, a photo, a video, or Google
 * Slides, Docs or YouTube embedded. Other links open in a new tab.
 */
export default function StaffGuideViewer({ open, onOpenChange, stepTitle, items }: { open: boolean; onOpenChange: (open: boolean) => void; stepTitle: string; items: Item[] }) { // eslint-disable-line no-unused-vars
  const [at, setAt] = React.useState(0)
  React.useEffect(() => { if (open) setAt(0) }, [open])
  const item = items[Math.min(at, items.length - 1)]
  if (!item) return null
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[100dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:w-[calc(100vw-2rem)]">
      <header className="flex flex-col gap-2 border-b px-4 pb-3 pt-4 pr-14 sm:px-5 sm:pr-14">
        <div className="min-w-0">
          <DialogTitle className="truncate text-base font-black">Staff guide · {stepTitle}</DialogTitle>
          <DialogDescription className="text-xs">Only staff see this.</DialogDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={at === 0} onClick={() => setAt(at - 1)} aria-label="Previous item"><ChevronLeft size={16} /></Button>
          <nav aria-label="Guide items" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {items.map((entry, index) => {
              const Icon = ICONS[entry.kind]
              return <button key={entry.key} type="button" onClick={() => setAt(index)} aria-current={index === at ? 'true' : undefined}
                className={cn('flex max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold', index === at ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                <Icon size={13} aria-hidden="true" className="shrink-0" /><span className="truncate">{entry.title}</span>
              </button>
            })}
          </nav>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{at + 1} of {items.length}</span>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={at >= items.length - 1} onClick={() => setAt(at + 1)} aria-label="Next item"><ChevronRight size={16} /></Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/40">
        <ItemView key={item.key} item={item} />
      </div>
    </DialogContent>
  </Dialog>
}

function ItemView({ item }: { item: Item }) {
  if (item.kind === 'notes') return <article className="mx-auto max-w-3xl px-5 py-6 sm:px-8"><Notes text={item.text} /></article>
  if (item.kind === 'pdf') return <PdfPages url={item.url} title={item.title} />
  if (item.kind === 'image') return <div className="flex h-full items-center justify-center p-4"><img src={item.url} alt={item.title} className="max-h-full max-w-full rounded-lg object-contain" /></div>
  if (item.kind === 'video') return <div className="flex h-full items-center justify-center bg-black p-2"><video src={item.url} controls className="max-h-full max-w-full" /></div>
  if (item.kind === 'embed') return <div className="flex h-full flex-col">
    <div className="flex justify-end border-b bg-background px-3 py-1.5"><Button asChild size="sm" variant="ghost"><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open in a new tab</a></Button></div>
    <iframe src={item.url} title={item.title} className="min-h-0 w-full flex-1 border-0 bg-background" allow="fullscreen; encrypted-media" allowFullScreen />
  </div>
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
    <Link2 size={28} aria-hidden="true" className="text-muted-foreground" />
    <p className="font-bold">{item.title}</p>
    <p className="max-w-md break-all text-sm text-muted-foreground">{item.url}</p>
    <Button asChild><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open in a new tab</a></Button>
  </div>
}

/** The notes as formatted text: headings, lists, links, tables. */
function Notes({ text }: { text: string }) {
  return <div className="text-[15px] leading-7 text-foreground">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      h1: ({ children }) => <h2 className="mb-2 mt-6 text-xl font-black tracking-tight first:mt-0">{children}</h2>,
      h2: ({ children }) => <h3 className="mb-2 mt-6 text-lg font-bold first:mt-0">{children}</h3>,
      h3: ({ children }) => <h4 className="mb-1 mt-5 font-bold first:mt-0">{children}</h4>,
      p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
      blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-indigo-300 pl-4 text-muted-foreground">{children}</blockquote>,
      a: ({ children, href = '' }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">{children}</a>,
      code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>,
      table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
      th: ({ children }) => <th className="border-b px-3 py-2 text-left font-semibold">{children}</th>,
      td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
    }}>{text}</ReactMarkdown>
  </div>
}

type PdfDocument = { numPages: number; getPage: (page: number) => Promise<any> } // eslint-disable-line no-unused-vars

/**
 * A PDF one page at a time, fitted to the width, with back and forward (and the arrow keys).
 * If the file can't be read here (another site's PDF without CORS), the browser's own viewer shows it.
 */
function PdfPages({ url, title }: { url: string; title: string }) {
  const [pdf, setPdf] = React.useState<PdfDocument | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [rendering, setRendering] = React.useState(true)
  const frame = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    let loading: { promise: Promise<unknown>; destroy: () => Promise<void> } | null = null
    let cancelled = false
    void (async () => {
      try {
        // The legacy build carries polyfills; the modern one needs JS that Safari and older Chrome don't have yet.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
        loading = pdfjs.getDocument({ url })
        const loaded = await loading.promise as PdfDocument
        if (!cancelled) setPdf(loaded)
      } catch { if (!cancelled) setFailed(true) }
    })()
    return () => { cancelled = true; void loading?.destroy() }
  }, [url])

  React.useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!pdf || !width || !canvas.current) return
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    let cancelled = false
    setRendering(true)
    void (async () => {
      const current = await pdf.getPage(page)
      if (cancelled || !canvas.current) return
      const fit = Math.min(width - 32, 1000) / current.getViewport({ scale: 1 }).width
      const ratio = window.devicePixelRatio || 1
      const viewport = current.getViewport({ scale: fit * ratio })
      const target = canvas.current
      target.width = viewport.width
      target.height = viewport.height
      target.style.width = `${Math.floor(viewport.width / ratio)}px`
      target.style.height = `${Math.floor(viewport.height / ratio)}px`
      task = current.render({ canvas: target, canvasContext: target.getContext('2d'), viewport })
      try { await task!.promise } catch { /* a newer render took over */ }
      if (!cancelled) setRendering(false)
    })()
    return () => { cancelled = true; task?.cancel() }
  }, [pdf, page, width])

  const pages = pdf?.numPages || 0
  const turn = React.useCallback((by: number) => setPage((current) => Math.min(Math.max(1, current + by), pages || 1)), [pages])
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); turn(-1) }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); turn(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn])

  if (failed) return <iframe src={url} title={title} className="h-full w-full border-0 bg-background" />
  return <div className="flex h-full flex-col">
    <div className="flex items-center justify-center gap-3 border-b bg-background px-3 py-2">
      <Button type="button" size="sm" variant="outline" disabled={!pdf || page <= 1} onClick={() => turn(-1)}><ChevronLeft size={15} />Back</Button>
      <span className="min-w-[6rem] text-center text-sm font-semibold tabular-nums">{pdf ? `Page ${page} of ${pages}` : 'Loading…'}</span>
      <Button type="button" size="sm" variant="outline" disabled={!pdf || page >= pages} onClick={() => turn(1)}>Forward<ChevronRight size={15} /></Button>
      <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open</a></Button>
    </div>
    <div ref={frame} className="relative min-h-0 flex-1 overflow-auto p-4">
      {rendering ? <Loader2 size={20} aria-label="Loading page" className="absolute left-1/2 top-8 animate-spin text-muted-foreground" /> : null}
      <canvas ref={canvas} aria-label={`${title}, page ${page}`} className="mx-auto block rounded bg-white shadow-md" />
    </div>
  </div>
}
