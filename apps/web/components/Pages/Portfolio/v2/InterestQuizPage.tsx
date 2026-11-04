'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { careersApi } from '@services/life/careers'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { getInterestQuiz, takeInterestQuiz, type InterestQuiz, type QuizCareer, type QuizTaken } from '@services/portfolio/records'
import { CareerTile } from '@components/Careers/CareerTile'
import { DetailHeader } from './PortfolioDetail'
import { Radar } from './ResultView'

// The interest quiz: O*NET's Mini Interest Profiler, one activity at a time. Tap how you'd feel about doing it
// and the next one comes up. At the end the result is saved to "What I'm like" and careers that line up are
// listed. The items and answer labels are O*NET's, word for word (CC BY-ND 4.0); the credit is on the page.

const FACES = ['😖', '🙁', '🤷', '🙂', '😍']
const FACE_COLORS = ['#EF4444', '#F97316', '#A3A3A3', '#22C55E', '#8B5CF6']
// What each type means, in our own words, for a 15-year-old.
const MEANS: Record<string, string> = {
  R: 'Hands-on work: building, fixing, and working with tools, machines, plants or animals.',
  I: 'Figuring things out: science, research, and solving puzzles.',
  A: 'Making things: art, music, writing, design and new ideas.',
  S: 'Helping people: teaching, caring for and supporting others.',
  E: 'Leading: starting things, persuading people, selling and deciding.',
  C: 'Organizing: details, records, data and clear steps.',
}
// O*NET job zones, said simply.
const FILTERS = [
  { id: 'all', label: 'All', keep: () => true },
  { id: 'no-degree', label: 'No 4-year degree', keep: (zone: number | null) => !zone || zone <= 3 },
  { id: 'degree', label: 'College degree', keep: (zone: number | null) => Boolean(zone && zone >= 4) },
] as const
const DRAFT_KEY = 'interest-quiz-answers'

function readDraft(): number[] {
  try { const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || '[]'); return Array.isArray(saved) ? saved.filter((value) => Number.isInteger(value)) : [] } catch { return [] }
}
function writeDraft(answers: number[] | null) {
  try { if (answers) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(answers)); else window.localStorage.removeItem(DRAFT_KEY) } catch { /* private mode: the quiz still works, it just won't resume */ }
}
// eslint-disable-next-line no-unused-vars
type Start = (fresh: boolean) => void
// eslint-disable-next-line no-unused-vars
type Answer = (value: number) => void

