'use client'
import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import { Textarea } from '@components/ui/textarea'
import { demoRequest, emptyGuide, type DemoGuide as Guide, type DemoJourney } from '@services/demo/demo'
import { sendDemoFeedback } from './DemoFeedback'

export type GuideTopic = 'about' | 'how' | `journey:${string}`
const RATINGS = [['easy', 'Easy'], ['okay', 'Okay'], ['hard', 'Hard']] as const
const RATED_KEY = 'launchlms-demo-rated'

function rated(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(RATED_KEY) || '{}') } catch { return {} }
}

/**
 * A small docs site for one demo user: who they are, things to try, and how
 * the demo works. `preview` is the admin in setup mode.
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
  const [guide, setGuide] = useState<Guide | null>(null)
  const [ratings, setRatings] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open || guide) return
    setRatings(rated())
    demoRequest<{ guide: Partial<Guide> }>('guide').then((result) => setGuide(emptyGuide(result.guide))).catch(() => setGuide(emptyGuide()))
  }, [open, guide])

  const journeys = guide?.journeys || []
  const journey = topic.startsWith('journey:') ? journeys.find((item) => item.id === topic.slice(8)) : undefined
  useEffect(() => { setPending(null); setNote(''); setError('') }, [topic])

  async function rate(item: DemoJourney, rating: string) {
    setBusy(true); setError('')
    try {
      if (!preview) await sendDemoFeedback({ message: note.trim() || `Rated this journey “${rating}”.`, journey: item.title, rating })
      const next = { ...rated(), [item.id]: rating }
      try { sessionStorage.setItem(RATED_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
      setRatings(next); setPending(null); setNote('')
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }

  const navButton = (id: GuideTopic, label: string, done?: boolean) => <button key={id} type="button" aria-current={topic === id} onClick={() => onTopic(id)} className={`flex min-w-0 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm sm:w-full sm:shrink sm:whitespace-normal ${topic === id ? 'bg-background font-semibold shadow-sm' : 'hover:bg-background/60'}`}><span className="truncate">{label}</span>{done ? <Check aria-label="Rated" className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}</button>
  const group = (label: string) => <p className="hidden px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground sm:block">{label}</p>

  let body: React.ReactNode
  if (!guide) body = <p role="status" className="text-sm text-muted-foreground">Loading the guide…</p>
  else if (topic === 'about') body = <>
    <div><h2 className="text-2xl font-semibold tracking-tight">Meet {personName}</h2>{roleLine ? <p className="mt-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">{roleLine}</p> : null}</div>
    {description ? <p className="leading-7">{description}</p> : null}
    {guide.goals.length ? <section><h3 className="mb-2 font-semibold">What {firstName} wants</h3><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{guide.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul></section> : null}
    {guide.has.length ? <section><h3 className="mb-2 font-semibold">Already in {firstName}&apos;s account</h3><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{guide.has.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
    <section><h3 className="mb-2 font-semibold">Things to try</h3>{journeys.length ? <div className="grid gap-2">{journeys.map((item) => <button key={item.id} type="button" onClick={() => onTopic(`journey:${item.id}`)} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl border bg-card p-3 text-left hover:bg-muted/50"><span className="font-semibold">{item.title}</span><span className="text-xs text-muted-foreground">{ratings[item.id] ? `Rated ${ratings[item.id]}` : item.minutes ? `${item.minutes} min` : ''}</span>{item.why ? <span className="col-span-2 text-sm text-muted-foreground">{item.why}</span> : null}</button>)}</div> : <p className="text-sm text-muted-foreground">Explore freely. Everything in {firstName}&apos;s account is yours to change.</p>}</section>
  </>
  else if (journey) body = <>
    <span className="w-fit rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Thing to try{journey.minutes ? ` · ${journey.minutes} min` : ''}</span>
    <h2 className="text-2xl font-semibold tracking-tight">{journey.title}</h2>
    {journey.why ? <p className="leading-7 text-muted-foreground">{journey.why}</p> : null}
    {journey.steps.length ? <ol className="space-y-2">{journey.steps.map((step, index) => <li key={`${index}-${step}`} className="grid grid-cols-[1.5rem_1fr] gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol> : null}
    {journey.link_path ? <div><Button onClick={() => { onJourney(journey); onOpenChange(false); window.location.assign(journey.link_path) }}>{journey.link_label || 'Take me there'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
      : <div><Button variant="outline" onClick={() => { onJourney(journey); onOpenChange(false) }}>Start trying</Button></div>}
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <p className="font-semibold">How did that go?</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rate this journey">{RATINGS.map(([value, label]) => <button key={value} type="button" aria-pressed={(pending || ratings[journey.id]) === value} onClick={() => setPending(value)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${(pending || ratings[journey.id]) === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-background hover:bg-muted'}`}>{label}</button>)}</div>
      {pending ? <><Textarea aria-label="What happened" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional: what got in the way, or what worked?" /><Button size="sm" disabled={busy} onClick={() => void rate(journey, pending)}>{busy ? 'Sending…' : preview ? 'Try it (not sent in setup mode)' : 'Send to the team'}</Button></>
        : <p className="text-xs text-muted-foreground">{ratings[journey.id] ? 'Thanks. You can change your answer.' : 'Your answer goes to the team with this journey attached.'}</p>}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  </>
  else body = <>
    <h2 className="text-2xl font-semibold tracking-tight">How this demo works</h2>
    <p className="leading-7">{preview ? `You're in setup mode: signed in as the real ${firstName} account. Changes save to the demo and visitors get them after you publish.` : `You're using a private copy of ${firstName}'s account. Nobody else sees what you do, and it's discarded when you leave or after a while (you can add time).`}</p>
    <section><h3 className="mb-1 font-semibold">What works</h3><p className="text-muted-foreground">Badges, activities, portfolio, plans and the AI coach work for real. The coach has a demo allowance.</p></section>
    <section><h3 className="mb-1 font-semibold">What&apos;s switched off</h3><p className="text-muted-foreground">Emails aren&apos;t sent. Payments and publishing to outside services are off; the app tells you when you reach one.</p></section>
    <section><h3 className="mb-1 font-semibold">Start over or switch</h3><p className="text-muted-foreground">Use the menu on {firstName}&apos;s name in the top bar to start over or try someone else.</p></section>
    <section><h3 className="mb-1 font-semibold">Tell us what you think</h3><p className="text-muted-foreground">Use Feedback in the top bar any time. It goes straight to the team building this.</p></section>
  </>

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="grid max-h-[min(44rem,calc(100dvh-2rem))] w-[calc(100dvw-2rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b px-5 py-3.5 pr-12"><BookOpen className="h-4 w-4" /><DialogTitle className="text-base">Guide</DialogTitle><DialogDescription className="hidden truncate text-sm sm:block">{preview ? `Preview of ${personName}'s guide` : `Exploring as ${personName}`}</DialogDescription></div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:grid-rows-1">
        <nav aria-label="Guide topics" className="flex gap-1 overflow-x-auto border-b bg-muted/50 p-2 sm:block sm:space-y-0.5 sm:overflow-y-auto sm:border-b-0 sm:border-r">
          {navButton('about', `Meet ${firstName}`)}
          {journeys.length ? group('Things to try') : null}
          {journeys.map((item) => navButton(`journey:${item.id}`, item.title, Boolean(ratings[item.id])))}
          {group('About')}
          {navButton('how', 'How this demo works')}
        </nav>
        <article className="flex min-w-0 max-w-[68ch] flex-col gap-4 overflow-y-auto p-5 sm:p-7">{body}</article>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3"><p className="text-xs text-muted-foreground">Reopen any time from Guide in the top bar.</p><span className="flex-1" /><Button onClick={() => onOpenChange(false)}>{preview ? 'Close' : 'Start exploring'}</Button></div>
    </DialogContent>
  </Dialog>
}
