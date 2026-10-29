'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Download, FileText, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@components/ui/select'
import { getUriWithOrg } from '@services/config/config'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { resumeVersions } from '@services/portfolio/records'
import { DetailHeader } from './PortfolioDetail'
import { RESUME_ACCENTS, RESUME_LAYOUTS, buildResume, sectionTitle, type ResumeItem } from './resumeModel'
import type { ResumeVersion, Shell } from '../portfolioTypes'

// The résumé builder: one letter-size page made from the portfolio. Each version keeps its own layout, accent
// and what it took off; facts are edited in the portfolio. Download prints just the page, which saves as a PDF.

const PAGE_WIDTH = 816
const PAGE_HEIGHT = 1056
const NEW_VERSION = '__new'
const DEFAULT: Omit<ResumeVersion, 'version_uuid' | 'name'> = { layout: 'classic', accent: 'blue', excluded: [] }

// eslint-disable-next-line no-unused-vars
type KeyAction = (key: string) => void

function Paper({ shell, version, editing, onRemove, onRestore, pageRef }: { shell: Shell; version: Omit<ResumeVersion, 'version_uuid' | 'name'>; editing: boolean; onRemove: KeyAction; onRestore: KeyAction; pageRef: React.RefObject<HTMLElement | null> }) {
  const { sections, removedSections } = useMemo(() => buildResume(shell, version.excluded), [shell, version.excluded])
  const accent = RESUME_ACCENTS[version.accent] || RESUME_ACCENTS.blue
  const compact = version.layout === 'compact'
  const modern = version.layout === 'modern'
  const name = shell.identity?.shown_name || shell.portfolio.display_name || ''
  const contact = [shell.portfolio.location_label, editing ? shell.portfolio.email : '', ...(shell.portfolio.socials || []).filter((social: any) => social.type === 'website' || social.type === 'linkedin').map((social: any) => String(social.url).replace(/^https?:\/\/(www\.)?/, ''))].filter(Boolean)
  const remove = (key: string, what: string) => editing ? <button type="button" onClick={() => onRemove(key)} aria-label={`Take ${what} off this version`} title="Take off this version" className="absolute -right-7 top-0 grid h-6 w-6 place-items-center rounded-full bg-[#f1f3f5] text-[#5b6770] opacity-0 transition hover:bg-[#e3e7ea] focus-visible:opacity-100 group-hover/r:opacity-100 print:hidden [@media(hover:none)]:opacity-100"><X className="h-3.5 w-3.5" /></button> : null
  const restore = (items: Array<{ key: string; label: string }>) => editing && items.length ? <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">{items.map((item) => <button key={item.key} type="button" onClick={() => onRestore(item.key)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#c7cfd4] px-2.5 py-0.5 text-[12px] font-semibold text-[#5b6770] hover:border-[#5b6770]"><Plus className="h-3 w-3" />{item.label}</button>)}</div> : null
  const row = (item: ResumeItem) => <div key={item.key} className="group/r relative">
    <div className="flex justify-between gap-4"><div className="min-w-0"><b>{item.title}</b>{item.detail ? <span>, {item.detail}</span> : null}</div>{item.when ? <small className="shrink-0 whitespace-nowrap text-[#5b6770]">{item.when}</small> : null}</div>
    {item.text && !compact ? <p className="mt-0.5 text-[#33414a]">{item.text}</p> : null}
    {remove(item.key, item.title)}
  </div>
  return <article ref={pageRef} data-resume-paper className={`relative bg-white text-[#0f171c] ${compact ? 'px-12 py-10 text-[12.5px] leading-snug' : 'px-14 py-12 text-[13.5px] leading-relaxed'}`} style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, borderTop: version.layout === 'classic' ? `6px solid ${accent}` : undefined, fontFamily: 'var(--font-sans, system-ui), sans-serif' }}>
    <header className={modern ? '-mx-14 -mt-12 mb-4 px-14 pb-6 pt-10 text-white' : 'mb-2'} style={modern ? { background: accent } : undefined}>
      <h2 className="text-[30px] font-extrabold leading-tight">{name}</h2>
      {contact.length ? <p className={modern ? 'text-white/85' : 'text-[#5b6770]'}>{contact.join(' · ')}</p> : null}
    </header>
    {sections.map((section) => <section key={section.key} className="group/s relative">
      <h3 className={`${compact ? 'mb-1.5 mt-4' : 'mb-2.5 mt-6'} relative border-b border-[#e3e7ea] pb-1 text-[11px] font-bold uppercase tracking-[0.14em]`} style={{ color: accent }}>
        <span className="group/r relative inline-block pr-1">{section.title}{remove(`section:${section.key}`, `the ${section.title} section`)}</span>
      </h3>
      {section.text ? <p className="text-[#33414a]">{section.text}</p> : null}
      <div className={compact ? 'grid gap-1.5' : 'grid gap-2.5'}>{section.key === 'references' ? <>{section.items.map(row)}<p className="text-[#5b6770]">Contact details on request.</p></> : section.items.map(row)}</div>
      {restore(section.removed.map((item) => ({ key: item.key, label: item.title })))}
    </section>)}
    {restore(removedSections.map((key) => ({ key: `section:${key}`, label: sectionTitle(key) })))}
  </article>
}

