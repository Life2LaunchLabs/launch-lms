'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import { X } from 'lucide-react'
import { PageThumb } from './PageRail'
import { PAGE_TEMPLATES, blankPage, blankVideo, type PageDraft } from './pageTemplates'

/** A light dialog that matches the editor (the app's own dialog follows the site theme). */
export function EditorModal({ title, subtitle, width = 760, onClose, children }: { title: string; subtitle?: string; width?: number; onClose: () => void; children: React.ReactNode }) {
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[min(860px,calc(100vh-32px))] w-full flex-col overflow-hidden rounded-2xl bg-white text-gray-950 shadow-2xl outline-none" style={{ maxWidth: width }}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

const CATEGORIES = ['All', 'Start', 'Teach', 'Check', 'Reflect'] as const

/** New page: blank, or from a page that already works. It goes after the selected page. */
export function NewPageDialog({ where, settings, onPick, onClose }: { where: string; settings: any; onPick: (draft: PageDraft) => void; onClose: () => void }) {
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>('All')
  const groups = CATEGORIES.slice(1).filter((item) => category === 'All' || item === category)
  // Thumbnails need pages with ids; the drafts are made fresh again when picked.
  const previews = React.useMemo(() => new Map(PAGE_TEMPLATES.map((template) => [template.id, { page_uuid: template.id, ...template.make() }])), [])
  const card = (key: string, page: any, name: string, description: string, pick: () => void) => (
    <button key={key} onClick={pick} className="group flex flex-col gap-1.5 rounded-xl p-2 text-left transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
      <span className="block rounded-lg transition group-hover:ring-2 group-hover:ring-sky-400"><PageThumb page={page} settings={settings} width={176} /></span>
      <b className="text-sm">{name}</b>
      <small className="text-xs leading-4 text-gray-500">{description}</small>
    </button>
  )
  return (
    <EditorModal title="New page" subtitle={`Start blank or from something that already works. It goes ${where}.`} onClose={onClose}>
      <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-gray-100 bg-white px-6 py-3">
        {CATEGORIES.map((item) => (
          <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`rounded-full px-3 py-1 text-xs font-bold transition ${category === item ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{item}</button>
        ))}
      </div>
      <div className="space-y-5 px-6 py-5">
        {category === 'All' && (
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Blank</h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {card('blank', { page_uuid: 'blank', ...blankPage(), content: { version: 3, blocks: [{ id: 'h', type: 'heading', content: { text: 'Blank page' } }] } }, 'Blank page', 'Just a heading. Add anything.', () => onPick(blankPage()))}
              {card('blank-video', { page_uuid: 'blank-video', ...blankVideo() }, 'Blank video', 'Full screen video.', () => onPick(blankVideo()))}
            </div>
          </section>
        )}
        {groups.map((group) => (
          <section key={group}>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{group}</h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {PAGE_TEMPLATES.filter((template) => template.category === group).map((template) => card(template.id, previews.get(template.id), template.name, template.description, () => onPick(template.make())))}
            </div>
          </section>
        ))}
      </div>
    </EditorModal>
  )
}

const PROGRESS = [
  { value: 'line', label: 'One line' },
  { value: 'segments', label: 'Segments' },
  { value: 'dots', label: 'Dots' },
  { value: 'count', label: 'Page count' },
  { value: 'none', label: 'None' },
] as const

function ProgressSketch({ style }: { style: string }) {
  if (style === 'none') return <span className="text-[10px] font-semibold text-gray-400">Nothing shown</span>
  if (style === 'count') return <span className="text-[10px] font-bold text-gray-600">3 of 8</span>
  if (style === 'line') return <span className="block h-1 w-full rounded-full bg-gray-200"><span className="block h-1 w-2/5 rounded-full bg-gray-800" /></span>
  if (style === 'dots') return <span className="flex gap-1">{Array.from({ length: 6 }, (_, index) => <i key={index} className={`block h-1.5 w-1.5 rounded-full ${index < 3 ? 'bg-gray-800' : 'bg-gray-200'}`} />)}</span>
  return <span className="flex w-full gap-0.5">{Array.from({ length: 6 }, (_, index) => <i key={index} className={`block h-1 flex-1 rounded-full ${index < 3 ? 'bg-gray-800' : 'bg-gray-200'}`} />)}</span>
}

export function ProgressPicker({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const current = value || 'line'
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }} role="radiogroup" aria-label="Progress bar">
      {PROGRESS.map((item) => (
        <button key={item.value} role="radio" aria-checked={current === item.value} onClick={() => onChange(item.value)} className={`flex flex-col gap-2 rounded-xl border p-2.5 text-left transition ${current === item.value ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:bg-gray-50'}`}>
          <span className="flex h-5 items-center rounded-md border border-gray-200 bg-white px-2"><ProgressSketch style={item.value} /></span>
          <b className="text-xs">{item.label}</b>
        </button>
      ))}
    </div>
  )
}

export function Toggle({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 px-3.5 py-2.5">
      <span><span className="block text-sm font-semibold">{label}</span>{help && <span className="block text-xs text-gray-500">{help}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-10 shrink-0 rounded-full transition ${checked ? 'bg-sky-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}
