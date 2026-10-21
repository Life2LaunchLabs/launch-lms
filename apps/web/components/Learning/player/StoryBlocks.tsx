'use client'

import React from 'react'
import { animate, motion, useReducedMotion } from 'motion/react'
import { Star } from 'lucide-react'
import { resolveDisplayBinding } from '@components/Learning/schema'

/**
 * Blocks that tell a story with numbers and words: a stat row, a pull quote, a bar chart and a
 * medal. Any activity can use them; each owns its motion (numbers count up, bars grow, a quote
 * fades in by line, a medal lands), and all of it stops with reduced motion. Values are literal
 * or read from a variable through ``binding`` (for example ``goal.stats.steps_done``).
 */

export const STORY_BLOCKS = new Set(['stat', 'quote', 'chart', 'medal'])

function variable(binding: any, run: any): any {
  if (!binding) return undefined
  if (binding.source === 'variable') {
    const value = run?.render_context?.variables?.[String(binding.path || '')]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return resolveDisplayBinding(binding, run) || undefined
}

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = React.useState(reduce ? value : 0)
  React.useEffect(() => {
    if (reduce) { setShown(value); return }
    const controls = animate(0, value, { duration: Math.min(1.6, 0.6 + value / 60), ease: 'easeOut', onUpdate: (latest) => setShown(latest) })
    return () => controls.stop()
  }, [value, reduce])
  const digits = Number.isInteger(value) ? 0 : 1
  return <span aria-hidden="true">{shown.toFixed(digits)}</span>
}

function Stat({ block, run }: { block: any; run: any }) {
  const items = (block.content?.items || []).map((item: any) => ({ label: item.label || '', value: variable(item.binding, run) ?? item.value ?? '' }))
  return <dl className={`grid gap-4 ${items.length > 2 ? 'grid-cols-3' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
    {items.map((item: any, index: number) => {
      const number = typeof item.value === 'number' ? item.value : Number.isFinite(Number(item.value)) && String(item.value).trim() !== '' ? Number(item.value) : null
      return <div key={index} className="flex flex-col-reverse items-center gap-1 text-center">
        <dt className="text-sm font-semibold text-muted-foreground">{item.label}</dt>
        <dd className="text-5xl font-extrabold tabular-nums tracking-tight text-foreground sm:text-6xl">
          <span className="sr-only">{String(item.value)}</span>
          {number === null ? <span aria-hidden="true">{String(item.value)}</span> : <CountUp value={number} />}
        </dd>
      </div>
    })}
  </dl>
}

function Quote({ block, run }: { block: any; run: any }) {
  const reduce = useReducedMotion()
  const text = String(variable(block.content?.binding, run) ?? block.content?.text ?? '')
  const lines = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  return <figure className="text-center">
    <blockquote className="text-2xl font-bold leading-snug text-foreground sm:text-3xl">
      {lines.map((line, index) => <motion.span key={index} className="inline" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + index * 0.6, duration: 0.7 }}>{index ? ' ' : '“'}{line}{index === lines.length - 1 ? '”' : ''}</motion.span>)}
    </blockquote>
    {block.content?.attribution ? <figcaption className="mt-4 text-sm font-semibold text-muted-foreground">{block.content.attribution}</figcaption> : null}
  </figure>
}

function Chart({ block, run }: { block: any; run: any }) {
  const reduce = useReducedMotion()
  const bound = variable(block.content?.binding, run)
  const values: number[] = (Array.isArray(bound) ? bound : block.content?.values || []).map((value: any) => Math.max(0, Number(value) || 0))
  const labels: string[] = block.content?.labels || []
  const top = Math.max(1, ...values)
  const summary = values.map((value, index) => `${labels[index] || `${index + 1}`}: ${value}`).join(', ')
  return <figure className="w-full">
    {block.content?.title ? <figcaption className="mb-3 text-center text-sm font-semibold text-muted-foreground">{block.content.title}</figcaption> : null}
    <div role="img" aria-label={`${block.content?.title || 'Chart'}. ${summary}`} className="flex h-44 items-end gap-1.5 sm:gap-2">
      {values.map((value, index) => <div key={index} className="flex h-full min-w-0 flex-1 flex-col justify-end">
        <motion.div className="w-full rounded-t-md bg-[var(--org-primary-color,#8b5cf6)]" style={{ height: `${Math.max(value ? 6 : 2, (value / top) * 100)}%`, transformOrigin: 'bottom' }}
          initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.2 + index * 0.06, duration: 0.6, ease: 'easeOut' }} />
      </div>)}
    </div>
    {labels.length ? <div aria-hidden="true" className="mt-2 flex justify-between text-[11px] font-semibold text-muted-foreground"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div> : null}
  </figure>
}

function Medal({ block }: { block: any }) {
  const reduce = useReducedMotion()
  const { title = '', subtitle = '', image = '' } = block.content || {}
  return <div className="flex flex-col items-center gap-4 text-center">
    <motion.div aria-hidden="true" initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.2 }}
      className="flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 p-2 shadow-[0_0_60px_rgba(251,191,36,0.45)]">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-4 border-amber-100/70 bg-amber-500">
        {image ? <img src={image} alt="" className="h-24 w-24 object-contain" /> : <Star size={56} className="fill-amber-100 text-amber-100" />}
      </div>
    </motion.div>
    <div>
      {subtitle ? <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{subtitle}</p> : null}
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">{title}</p>
    </div>
  </div>
}

export default function StoryBlock({ block, run, style }: { block: any; run: any; style?: React.CSSProperties }) {
  const view = block.type === 'stat' ? <Stat block={block} run={run} /> : block.type === 'quote' ? <Quote block={block} run={run} />
    : block.type === 'chart' ? <Chart block={block} run={run} /> : <Medal block={block} />
  return <section className="learning-info-stack-section" style={style}>{view}</section>
}
