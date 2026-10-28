'use client'

import React from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveDisplayBinding } from '@components/Learning/schema'

/**
 * The blocks version 3 pages add: the page's heading, one big number, and a deck of cards.
 * (A column break draws nothing; the page splits its blocks there.) The editor canvas renders
 * them through the same components, so what an author sees is what a learner gets.
 */

export const PAGE_BLOCKS = new Set(['heading', 'number', 'card_deck'])

const HEADING_SIZE: Record<string, string> = {
  s: 'text-xl @xl:text-2xl',
  m: 'text-2xl @xl:text-3xl',
  l: 'text-3xl @xl:text-4xl',
  xl: 'text-4xl @xl:text-6xl',
}

/** The page's heading; its words land one after another. */
function Heading({ block }: { block: any }) {
  const reduce = useReducedMotion()
  const text = String(block.content?.text || '')
  const words = text.split(/\s+/).filter(Boolean)
  const size = HEADING_SIZE[block.content?.size || 'l'] || HEADING_SIZE.l
  return <h2 className={`font-extrabold leading-[1.08] tracking-tight text-foreground [text-wrap:balance] ${size}`}>
    {reduce ? text : <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => <motion.span key={index} className="inline-block" initial={{ opacity: 0, y: '0.45em' }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}>{word}{index < words.length - 1 ? ' ' : ''}</motion.span>)}
      </span>
    </>}
  </h2>
}

function numeric(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').trim()
  return text !== '' && Number.isFinite(Number(text)) ? Number(text) : null
}

/** One big number in the brand colour, counting up as the page opens, with a line under it. */
function BigNumber({ block, run }: { block: any; run: any }) {
  const reduce = useReducedMotion()
  const content = block.content || {}
  const bound = content.binding ? (content.binding.source === 'variable' ? run?.render_context?.variables?.[String(content.binding.path || '')] : undefined) ?? resolveDisplayBinding(content.binding, run) : undefined
  const raw = bound !== undefined && bound !== null && bound !== '' ? bound : content.value
  const value = numeric(raw)
  const [shown, setShown] = React.useState(value === null || reduce ? value ?? 0 : 0)
  React.useEffect(() => {
    if (value === null) return
    if (reduce) { setShown(value); return }
    const controls = animate(0, value, { duration: Math.min(1.8, 0.7 + Math.abs(value) / 80), ease: [0.12, 0.9, 0.22, 1], onUpdate: setShown })
    return () => controls.stop()
  }, [value, reduce])
  const digits = value === null || Number.isInteger(value) ? 0 : 1
  const display = value === null ? String(raw ?? '') : shown.toFixed(digits)
  const full = `${content.prefix || ''}${value === null ? String(raw ?? '') : value}${content.suffix || ''}`
  return <figure className="flex flex-col gap-2" data-number-block>
    <p className="font-extrabold leading-none tracking-tight text-[var(--org-primary-color,#2563eb)] tabular-nums text-6xl @xl:text-8xl">
      <span className="sr-only">{full}</span>
      <span aria-hidden="true">{content.prefix}{display}{content.suffix}</span>
    </p>
    {content.label ? <figcaption className="text-lg font-semibold text-muted-foreground">{content.label}</figcaption> : null}
  </figure>
}

/** Cards the learner taps or swipes through one at a time, with dots for where they are. */
function CardDeck({ block }: { block: any }) {
  const reduce = useReducedMotion()
  const cards: any[] = block.content?.cards || []
  const [at, setAt] = React.useState(0)
  const [direction, setDirection] = React.useState(1)
  if (!cards.length) return null
  const index = Math.min(at, cards.length - 1)
  const card = cards[index]
  const go = (next: number) => {
    if (next < 0 || next >= cards.length) return
    setDirection(next > index ? 1 : -1)
    setAt(next)
  }
  const arrow = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:border-foreground/30 disabled:opacity-30'
  return <section className="flex flex-col gap-4" aria-roledescription="carousel" aria-label="Cards" data-card-deck>
    <div className="relative grid min-h-[16rem] place-items-center">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.article key={card.id || index} aria-roledescription="slide" aria-label={`${index + 1} of ${cards.length}`}
          className="grid w-full max-w-sm gap-3 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-[0_18px_40px_hsl(220_40%_10%/0.1)]"
          initial={reduce ? false : { x: 48 * direction, rotate: 4 * direction, opacity: 0 }} animate={{ x: 0, rotate: 0, opacity: 1 }} exit={reduce ? undefined : { x: -48 * direction, opacity: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          drag={reduce ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4}
          onDragEnd={(_, info) => { if (info.offset.x < -60) go(index + 1); else if (info.offset.x > 60) go(index - 1) }}>
          {card.image ? <img src={card.image} alt="" className="h-36 w-full rounded-2xl object-cover" draggable={false} /> : null}
          {card.title ? <h3 className="text-2xl font-extrabold tracking-tight">{card.title}</h3> : null}
          {card.body ? <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">{card.body}</p> : null}
        </motion.article>
      </AnimatePresence>
    </div>
    {cards.length > 1 ? <div className="flex items-center justify-center gap-4">
      <button type="button" aria-label="Previous card" className={arrow} disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={18} /></button>
      <div className="flex gap-1.5" aria-hidden="true">
        {cards.map((item, position) => <i key={item.id || position} className={`block h-[7px] rounded-full transition-all ${position === index ? 'w-[22px] bg-[var(--org-primary-color,#2563eb)]' : position < index ? 'w-[7px] bg-[var(--org-primary-color,#2563eb)] opacity-45' : 'w-[7px] bg-border'}`} />)}
      </div>
      <button type="button" aria-label="Next card" className={arrow} disabled={index === cards.length - 1} onClick={() => go(index + 1)}><ChevronRight size={18} /></button>
    </div> : null}
  </section>
}

export default function PageBlock({ block, run, style }: { block: any; run: any; style?: React.CSSProperties }) {
  const view = block.type === 'heading' ? <Heading block={block} /> : block.type === 'number' ? <BigNumber block={block} run={run} /> : <CardDeck block={block} />
  return <section className="learning-info-stack-section" style={style} data-block-type={block.type}>{view}</section>
}
