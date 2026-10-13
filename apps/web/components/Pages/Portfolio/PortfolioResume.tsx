'use client'

import { formatProjectDate } from './PortfolioProjects'
import { useEffect, useRef, useState } from 'react'
import { Briefcase, GraduationCap, MapPin, Minus, Plus } from 'lucide-react'

import { timelineDateLabel, type TimelineEntry } from './Timeline'
import type { Shell } from './portfolioTypes'

// The printable resume built from the portfolio.

export function ResumeView({ shell, username }: { shell: Shell; orgslug: string; username?: string; owner: boolean }) {
  const displayName = shell.portfolio.display_name || username || 'Your name'
  const experience = (shell.timeline || []).filter((entry) => ['employment', 'volunteering', 'experience', 'other'].includes(entry.entry_type))
  const education = (shell.timeline || []).filter((entry) => ['education', 'training'].includes(entry.entry_type))
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
        <ResumeSection title="Experience">{experience.length ? experience.map((entry) => <ResumeTimelineEntry key={entry.timeline_uuid} entry={entry} />) : <p className="text-sm text-muted-foreground">Add jobs, internships, or other experience to your timeline.</p>}</ResumeSection>
        {education.length > 0 && <ResumeSection title="Education & Training">{education.map((entry) => <ResumeTimelineEntry key={entry.timeline_uuid} entry={entry} />)}</ResumeSection>}
        <ResumeSection title="Projects">{shell.projects?.length ? shell.projects.slice(0, 5).map((project) => { const description = String(project.blocks.find((block) => block.block_type === 'text')?.data?.text || project.summary || ''); return <div key={project.project_uuid} className="break-inside-avoid"><div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">{project.title}</h3></div>{formatProjectDate(project.start_date, project.end_date) && <p className="mt-1 text-sm font-medium text-muted-foreground">{formatProjectDate(project.start_date, project.end_date)}</p>}{description && <p className="mt-1.5 whitespace-pre-wrap leading-6 text-muted-foreground">{description}</p>}</div> }) : <p className="text-sm text-muted-foreground">Add projects to fill this section.</p>}</ResumeSection>
      </div>
    </article>
      </div>
    </div>
  </section>
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid"><h2 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2><div className="mt-3 space-y-4">{children}</div></section>
}

function ResumeTimelineEntry({ entry }: { entry: TimelineEntry }) {
  return <div className="grid break-inside-avoid grid-cols-[1fr_auto] gap-x-4"><div><div className="flex items-center gap-2">{['education', 'training'].includes(entry.entry_type) ? <GraduationCap className="h-4 w-4 text-muted-foreground" /> : <Briefcase className="h-4 w-4 text-muted-foreground" />}<h3 className="font-semibold">{entry.title}</h3></div>{entry.organization && <p className="mt-1 text-sm font-medium text-muted-foreground">{entry.organization}</p>}{entry.summary && <p className="mt-1.5 whitespace-pre-wrap leading-6 text-muted-foreground">{entry.summary}</p>}</div><p className="text-right text-sm font-medium text-muted-foreground">{timelineDateLabel(entry)}</p></div>
}
