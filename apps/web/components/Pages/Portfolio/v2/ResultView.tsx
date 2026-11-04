'use client'

import type { PortfolioResult } from '../portfolioTypes'
import { chipTexts, templateOf, type ResultTemplate } from './resultTemplates'

// A result drawn the way its assessment is usually shown: RIASEC as a six-point web, Big Five as bars,
// a type as its letters or number, top strengths as a ranked list. Results without a template are a line.

const VIOLET = '#8B5CF6'

/** A spider chart of scores around a circle; small on a tile, larger in the dialog. */
export function Radar({ scores, axes, max, size = 168 }: { scores: Record<string, number>; axes: Array<{ key: string; label: string }>; max: number; size?: number }) {
  const center = size / 2, radius = size / 2 - 26
  const point = (index: number, value: number) => { const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2; const r = radius * Math.max(0, Math.min(1, value / max)); return [center + r * Math.cos(angle), center + r * Math.sin(angle)] }
  const ring = (level: number) => axes.map((_, index) => point(index, max * level).join(',')).join(' ')
  const shape = axes.map((axis, index) => point(index, Number(scores[axis.key] || 0)).join(',')).join(' ')
  return <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={axes.map((axis) => `${axis.label} ${scores[axis.key] ?? 0} of ${max}`).join(', ')} className="shrink-0 overflow-visible">
    {[0.25, 0.5, 0.75, 1].map((level) => <polygon key={level} points={ring(level)} fill="none" stroke="currentColor" strokeOpacity={0.14} />)}
    {axes.map((axis, index) => { const [x, y] = point(index, max); return <line key={axis.key} x1={center} y1={center} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.14} /> })}
    <polygon points={shape} fill={VIOLET} fillOpacity={0.3} stroke={VIOLET} strokeWidth={2} strokeLinejoin="round" />
    {axes.map((axis, index) => { const [x, y] = point(index, max * 1.22); return <text key={axis.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-current text-[12px] font-extrabold">{axis.key}</text> })}
  </svg>
}

function Bars({ template, scores }: { template: Extract<ResultTemplate, { input: 'scores' }>; scores: Record<string, number> }) {
  return <div className="grid w-full gap-1.5">{template.scores.map((item) => <div key={item.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-2 text-[12.5px] font-bold">
    <span className="truncate text-muted-foreground">{item.label}</span>
    <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${Math.round((Number(scores[item.key] || 0) / template.max) * 100)}%`, background: VIOLET }} /></span>
  </div>)}</div>
}

/** The picture for a result, or nothing when it has no template. */
export function ResultPicture({ result, compact = false }: { result: Pick<PortfolioResult, 'data'>; compact?: boolean }) {
  const template = templateOf(result)
  const data = result.data || {}
  if (!template) return null
  if (template.input === 'scores') {
    const scores = data.scores || {}
    const max = Number(data.max || template.max)
    return template.id === 'riasec' ? <Radar scores={scores} axes={template.scores} max={max} size={compact ? 132 : 200} /> : <Bars template={{ ...template, max }} scores={scores} />
  }
  if (template.input === 'chips') return <div className="grid w-full gap-2.5 text-left">{template.groups.map((group) => { const words = chipTexts(template, data, group.key); return words.length ? <div key={group.key} className="grid gap-1.5" data-chip-group={group.key}>
    <small className="text-[11.5px] font-extrabold uppercase tracking-wide text-muted-foreground">{group.label}</small>
    <ul className="flex flex-wrap gap-1.5">{words.slice(0, compact ? 6 : undefined).map((word) => <li key={word} className="inline-flex h-8 items-center rounded-full border-2 border-border bg-card px-3 text-[13px] font-bold">{word}</li>)}{compact && words.length > 6 ? <li className="inline-flex h-8 items-center px-1 text-[13px] font-bold text-muted-foreground">+{words.length - 6}</li> : null}</ul>
  </div> : null })}</div>
  if (template.input === 'type') return data.type ? <span className="inline-flex items-center rounded-2xl px-4 py-2 text-[28px] font-black tracking-wider text-white" style={{ background: VIOLET, boxShadow: '0 4px 0 #6539D8' }}>{data.type}</span> : null
  return <ol className="flex flex-wrap gap-1.5">{(data.top || []).map((theme: string, index: number) => <li key={theme} className="inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 text-[13px] font-bold"><b className="text-[#6539D8] dark:text-[#b9a2ff]">{index + 1}</b>{theme}</li>)}</ol>
}
