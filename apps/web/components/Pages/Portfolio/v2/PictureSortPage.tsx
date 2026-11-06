'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Images } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { getPictureSort, takePictureSort, type PictureCard, type PictureSort, type QuizTaken } from '@services/portfolio/records'
import { ReadAloudText, SpeakButton, SpokenQuestion, ReadToMeToggle, useAutoRead, useSpeechId } from '@components/Accessibility/ReadAloud'
import { cn } from '@/lib/utils'
import { DetailHeader } from './PortfolioDetail'
import { Results } from './InterestQuizPage'

// The picture sort: a free interest check for learners who read little or not at all. One photo of someone
// at work at a time, with a few words that can be read aloud. Swipe right or tap the happy face for yes, swipe
// left or tap the frown for no, or tap the shrug for not sure. Every swipe has a button, and arrow keys work.
// Scores land on the same six interest types as the quiz, so the result and career matches look the same.

const FACES = ['🙁', '🤷', '😍']
const FACE_COLORS = ['#F97316', '#A3A3A3', '#22C55E']
const TYPE_COLORS: Record<string, string> = { R: '#EA580C', I: '#2563EB', A: '#DB2777', S: '#16A34A', E: '#7C3AED', C: '#0891B2' }
const DRAFT_KEY = 'picture-sort-answers'

function readDraft(): Record<string, number> {
  try { const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {} } catch { return {} }
}
function writeDraft(answers: Record<string, number> | null) {
  try { if (answers) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(answers)); else window.localStorage.removeItem(DRAFT_KEY) } catch { /* private mode: it still works, it just won't resume */ }
}
// eslint-disable-next-line no-unused-vars
type Start = (fresh: boolean) => void
// eslint-disable-next-line no-unused-vars
type Answer = (value: number) => void