export function ResumeBuilder({ initialShell, orgslug, username, owner = false }: { initialShell: Shell; orgslug: string; username?: string; owner?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const versions = shell.resume_versions || []
  const [selected, setSelected] = useState(versions[0]?.version_uuid || '')
  const current = versions.find((item) => item.version_uuid === selected)
  // Before the first change there's no version yet; it's made on the first save.
  const [draft, setDraft] = useState<Omit<ResumeVersion, 'version_uuid' | 'name'>>(current || DEFAULT)
  const holdRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(PAGE_HEIGHT)
  // True once in the browser, where the print copy can go at the end of the body.
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false)
  const printRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const hold = holdRef.current, page = pageRef.current
    if (!hold || !page) return
    const measure = () => { setScale(Math.min(1, hold.clientWidth / PAGE_WIDTH)); setHeight(page.scrollHeight) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(hold); observer.observe(page)
    return () => observer.disconnect()
  }, [])
  const over = height > PAGE_HEIGHT + 2

  useEffect(() => {
    // Only the page prints, at its real size, from the copy at the end of the body.
    const style = document.createElement('style')
    style.textContent = `@media print { @page { size: letter; margin: 0 } html, body { background: #fff !important } body > :not([data-resume-print]) { display: none !important } [data-resume-print] { display: block !important } }`
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  async function save(next: Omit<ResumeVersion, 'version_uuid' | 'name'>) {
    setDraft(next)
    if (!token) return
    try {
      const payload = { layout: next.layout, accent: next.accent, excluded: next.excluded }
      const saved: ResumeVersion = current ? await resumeVersions.update(current.version_uuid, payload, token) : await resumeVersions.create({ name: 'My résumé', ...payload }, token)
      if (!current) { setShell(await getMyPortfolio(token)); setSelected(saved.version_uuid) }
      else setShell((value) => ({ ...value, resume_versions: (value.resume_versions || []).map((item) => item.version_uuid === saved.version_uuid ? saved : item) }))
    } catch (error: any) { toast.error(error?.message || 'Could not save this version') }
  }

  async function choose(value: string) {
    if (value !== NEW_VERSION) { const version = versions.find((item) => item.version_uuid === value); setSelected(value); if (version) setDraft(version); return }
    const name = window.prompt('Name this version, like “Food service jobs”')?.trim()
    if (!name || !token) return
    try {
      const saved: ResumeVersion = current ? await resumeVersions.create({ name, copy_from_uuid: current.version_uuid }, token) : await resumeVersions.create({ name, ...draft }, token)
      setShell(await getMyPortfolio(token)); setSelected(saved.version_uuid); setDraft(saved)
    } catch (error: any) { toast.error(error?.message || 'Could not make a new version') }
  }

  const toggle = (key: string, on: boolean) => save({ ...draft, excluded: on ? draft.excluded.filter((item) => item !== key) : [...draft.excluded, key] })
  const download = <Button type="button" variant="brand" className="h-10" onClick={() => window.print()}><Download className="h-4 w-4" />Download PDF</Button>

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2="resume">
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6 print:hidden">
      <DetailHeader href={getUriWithOrg(orgslug, owner ? '/portfolio' : `/user/${username}`)} owner={owner} color="sky" icon={FileText} title="Résumé">{download}</DetailHeader>
      {owner ? <>
        <div className="sticky top-2 z-10 mb-2 flex flex-wrap items-center gap-2.5 rounded-3xl border-2 border-border bg-card p-2.5">
          <Select value={selected || 'draft'} onValueChange={choose}>
            <SelectTrigger className="h-10 w-auto min-w-[11rem] rounded-2xl font-bold" aria-label="Résumé version"><FileText className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>{versions.length ? versions.map((item) => <SelectItem key={item.version_uuid} value={item.version_uuid}>{item.name}</SelectItem>) : <SelectItem value="draft">My résumé</SelectItem>}<SelectSeparator /><SelectItem value={NEW_VERSION}>New version…</SelectItem></SelectContent>
          </Select>
          <div role="group" aria-label="Layout" className="flex rounded-2xl bg-muted p-1">{RESUME_LAYOUTS.map(([key, label]) => <button key={key} type="button" aria-pressed={draft.layout === key} onClick={() => save({ ...draft, layout: key })} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${draft.layout === key ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>
          <div role="group" aria-label="Accent color" className="flex gap-1.5">{Object.entries(RESUME_ACCENTS).map(([key, color]) => <button key={key} type="button" aria-pressed={draft.accent === key} aria-label={key} onClick={() => save({ ...draft, accent: key })} className={`h-7 w-7 rounded-full border border-border ring-offset-2 ring-offset-card ${draft.accent === key ? 'ring-2 ring-foreground' : ''}`} style={{ background: color }} />)}</div>
          <span role="status" className={`ml-auto inline-flex items-center gap-1.5 text-sm font-bold ${over ? 'text-[#B86E12]' : 'text-[#0B7D73]'}`}>{over ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}{over ? 'Runs past one page' : 'Fits on one page'}</span>
        </div>
        <p className="mb-4 px-2 text-sm text-muted-foreground">Take anything off this version with its ×, and add it back from the dashed chips. The facts come from your portfolio, so change them there.</p>
      </> : null}
    </div>
    <div className="mx-auto max-w-[960px] px-4 sm:px-6">
      <div ref={holdRef} className="relative w-full" style={{ height: Math.max(height, PAGE_HEIGHT) * scale + 24 }}>
        <div className="absolute left-1/2 top-0 origin-top overflow-visible rounded-md shadow-[0_1px_2px_rgb(0_0_0/.08),0_14px_36px_rgb(14_26_33/.16)]" style={{ width: PAGE_WIDTH, transform: `translateX(-50%) scale(${scale})` }}>
          <Paper shell={shell} version={draft} editing={owner} onRemove={(key) => toggle(key, false)} onRestore={(key) => toggle(key, true)} pageRef={pageRef} />
          {/* Where a letter page ends, so spill is easy to see. */}
          {over ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-[#B86E12] print:hidden" style={{ top: PAGE_HEIGHT }} /> : null}
        </div>
      </div>
    </div>
    {browser ? createPortal(<div data-resume-print className="hidden"><Paper shell={shell} version={draft} editing={false} onRemove={() => {}} onRestore={() => {}} pageRef={printRef} /></div>, document.body) : null}
  </main>
}
