'use client'
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Globe, Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { demoAccountName, demoRequest, fillGuideText, newGuidePage, type DemoGuidePage, type DemoMember, type GuideScope } from '@services/demo/demo'
import GuideMarkdown from '../GuideMarkdown'
import { guideSections } from '../DemoGuide'

export type GuideSave = { pages: DemoGuidePage[]; shared: DemoGuidePage[] | null }
const strip = (pages: DemoGuidePage[]) => pages.map((page) => { const copy = { ...page }; delete copy.scope; return copy })
// React's updater type: (previous list) => next list.
type PageListChange = Exclude<React.SetStateAction<DemoGuidePage[]>, DemoGuidePage[]>
const PLACEHOLDERS = '{{first_name}}, {{name}}, {{role_line}}, {{description}}'

/**
 * Every guide page is markdown, scoped to this demo user or shared by every demo user.
 * Sections are just titles pages share; a {{section:Title}} line lists a section as cards.
 */
export default function StudioGuideEditor({ member, busy, onSave }: { member: DemoMember; busy: boolean; onSave: React.Dispatch<GuideSave> }) {
  const [own, setOwn] = useState<DemoGuidePage[]>(() => member.guide?.pages || [])
  const [shared, setShared] = useState<DemoGuidePage[] | null>(null)
  const [sharedChanged, setSharedChanged] = useState(false)
  const [selected, setSelected] = useState<string>(() => member.guide?.pages?.[0]?.id || '')
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    demoRequest<{ pages: DemoGuidePage[] }>('guide/shared').then((result) => setShared(result.pages)).catch((failure) => setLoadError((failure as Error).message))
  }, [])

  const pages: DemoGuidePage[] = [...own.map((page) => ({ ...page, scope: 'user' as GuideScope })), ...(shared || []).map((page) => ({ ...page, scope: 'global' as GuideScope }))]
  const page = pages.find((item) => item.id === selected)
  const sections = [...new Set(pages.map((item) => item.section).filter(Boolean))]
  const person = { first_name: member.first_name || 'them', name: demoAccountName(member), role_line: member.role_line, description: member.description }
  const first = member.first_name || 'this user'

  function setList(scope: GuideScope, change: PageListChange) {
    if (scope === 'user') setOwn(change)
    else { setShared((current) => change(current || [])); setSharedChanged(true) }
  }
  const update = (patch: Partial<DemoGuidePage>) => page && setList(page.scope!, (list) => list.map((item) => item.id === page.id ? { ...item, ...patch } : item))
  function move(offset: number) {
    if (!page) return
    setList(page.scope!, (list) => {
      const index = list.findIndex((item) => item.id === page.id)
      const target = index + offset
      if (index < 0 || target < 0 || target >= list.length) return list
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }
  function rescope(scope: GuideScope) {
    if (!page || page.scope === scope) return
    const [item] = strip([page])
    setList(page.scope!, (list) => list.filter((entry) => entry.id !== page.id))
    setList(scope, (list) => [...list, item])
  }
  function remove() {
    if (!page) return
    setList(page.scope!, (list) => list.filter((item) => item.id !== page.id))
    setSelected(pages.find((item) => item.id !== page.id)?.id || '')
  }
  function create({ page: draft, scope }: { page: DemoGuidePage; scope: GuideScope }) {
    setList(scope, (list) => [...list, draft])
    setSelected(draft.id); setCreating(false)
  }

  const nav = (item: DemoGuidePage) => <button key={item.id} type="button" aria-current={!creating && selected === item.id} onClick={() => { setSelected(item.id); setCreating(false) }} className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm ${!creating && selected === item.id ? 'bg-background font-semibold shadow-sm' : 'hover:bg-background/60'}`}><span className="truncate">{fillGuideText(item.title, person) || 'Untitled'}</span>{item.scope === 'global' ? <Globe aria-label="Shared by every demo user" className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}</button>

  return <div className="space-y-4">
    {loadError ? <p role="alert" className="text-sm text-destructive">Shared pages could not load: {loadError}</p> : null}
    <div className="grid overflow-hidden rounded-xl border bg-card md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Guide pages" className="space-y-0.5 border-b bg-muted/50 p-2 md:border-b-0 md:border-r">
        {guideSections(pages).flatMap(([section, items]) => [section ? <p key={`s-${section}`} className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{section}</p> : null, ...items.map(nav)])}
        <button type="button" disabled={own.length >= 20 || shared === null} onClick={() => setCreating(true)} className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-background/60 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />New page</button>
        <p className="flex items-center gap-1.5 px-2.5 pt-2 text-xs text-muted-foreground"><Globe className="h-3 w-3" />Shared by every demo user</p>
      </nav>
      <div className="min-w-0 space-y-4 p-5">
        {creating ? <NewPage first={first} sections={sections} onCreate={create} onCancel={() => setCreating(false)} />
          : page ? <>
            <div className="flex flex-wrap items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => move(-1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
              <select aria-label="Who sees this page" value={page.scope} onChange={(event) => rescope(event.target.value as GuideScope)} className="h-8 rounded-md border bg-background px-2 text-sm"><option value="user">Only {first}</option><option value="global">Every demo user</option></select>
              <span className="flex-1" />
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
            </div>
            {page.scope === 'global' ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">Shared page: changes apply to every demo user&apos;s guide.</p> : null}
            <PageFields page={page} sections={sections} person={person} pages={pages} onChange={update} />
          </> : <p className="text-sm text-muted-foreground">No pages yet. Add one to start {first}&apos;s guide.</p>}
      </div>
    </div>
    <Button disabled={busy || shared === null} onClick={() => onSave({ pages: strip(own), shared: sharedChanged && shared ? strip(shared) : null })}>{busy ? 'Saving…' : 'Save guide'}</Button>
  </div>
}

function NewPage({ first, sections, onCreate, onCancel }: { first: string; sections: string[]; onCreate: React.Dispatch<{ page: DemoGuidePage; scope: GuideScope }>; onCancel: () => void }) {
  const [draft, setDraft] = useState(() => newGuidePage({ title: '' }))
  const [scope, setScope] = useState<GuideScope>('user')
  return <form onSubmit={(event) => { event.preventDefault(); onCreate({ page: { ...draft, title: draft.title.trim() || 'New page' }, scope }) }} className="space-y-4">
    <h3 className="font-semibold">New page</h3>
    <div className="space-y-1.5"><Label htmlFor="np-title">Title</Label><Input id="np-title" autoFocus maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Plan a summer program" /></div>
    <SectionInput id="np-section" value={draft.section} sections={sections} onChange={(section) => setDraft({ ...draft, section })} />
    <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Who sees it</legend><div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" name="np-scope" checked={scope === 'user'} onChange={() => setScope('user')} />Only {first}</label>
      <label className="flex items-center gap-2"><input type="radio" name="np-scope" checked={scope === 'global'} onChange={() => setScope('global')} />Every demo user</label>
    </div></fieldset>
    <KindInput kind={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
    <div className="flex gap-2"><Button type="submit">Add page</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
  </form>
}

function PageFields({ page, sections, person, pages, onChange }: { page: DemoGuidePage; sections: string[]; person: { first_name: string; name: string; role_line?: string; description?: string }; pages: DemoGuidePage[]; onChange: React.Dispatch<Partial<DemoGuidePage>> }) {
  const [preview, setPreview] = useState(false)
  return <>
    <div className="space-y-1.5"><Label htmlFor="gp-title">Title</Label><Input id="gp-title" maxLength={120} value={page.title} onChange={(event) => onChange({ title: event.target.value })} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><SectionInput id="gp-section" value={page.section} sections={sections} onChange={(section) => onChange({ section })} /><KindInput kind={page.kind} onChange={(kind) => onChange({ kind })} /></div>
    {page.kind === 'try' ? <div className="grid gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-1.5"><Label htmlFor="gp-minutes">Minutes</Label><Input id="gp-minutes" type="number" min={1} max={120} value={page.minutes ?? ''} onChange={(event) => onChange({ minutes: event.target.value ? Number(event.target.value) : null })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gp-link-label">Button label</Label><Input id="gp-link-label" maxLength={60} placeholder="Go to Badges" value={page.link_label} onChange={(event) => onChange({ link_label: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gp-link-path">Takes them to</Label><Input id="gp-link-path" maxLength={300} placeholder="/badges" value={page.link_path} onChange={(event) => onChange({ link_path: event.target.value })} /></div>
    </div> : null}
    <div className="space-y-1.5">
      <div className="flex items-center gap-1"><Label htmlFor="gp-body" className="mr-auto">Page</Label>{(['Write', 'Preview'] as const).map((label) => <button key={label} type="button" aria-pressed={preview === (label === 'Preview')} onClick={() => setPreview(label === 'Preview')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${preview === (label === 'Preview') ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>)}</div>
      {preview ? <div className="min-h-64 rounded-md border p-4"><GuideMarkdown body={page.body} person={person} pages={pages} onOpen={() => undefined} /></div>
        : <Textarea id="gp-body" rows={14} maxLength={10000} value={page.body} onChange={(event) => onChange({ body: event.target.value })} className="font-mono text-[13px] leading-6" placeholder={'Markdown: ### headings, - lists, 1. steps, **bold**, [links](/badges).'} />}
      <p className="text-xs leading-5 text-muted-foreground">Markdown. Fill in the demo user with {PLACEHOLDERS}. A line with only <code>{'{{section:Journeys}}'}</code> lists that section&apos;s pages as cards, and <code>[text](#page-id)</code> links to another page.{page.kind === 'try' ? ' Visitors rate things to try Easy, Okay or Hard, and that goes to the feedback board.' : ''} This page&apos;s id is <code>{page.id}</code>.</p>
    </div>
  </>
}

function SectionInput({ id, value, sections, onChange }: { id: string; value: string; sections: string[]; onChange: React.Dispatch<string> }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>Section</Label><Input id={id} list={`${id}-list`} maxLength={60} value={value} onChange={(event) => onChange(event.target.value)} placeholder="None, or e.g. Journeys" /><datalist id={`${id}-list`}>{sections.map((section) => <option key={section} value={section} />)}</datalist></div>
}

function KindInput({ kind, onChange }: { kind: DemoGuidePage['kind']; onChange: React.Dispatch<DemoGuidePage['kind']> }) {
  return <div className="space-y-1.5"><Label htmlFor="gp-kind">Type</Label><select id="gp-kind" value={kind} onChange={(event) => onChange(event.target.value as DemoGuidePage['kind'])} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="page">Page</option><option value="try">Thing to try (button and rating)</option></select></div>
}
