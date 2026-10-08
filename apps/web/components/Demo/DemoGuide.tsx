'use client'
import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import { Textarea } from '@components/ui/textarea'
import { demoRequest, fillGuideText, type DemoGuidePage, type DemoJourney, type GuidePerson } from '@services/demo/demo'
import { sendDemoFeedback } from './DemoFeedback'
import GuideMarkdown from './GuideMarkdown'

/** A guide page id; empty opens the first page. */
export type GuideTopic = string
const RATINGS = [['easy', 'Easy'], ['okay', 'Okay'], ['hard', 'Hard']] as const
const RATED_KEY = 'launchlms-demo-rated'

function rated(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(RATED_KEY) || '{}') } catch { return {} }
}

/** Pages grouped under their section titles, in the order sections first appear. */
export function guideSections(pages: DemoGuidePage[]): Array<[string, DemoGuidePage[]]> {
  const groups = new Map<string, DemoGuidePage[]>()
  for (const page of pages) groups.set(page.section, [...(groups.get(page.section) || []), page])
  return [...groups.entries()]
}

/**
 * A small docs site for one demo user, written as markdown pages in Demo Studio:
 * the user's own pages, then pages every demo user shares. `preview` is the admin in setup mode.
 */
export default function DemoGuide({ open, onOpenChange, topic, onTopic, personName, firstName, roleLine, description, preview, onJourney }: {
  open: boolean
  onOpenChange: React.Dispatch<boolean>
  topic: GuideTopic
  onTopic: React.Dispatch<GuideTopic>
  personName: string
  firstName: string
  roleLine?: string
  description?: string
  preview?: boolean
  onJourney: React.Dispatch<DemoJourney | null>
}) {
  const [pages, setPages] = useState<DemoGuidePage[] | null>(null)
  const [ratings, setRatings] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open || pages) return
    setRatings(rated())
    demoRequest<{ pages?: DemoGuidePage[] }>('guide').then((result) => setPages(result.pages || [])).catch(() => setPages([]))
  }, [open, pages])

  const person: GuidePerson = { first_name: firstName, name: personName, role_line: roleLine, description }
  const page = pages?.find((item) => item.id === topic) || pages?.[0]
  useEffect(() => { setPending(null); setNote(''); setError('') }, [topic])

  async function rate(item: DemoGuidePage, rating: string) {
    const title = fillGuideText(item.title, person)
    setBusy(true); setError('')
    try {
      if (!preview) await sendDemoFeedback({ message: note.trim() || `Rated this journey “${rating}”.`, journey: title, rating })
      const next = { ...rated(), [item.id]: rating }
      try { sessionStorage.setItem(RATED_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
      setRatings(next); setPending(null); setNote('')
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }

  const navButton = (item: DemoGuidePage) => <button key={item.id} type="button" aria-current={page?.id === item.id} onClick={() => onTopic(item.id)} className={`flex min-w-0 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm sm:w-full sm:shrink sm:whitespace-normal ${page?.id === item.id ? 'bg-background font-semibold shadow-sm' : 'hover:bg-background/60'}`}><span className="truncate">{fillGuideText(item.title, person)}</span>{ratings[item.id] ? <Check aria-label="Rated" className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}</button>
  const group = (label: string) => label ? <p key={`s-${label}`} className="hidden px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground sm:block">{label}</p> : null

  let body: React.ReactNode
  if (!pages) body = <p role="status" className="text-sm text-muted-foreground">Loading the guide…</p>
  else if (!page) body = <p className="text-sm text-muted-foreground">Explore freely. Everything in {firstName}&apos;s account is yours to change.</p>
  else body = <>
    {preview ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Setup mode: you&apos;re signed in as the real {firstName} account. Changes save to the demo and visitors get them after you publish.</p> : null}
    {page.kind === 'try' ? <span className="w-fit rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Thing to try{page.minutes ? ` · ${page.minutes} min` : ''}</span> : null}
    <h2 className="text-2xl font-semibold tracking-tight">{fillGuideText(page.title, person)}</h2>
    <GuideMarkdown body={page.body} person={person} pages={pages} ratings={ratings} onOpen={onTopic} />
    {page.kind === 'try' ? <>
      {page.link_path ? <div><Button onClick={() => { onJourney(page); onOpenChange(false); window.location.assign(page.link_path) }}>{page.link_label || 'Take me there'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
        : <div><Button variant="outline" onClick={() => { onJourney(page); onOpenChange(false) }}>Start trying</Button></div>}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">How did that go?</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rate this journey">{RATINGS.map(([value, label]) => <button key={value} type="button" aria-pressed={(pending || ratings[page.id]) === value} onClick={() => setPending(value)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${(pending || ratings[page.id]) === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-background hover:bg-muted'}`}>{label}</button>)}</div>
        {pending ? <><Textarea aria-label="What happened" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional: what got in the way, or what worked?" /><Button size="sm" disabled={busy} onClick={() => void rate(page, pending)}>{busy ? 'Sending…' : preview ? 'Try it (not sent in setup mode)' : 'Send to the team'}</Button></>
          : <p className="text-xs text-muted-foreground">{ratings[page.id] ? 'Thanks. You can change your answer.' : 'Your answer goes to the team with this journey attached.'}</p>}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </section>
    </> : null}
  </>

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="grid max-h-[min(44rem,calc(100dvh-2rem))] w-[calc(100dvw-2rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b px-5 py-3.5 pr-12"><BookOpen className="h-4 w-4" /><DialogTitle className="text-base">Guide</DialogTitle><DialogDescription className="hidden truncate text-sm sm:block">{preview ? `Preview of ${personName}'s guide` : `Exploring as ${personName}`}</DialogDescription></div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:grid-rows-1">
        <nav aria-label="Guide topics" className="flex gap-1 overflow-x-auto border-b bg-muted/50 p-2 sm:block sm:space-y-0.5 sm:overflow-y-auto sm:border-b-0 sm:border-r">
          {guideSections(pages || []).flatMap(([section, items]) => [group(section), ...items.map(navButton)])}
        </nav>
        <article className="flex min-w-0 max-w-[68ch] flex-col gap-4 overflow-y-auto p-5 sm:p-7">{body}</article>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3"><p className="text-xs text-muted-foreground">Reopen any time from Guide in the top bar.</p><span className="flex-1" /><Button onClick={() => onOpenChange(false)}>{preview ? 'Close' : 'Start exploring'}</Button></div>
    </DialogContent>
  </Dialog>
}