export function InterestQuizPage({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [quiz, setQuiz] = useState<InterestQuiz | null>(null)
  const [taken, setTaken] = useState<QuizTaken | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [mode, setMode] = useState<'loading' | 'intro' | 'asking' | 'saving' | 'done'>('loading')

  useEffect(() => {
    if (!token) return
    getInterestQuiz(token).then((found) => {
      setQuiz(found.quiz)
      setTaken(found.taken)
      const draft = readDraft().slice(0, found.quiz.items.length)
      setAnswers(draft)
      setMode(found.taken && !draft.length ? 'done' : 'intro')
    }).catch((error) => { toast.error(error?.message || 'Could not load the quiz'); setMode('intro') })
  }, [token])

  async function answer(value: number) {
    if (!quiz || !token || mode !== 'asking') return
    const next = [...answers, value]
    setAnswers(next)
    if (next.length < quiz.items.length) { writeDraft(next); return }
    setMode('saving')
    try {
      setTaken(await takeInterestQuiz(next, token))
      writeDraft(null)
      setAnswers([])
      setMode('done')
      window.scrollTo({ top: 0 })
    } catch (error: any) { toast.error(error?.message || 'Could not save your answers'); setAnswers(next.slice(0, -1)); setMode('asking') }
  }

  const back = () => setAnswers((current) => { const next = current.slice(0, -1); writeDraft(next); return next })
  const start = (fresh: boolean) => { if (fresh) { setAnswers([]); writeDraft(null) } setMode('asking'); window.scrollTo({ top: 0 }) }

  // Number keys 1 to 5 answer, Backspace goes back.
  useEffect(() => {
    if (mode !== 'asking') return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (/^[1-5]$/.test(event.key)) answer(Number(event.key) - 1)
      else if (event.key === 'Backspace' && answers.length) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return <main className="min-h-screen bg-background pb-24 text-foreground" data-portfolio-v2="interest-quiz">
    <div className="mx-auto max-w-[760px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="violet" icon={Sparkles} title="Interest quiz" />
      {mode === 'loading' || !quiz ? <div className="h-64 animate-pulse rounded-3xl bg-muted" />
        : mode === 'intro' ? <Intro quiz={quiz} resume={answers.length} onStart={start} />
        : mode === 'done' && taken ? <Results quiz={quiz} taken={taken} orgslug={orgslug} onRetake={() => start(true)} />
        : <Question quiz={quiz} answers={answers} saving={mode === 'saving'} onAnswer={answer} onBack={back} />}
      <Credit quiz={quiz} />
    </div>
  </main>
}

function Intro({ quiz, resume, onStart }: { quiz: InterestQuiz; resume: number; onStart: Start }) {
  return <section className="rounded-3xl border border-border bg-card p-6 text-center sm:p-8">
    <div className="mx-auto mb-4 flex w-fit gap-1 text-3xl" aria-hidden>{FACES.map((face) => <span key={face}>{face}</span>)}</div>
    <h2 className="text-[clamp(22px,4vw,28px)] font-extrabold leading-tight">What kind of work would you enjoy?</h2>
    <p className="mx-auto mt-2 max-w-md text-[15px] font-semibold text-muted-foreground">You’ll see {quiz.items.length} activities people do at work. Tap how you’d feel doing each one. There are no right answers, and don’t worry about pay or training yet. It takes about 5 minutes.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {resume ? <><Button type="button" variant="brand" onClick={() => onStart(false)}>Keep going ({resume} of {quiz.items.length})</Button><Button type="button" variant="surface" onClick={() => onStart(true)}>Start over</Button></>
        : <Button type="button" variant="brand" onClick={() => onStart(true)}>Start the quiz</Button>}
    </div>
  </section>
}

function Question({ quiz, answers, saving, onAnswer, onBack }: { quiz: InterestQuiz; answers: number[]; saving: boolean; onAnswer: Answer; onBack: () => void }) {
  const at = Math.min(answers.length, quiz.items.length - 1)
  const item = quiz.items[at]
  const done = answers.length / quiz.items.length
  return <section className="grid gap-5">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} disabled={!answers.length || saving} aria-label="Back to the last one" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><ArrowLeft className="h-5 w-5" /></button>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={quiz.items.length} aria-valuenow={answers.length} aria-label="Questions answered"><div className="h-full rounded-full bg-[#8B5CF6] transition-[width] duration-300" style={{ width: `${Math.max(3, done * 100)}%` }} /></div>
      <span className="w-14 shrink-0 text-right text-sm font-extrabold tabular-nums text-muted-foreground">{Math.min(answers.length + 1, quiz.items.length)}/{quiz.items.length}</span>
    </div>
    <div key={item.n} className="grid min-h-[180px] place-items-center rounded-3xl border-2 border-border bg-card px-6 py-10 text-center shadow-[0_5px_0_hsl(var(--border))] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">How would you feel about this?</p>
        <h2 className="text-[clamp(24px,5vw,34px)] font-extrabold leading-tight" aria-live="polite">{item.text}</h2>
      </div>
    </div>
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Your answer">
      {quiz.answers.map((option) => <button key={option.value} type="button" disabled={saving} onClick={() => onAnswer(option.value)}
        className="group grid min-h-[92px] content-center justify-items-center gap-1.5 rounded-2xl border-2 border-border bg-card px-1 py-3 text-center shadow-[0_4px_0_hsl(var(--border))] transition-[transform,box-shadow,border-color] [@media(hover:hover)]:hover:border-[var(--face)] active:translate-y-[3px] active:shadow-[0_1px_0_hsl(var(--border))] disabled:opacity-50"
        style={{ ['--face' as any]: FACE_COLORS[option.value] }}>
        <span className="text-[30px] leading-none transition-transform [@media(hover:hover)]:group-hover:scale-110" aria-hidden>{FACES[option.value]}</span>
        <span className="text-[11.5px] font-extrabold leading-tight sm:text-[13px]">{option.label}</span>
      </button>)}
    </div>
    <p className="hidden text-center text-xs font-semibold text-muted-foreground sm:block">Tip: press 1 to 5 to answer.</p>
    {saving ? <p className="text-center text-sm font-bold text-muted-foreground">Working out your result…</p> : null}
  </section>
}

function Results({ quiz, taken, orgslug, onRetake }: { quiz: InterestQuiz; taken: QuizTaken; orgslug: string; onRetake: () => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const label = (key: string) => quiz.types.find((type) => type.key === key)?.label || key
  const top = taken.code.split('')
  const keep = FILTERS.find((item) => item.id === filter)!.keep
  const careers = taken.careers.filter((career) => keep(career.job_zone))
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="text-foreground"><Radar scores={taken.scores} axes={quiz.types} max={quiz.max} size={210} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Your interest code</p>
          <h2 className="text-[40px] font-black leading-none tracking-[0.12em] text-[#6539D8] dark:text-[#b9a2ff]">{taken.code}</h2>
          <ul className="mt-4 grid gap-3">{top.map((key, index) => <li key={key} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black text-white" style={{ background: '#8B5CF6', opacity: 1 - index * 0.2 }}>{key}</span>
            <span className="min-w-0"><b className="block text-[15px] font-extrabold">{label(key)} <span className="font-bold text-muted-foreground">· {taken.scores[key]} of {quiz.max}</span></b><small className="block text-[13.5px] font-semibold text-muted-foreground">{MEANS[key]}</small></span>
          </li>)}</ul>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-bold"><Check className="h-4 w-4 text-emerald-600" />Saved to What I’m like on your portfolio</span>
        <span className="flex gap-2"><Button asChild variant="surface" size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio')}>See my portfolio</Link></Button><Button type="button" variant="ghost" size="sm" onClick={onRetake}><RotateCcw className="h-4 w-4" />Take it again</Button></span>
      </div>
    </section>

    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
        <div><h2 className="text-xl font-extrabold">Careers that fit your interests</h2><p className="text-sm font-semibold text-muted-foreground">Closest match first. Interests are one piece; what you’re good at and what you value matter too.</p></div>
      </div>
      {taken.careers.length ? <>
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Training">{FILTERS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={filter === item.id} onClick={() => setFilter(item.id)} className={`h-9 rounded-full border-2 px-3.5 text-[13px] font-extrabold ${filter === item.id ? 'border-[#6539D8] bg-[#8B5CF6] text-white' : 'border-border bg-card'}`}>{item.label}</button>)}</div>
        {careers.length ? <CareerCarousel key={filter} careers={careers} orgslug={orgslug} />
          : <p className="rounded-2xl border-2 border-dashed border-border p-4 text-sm font-semibold text-muted-foreground">None of your closest matches fit this filter. Try another.</p>}
      </> : <p className="rounded-2xl border-2 border-dashed border-border p-4 text-sm font-semibold text-muted-foreground">Career matches will show up here once the career list is loaded. Your result is saved, so you won’t need to take the quiz again.</p>}
    </section>
  </div>
}

/** One row of career cards that scrolls sideways (swipe on a phone, arrows on a computer). */
function CareerCarousel({ careers, orgslug }: { careers: QuizCareer[]; orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const router = useRouter()
  // A career the organization has in Discover opens its profile there; others open My Next Move.
  const codes = careers.map((career) => career.code)
  const { data } = useSWR(token && org?.id ? ['career-links', org.id, codes.join(',')] : null, () => careersApi.links(org.id, codes, token!))
  const links = data?.links || {}
  const row = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const look = () => { const el = row.current; if (el) setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 }) }
  useEffect(look, [careers])
  const step = (direction: number) => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.85, behavior: 'smooth' })
  const arrow = 'absolute top-[56px] z-10 hidden h-10 w-10 place-items-center rounded-full border-2 border-border bg-card shadow-[0_3px_0_hsl(var(--border))] hover:bg-raised disabled:opacity-0 sm:grid'
  return <div className="relative -mx-4 sm:mx-0">
    <button type="button" aria-label="Earlier careers" onClick={() => step(-1)} disabled={edges.start} className={`${arrow} -left-5`}><ChevronLeft className="h-5 w-5" /></button>
    <ul ref={row} onScroll={look} aria-label="Careers that fit your interests" className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {careers.map((career) => <li key={career.code}>{links[career.code]
        ? <CareerTile career={career} onOpen={() => router.push(getUriWithOrg(orgslug, `/discover?r=${links[career.code].replace(/^resource_/, '')}`))} />
        : <CareerTile career={career} href={`https://www.mynextmove.org/profile/summary/${career.code}`} />}</li>)}
    </ul>
    <button type="button" aria-label="More careers" onClick={() => step(1)} disabled={edges.end} className={`${arrow} -right-5`}><ChevronRight className="h-5 w-5" /></button>
  </div>
}

function Credit({ quiz }: { quiz: InterestQuiz | null }) {
  if (!quiz) return null
  return <p className="mt-8 px-1 text-[11.5px] font-semibold leading-relaxed text-muted-foreground">
    {quiz.credit} <a href={quiz.links.tool} target="_blank" rel="noreferrer" className="underline">About the Interest Profiler</a> · <a href={quiz.links.license} target="_blank" rel="noreferrer" className="underline">License</a>. Career matches use O*NET interest profiles; pay is the BLS median.
  </p>
}