export function PictureSortPage({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [sort, setSort] = useState<PictureSort | null>(null)
  const [taken, setTaken] = useState<QuizTaken | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<'loading' | 'intro' | 'sorting' | 'saving' | 'done'>('loading')

  useEffect(() => {
    if (!token) return
    getPictureSort(token).then((found) => {
      setSort(found.sort)
      setTaken(found.taken)
      const keys = new Set(found.sort.cards.map((card) => card.key))
      const draft = Object.fromEntries(Object.entries(readDraft()).filter(([key, value]) => keys.has(key) && [0, 1, 2].includes(value)))
      setAnswers(draft)
      setMode(found.taken && !Object.keys(draft).length ? 'done' : 'intro')
    }).catch((error) => { toast.error(error?.message || 'Could not load the picture sort'); setMode('intro') })
  }, [token])

  const cards = sort?.cards || []
  const at = cards.findIndex((card) => !(card.key in answers))
  const done = Object.keys(answers).length

  async function answer(value: number) {
    if (!sort || !token || mode !== 'sorting' || at < 0) return
    const next = { ...answers, [cards[at].key]: value }
    setAnswers(next)
    if (Object.keys(next).length < cards.length) { writeDraft(next); return }
    setMode('saving')
    try {
      setTaken(await takePictureSort(next, token))
      writeDraft(null)
      setAnswers({})
      setMode('done')
      window.scrollTo({ top: 0 })
    } catch (error: any) {
      toast.error(error?.message || 'Could not save your answers')
      const { [cards[at].key]: _dropped, ...rest } = next // eslint-disable-line no-unused-vars
      setAnswers(rest)
      setMode('sorting')
    }
  }

  const back = () => setAnswers((current) => {
    const last = [...cards].reverse().find((card) => card.key in current)
    if (!last) return current
    const { [last.key]: _dropped, ...rest } = current // eslint-disable-line no-unused-vars
    writeDraft(rest)
    return rest
  })
  const start = (fresh: boolean) => { if (fresh) { setAnswers({}); writeDraft(null) } setMode('sorting'); window.scrollTo({ top: 0 }) }

  // Left arrow or 1 is no, down arrow or 2 is not sure, right arrow or 3 is yes; Backspace goes back.
  useEffect(() => {
    if (mode !== 'sorting') return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      const value = ({ ArrowLeft: 0, '1': 0, ArrowDown: 1, '2': 1, ArrowRight: 2, '3': 2 } as Record<string, number>)[event.key]
      if (value !== undefined) { event.preventDefault(); answer(value) }
      else if (event.key === 'Backspace' && done) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return <main className="min-h-screen bg-background pb-24 text-foreground" data-portfolio-v2="picture-sort">
    <div className="mx-auto max-w-[760px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="violet" icon={Images} title="Picture sort" />
      {mode === 'loading' || !sort ? <div className="h-64 animate-pulse rounded-3xl bg-muted" />
        : mode === 'intro' ? <Intro count={cards.length} resume={done} onStart={start} quizHref={getUriWithOrg(orgslug, '/portfolio/interests')} />
        : mode === 'done' && taken ? <Results quiz={sort} taken={taken} orgslug={orgslug} onRetake={() => start(true)} />
        : <Sorting sort={sort} card={cards[Math.max(0, at)]} done={done} saving={mode === 'saving'} onAnswer={answer} onBack={back} />}
      <p className="mt-8 px-1 text-[11.5px] font-semibold leading-relaxed text-muted-foreground">
        The picture sort and its words are Life2Launch’s own. Photos are from Wikimedia Commons and US government sources, credited on each card. Career matches use O*NET interest profiles; pay is the BLS median.
      </p>
    </div>
  </main>
}

function Intro({ count, resume, onStart, quizHref }: { count: number; resume: number; onStart: Start; quizHref: string }) {
  return <section className="rounded-3xl border border-border bg-card p-6 text-center sm:p-8">
    <div className="mx-auto mb-4 flex w-fit gap-3 text-4xl" aria-hidden>{FACES.map((face) => <span key={face}>{face}</span>)}</div>
    <div className="mx-auto max-w-md text-left">
      <SpokenQuestion title="What work would you like to do?" sub={`You will see ${count} pictures of people at work. For each one, tap the face that shows how you feel about doing it. Or swipe the picture: right for yes, left for no.`}
        as="h2" className="text-[clamp(22px,4vw,28px)] font-extrabold leading-tight" subClassName="mt-2 text-[15px] font-semibold text-muted-foreground" />
    </div>
    <div className="mt-4 flex justify-center"><ReadToMeToggle /></div>
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {resume ? <><Button type="button" variant="brand" size="lg" onClick={() => onStart(false)}>Keep going ({resume} of {count})</Button><Button type="button" variant="surface" size="lg" onClick={() => onStart(true)}>Start over</Button></>
        : <Button type="button" variant="brand" size="lg" onClick={() => onStart(true)}>Start</Button>}
    </div>
    <p className="mt-5 text-sm font-semibold text-muted-foreground">Rather answer questions? <Link href={quizHref} className="font-extrabold text-[var(--org-primary-color)] underline">Take the interest quiz</Link></p>
  </section>
}

function Sorting({ sort, card, done, saving, onAnswer, onBack }: { sort: PictureSort; card: PictureCard; done: number; saving: boolean; onAnswer: Answer; onBack: () => void }) {
  const total = sort.cards.length
  return <section className="grid gap-4">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} disabled={!done || saving} aria-label="Back to the last picture" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><ArrowLeft className="h-5 w-5" /></button>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Pictures sorted"><div className="h-full rounded-full bg-[#8B5CF6] transition-[width] duration-300" style={{ width: `${Math.max(3, (done / total) * 100)}%` }} /></div>
      <span className="w-14 shrink-0 text-right text-sm font-extrabold tabular-nums text-muted-foreground">{Math.min(done + 1, total)}/{total}</span>
    </div>
    <PhotoCard key={card.key} card={card} disabled={saving} onAnswer={onAnswer} />
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Would you like to do this?">
      {sort.answers.map((option) => <button key={option.value} type="button" disabled={saving} onClick={() => onAnswer(option.value)}
        className="group grid min-h-[88px] content-center justify-items-center gap-1 rounded-2xl border-2 border-border bg-card py-3 shadow-[0_4px_0_hsl(var(--border))] transition-[transform,box-shadow,border-color] [@media(hover:hover)]:hover:border-[var(--face)] active:translate-y-[3px] active:shadow-[0_1px_0_hsl(var(--border))] disabled:opacity-50"
        style={{ ['--face' as any]: FACE_COLORS[option.value] }}>
        <span className="text-[38px] leading-none transition-transform [@media(hover:hover)]:group-hover:scale-110" aria-hidden>{FACES[option.value]}</span>
        <span className="text-[14px] font-extrabold">{option.label}</span>
      </button>)}
    </div>
    <p className="hidden text-center text-xs font-semibold text-muted-foreground sm:block">Tip: press ← for no, ↓ for not sure, → for yes.</p>
    {saving ? <p className="text-center text-sm font-bold text-muted-foreground">Working out your result…</p> : null}
  </section>
}

/** One photo card. Drag it right for yes or left for no; the words under it are read aloud for Read to me. */
function PhotoCard({ card, disabled, onAnswer }: { card: PictureCard; disabled: boolean; onAnswer: Answer }) {
  const el = useRef<HTMLElement>(null)
  const drag = useRef({ down: false, moved: false, x: 0, dx: 0 })
  const [dx, setDx] = useState<number | null>(null)
  const [broken, setBroken] = useState(false)
  const speechId = useSpeechId('picture')
  useAutoRead(speechId, card.text)
  const yes = dx ? Math.max(0, Math.min(1, dx / 90)) : 0
  const no = dx ? Math.max(0, Math.min(1, -dx / 90)) : 0
  const handlers = disabled ? {} : {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) return
      drag.current = { down: true, moved: false, x: event.clientX, dx: 0 }
      el.current?.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: React.PointerEvent) => {
      const state = drag.current
      if (!state.down) return
      state.dx = event.clientX - state.x
      if (Math.abs(state.dx) > 6) state.moved = true
      if (state.moved) setDx(state.dx)
    },
    onPointerUp: () => {
      const state = drag.current
      if (!state.down) return
      state.down = false
      setDx(null)
      if (state.moved && state.dx > 110) onAnswer(2)
      else if (state.moved && state.dx < -110) onAnswer(0)
    },
    onPointerCancel: () => { drag.current.down = false; setDx(null) },
  }
  return <article ref={el} {...handlers} style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 22}deg)` } : undefined}
    className={cn('relative touch-pan-y select-none overflow-hidden rounded-[28px] border-2 border-border bg-card shadow-[0_5px_0_hsl(var(--border))] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95', !disabled && 'cursor-grab active:cursor-grabbing')}>
    <div className="relative h-[min(46vh,440px)] min-h-[220px] w-full" style={{ backgroundColor: TYPE_COLORS[card.type] || '#8B5CF6' }}>
      {broken ? <div className="absolute inset-0 grid place-items-center text-white/90"><Images className="h-16 w-16" aria-hidden="true" /></div>
        : <img ref={(img) => { if (img?.complete && !img.naturalWidth) setBroken(true) }} src={card.photo} alt={card.alt || card.text} draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />}
      <span aria-hidden="true" className="absolute left-4 top-4 -rotate-12 rounded-xl border-4 border-emerald-400 bg-black/30 px-3 py-1 text-2xl font-black text-emerald-300" style={{ opacity: yes }}>YES</span>
      <span aria-hidden="true" className="absolute right-4 top-4 rotate-12 rounded-xl border-4 border-orange-400 bg-black/30 px-3 py-1 text-2xl font-black text-orange-300" style={{ opacity: no }}>NO</span>
    </div>
    <div className="flex items-center gap-3 px-5 py-4">
      <h2 className="m-0 min-w-0 flex-1 text-balance text-[clamp(22px,5vw,28px)] font-extrabold leading-tight"><ReadAloudText id={speechId} text={card.text} /></h2>
      <SpeakButton id={speechId} text={card.text} size="lg" />
    </div>
    {card.credit ? <p className="-mt-2 px-5 pb-3 text-[11px] font-semibold text-muted-foreground">
      Photo: <a href={card.credit.url} target="_blank" rel="noreferrer" className="underline">{card.credit.author}</a>, {card.credit.license}
    </p> : null}
  </article>
}
