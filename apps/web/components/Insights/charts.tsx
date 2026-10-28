'use client'

import React from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight } from 'lucide-react'
import type { CardResult, Cell, ResultRow, SeriesPoint } from '@services/insights/insights'
import { cn } from '@/lib/utils'

// The bodies a card can show, one per chart (engine.SHAPE_CHARTS). Lines and columns use Recharts; ranked
// bars, splits and heatmaps are plain HTML so their labels stay readable text and every value is a button.

export type Drill = (key: string | null | undefined, title: string) => void // eslint-disable-line no-unused-vars
export type LinkFor = (row: ResultRow) => string | null // eslint-disable-line no-unused-vars

const STATUS_COLORS: Record<string, string> = {
  finished: 'var(--viz-series)', on_track: 'var(--viz-good)', behind: 'var(--viz-warning)', quiet: 'var(--viz-neutral)',
}
// Fixed categorical order (the dataviz reference palette); a column keeps its color whatever its rank.
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const colorFor = (key: string, index: number) => STATUS_COLORS[key] || CATEGORICAL[index % CATEGORICAL.length]

const axisTick = { fill: 'var(--viz-muted)', fontSize: 11 }
const pct = (result: CardResult) => result.kind === 'rate'

function formatValue(result: CardResult, value: number | null | undefined): string {
  if (value == null) return '–'
  if (pct(result)) return `${Math.round(value * 100)}%`
  if (result.kind === 'median') return `${Math.round(value)} ${result.unit === 'hours' ? 'h' : 'd'}`
  return Math.round(value).toLocaleString()
}

function ChartTooltip({ active, payload, result }: { active?: boolean; payload?: any[]; result: CardResult }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as SeriesPoint & { ghost?: number | null }
  return <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
    <b className="block text-foreground">{point.period}</b>
    <span className="text-muted-foreground">{formatValue(result, point.v)}{result.kind === 'rate' && point.n ? ` of ${point.n}` : ''}</span>
    {point.ghost != null ? <span className="block text-muted-foreground">Last year {formatValue(result, point.ghost)}</span> : null}
  </div>
}

function seriesData(result: CardResult) {
  const series = result.series
  if (!series) return []
  return series.points.map((point, index) => ({ ...point, ghost: series.ghost ? series.ghost[index] : null }))
}

function onPoint(drill: Drill) {
  return (state: any) => {
    const point = state?.activePayload?.[0]?.payload as SeriesPoint | undefined
    if (point?.drill) drill(point.drill, point.period)
  }
}

export function LineBody({ result, drill, height = 190 }: { result: CardResult; drill: Drill; height?: number }) {
  const data = seriesData(result)
  const ghost = data.some((point) => point.ghost != null)
  return <div>
    {ghost ? <div className="mb-1 flex gap-3 text-[11.5px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded bg-[var(--viz-series)]" />This period</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded border-t-2 border-dashed border-[var(--viz-ghost)]" />Last year</span>
    </div> : null}
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }} onClick={onPoint(drill)}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--viz-axis)' }} interval="preserveStartEnd" minTickGap={18} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={44}
          tickFormatter={(value) => pct(result) ? `${Math.round(value * 100)}%` : String(value)} />
        <Tooltip content={<ChartTooltip result={result} />} cursor={{ stroke: 'var(--viz-axis)' }} />
        {ghost ? <Line dataKey="ghost" stroke="var(--viz-ghost)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls /> : null}
        <Line dataKey="v" stroke="var(--viz-series)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }}
          isAnimationActive={false} connectNulls={result.kind === 'rate' || result.kind === 'median'} />
      </LineChart>
    </ResponsiveContainer>
  </div>
}

export function ColumnsBody({ result, drill, height = 190 }: { result: CardResult; drill: Drill; height?: number }) {
  const data = result.series ? seriesData(result) : result.rows.map((row) => ({ ...row, period: row.label }))
  return <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }} onClick={onPoint(drill)} barCategoryGap={2}>
      <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--viz-axis)' }} interval="preserveStartEnd" minTickGap={18} />
      <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={44}
        tickFormatter={(value) => pct(result) ? `${Math.round(value * 100)}%` : String(value)} />
      <Tooltip content={<ChartTooltip result={result} />} cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }} />
      <Bar dataKey="v" fill="var(--viz-series)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} className="cursor-pointer" />
    </BarChart>
  </ResponsiveContainer>
}

/** The headline number, its window's trend as a sparkline, and the comparison. */
export function NumberBody({ result }: { result: CardResult }) {
  const data = seriesData(result)
  return <div className="flex items-end justify-between gap-3">
    <b className="text-[34px] font-extrabold leading-none tracking-tight text-foreground">{result.value.text}</b>
    {data.length > 2 ? <div className="h-9 w-28 shrink-0" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line dataKey="v" stroke="var(--viz-series)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div> : null}
  </div>
}

function RowLabel({ row, href }: { row: ResultRow; href: string | null }) {
  if (!href) return <span className="truncate">{row.label}</span>
  return <Link href={href} className="group/link inline-flex min-w-0 items-center gap-1 hover:underline" title={`Open ${row.label}`}>
    <span className="truncate">{row.label}</span><ArrowRight size={12} className="shrink-0 opacity-0 group-hover/link:opacity-70" aria-hidden="true" />
  </Link>
}

/** Ranked rows as horizontal bars: label (opens its own dashboard when it has one), bar, value (opens who). */
export function BarsBody({ result, drill, linkFor }: { result: CardResult; drill: Drill; linkFor: LinkFor }) {
  const max = Math.max(...result.rows.map((row) => row.v || 0), pct(result) ? 1 : 0) || 1
  return <ul className="space-y-1.5">
    {result.rows.map((row) => <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2.5 text-[13px]">
      <span className="min-w-0 font-semibold text-foreground"><RowLabel row={row} href={linkFor(row)} /></span>
      <button type="button" onClick={() => drill(row.drill, row.label)} disabled={!row.drill} aria-label={`${row.label}: ${row.text}${row.drill ? '. See who' : ''}`}
        className="group/bar h-5 rounded-[4px] text-left disabled:cursor-default">
        <span className={cn('block h-full rounded-[4px] bg-[var(--viz-series)] transition-opacity group-hover/bar:opacity-80', row.few && 'opacity-50')}
          style={{ width: `${Math.max(2, ((row.v || 0) / max) * 100)}%` }} />
      </button>
      <span className="min-w-[3.5rem] text-right tabular-nums text-foreground">{row.text}{row.change ? <small className="ml-1 text-[11px] text-muted-foreground">{row.change}</small> : null}</span>
    </li>)}
    {result.more ? <li className="pl-1 text-[12px] text-muted-foreground">{result.more.label}: {result.more.text}</li> : null}
  </ul>
}

function Legend({ items }: { items: Array<{ key: string; label: string; color: string; text?: string }> }) {
  return <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted-foreground">
    {items.map((item) => <li key={item.key} className="inline-flex items-center gap-1.5">
      <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />{item.label}{item.text ? <b className="font-semibold text-foreground">{item.text}</b> : null}
    </li>)}
  </ul>
}

function Stack({ parts, drill, label }: { parts: Array<{ key: string; label: string; v: number; color: string; drill?: string | null }>; drill: Drill; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.v, 0)
  if (!total) return <div className="h-5 rounded-[4px] bg-muted" />
  return <div className="flex h-5 gap-[2px]" role="group" aria-label={label}>
    {parts.filter((part) => part.v > 0).map((part) => <button key={part.key} type="button" onClick={() => drill(part.drill, `${label}: ${part.label}`)}
      title={`${part.label}: ${part.v.toLocaleString()}`} aria-label={`${part.label}: ${part.v}${part.drill ? '. See who' : ''}`}
      className="h-full first:rounded-l-[4px] last:rounded-r-[4px] hover:opacity-80" style={{ width: `${(part.v / total) * 100}%`, background: part.color }} />)}
  </div>
}

/** A split of one total (learner status) as one stacked bar, or each row of a cross as its own. */
export function StackedBody({ result, drill, linkFor }: { result: CardResult; drill: Drill; linkFor: LinkFor }) {
  if (result.shape === 'split') {
    const parts = result.rows.map((row, index) => ({ key: row.key, label: row.label, v: row.v || 0, color: colorFor(row.key, index), drill: row.drill }))
    return <div className="space-y-3">
      <Stack parts={parts} drill={drill} label={result.headline} />
      <ul className="grid grid-cols-2 gap-2">
        {result.rows.map((row, index) => <li key={row.key}>
          <button type="button" onClick={() => drill(row.drill, row.label)} disabled={!row.drill}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:hover:bg-transparent">
            <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colorFor(row.key, index) }} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{row.label}</span>
            <b className="tabular-nums text-[15px] text-foreground">{row.text}</b>
          </button>
        </li>)}
      </ul>
    </div>
  }
  const colors = result.columns.map((column, index) => colorFor(column.key, index))
  return <div className="space-y-3">
    <Legend items={result.columns.map((column, index) => ({ key: column.key, label: column.label, color: colors[index] }))} />
    <ul className="space-y-1.5">
      {result.rows.map((row) => <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2.5 text-[13px]">
        <span className="min-w-0 font-semibold text-foreground"><RowLabel row={row} href={linkFor(row)} /></span>
        <Stack drill={drill} label={row.label} parts={(row.cells || []).map((cell, index) => ({ key: result.columns[index].key, label: result.columns[index].label, v: cell.v || 0, color: colors[index], drill: cell.drill }))} />
        <span className="min-w-[2.5rem] text-right tabular-nums text-foreground">{row.text}</span>
      </li>)}
    </ul>
  </div>
}

/** A cross as a grid of shaded cells: one hue, darker for more. */
export function HeatmapBody({ result, drill, linkFor }: { result: CardResult; drill: Drill; linkFor: LinkFor }) {
  const values = result.rows.flatMap((row) => (row.cells || []).map((cell) => cell.v || 0))
  const max = Math.max(...values, 0) || 1
  const shade = (cell: Cell) => `color-mix(in oklab, var(--viz-series) ${Math.round(12 + ((cell.v || 0) / max) * 78)}%, var(--viz-surface))`
  return <div className="overflow-x-auto">
    <table className="w-full border-separate border-spacing-[2px] text-[12.5px]">
      <thead><tr><th />{result.columns.map((column) => <th key={column.key} scope="col" className="px-1 pb-1 text-left font-semibold text-muted-foreground">{column.label}</th>)}</tr></thead>
      <tbody>{result.rows.map((row) => <tr key={row.key}>
        <th scope="row" className="max-w-[9rem] pr-2 text-left font-semibold text-foreground"><RowLabel row={row} href={linkFor(row)} /></th>
        {(row.cells || []).map((cell, index) => {
          const dark = (cell.v || 0) / max > 0.55
          return <td key={result.columns[index].key} className="p-0">
            <button type="button" onClick={() => drill(cell.drill, `${row.label}: ${result.columns[index].label}`)} disabled={!cell.drill}
              className={cn('h-8 w-full min-w-[3rem] rounded-[4px] px-1.5 text-center tabular-nums hover:ring-2 hover:ring-[var(--viz-axis)]', dark ? 'text-white' : 'text-foreground')}
              style={{ background: shade(cell) }}>{cell.text}</button>
          </td>
        })}
      </tr>)}</tbody>
    </table>
  </div>
}

/** Every value as a table: the accessible view of any card. */
export function TableBody({ result, drill, linkFor }: { result: CardResult; drill: Drill; linkFor: LinkFor }) {
  const rows: Array<{ key: string; label: React.ReactNode; text: string; change: string; drill: string | null | undefined; title: string }> = result.series
    ? result.series.points.map((point) => ({ key: point.key, label: point.period, text: formatValue(result, point.v), change: '', drill: point.drill, title: point.period }))
    : result.rows.length
      ? result.rows.map((row) => ({ key: row.key, label: <RowLabel row={row} href={linkFor(row)} />, text: row.text, change: row.change, drill: row.drill, title: row.label }))
      : [{ key: 'all', label: 'All', text: result.value.text, change: result.compare?.change || '', drill: result.drill, title: result.headline }]
  return <div className="max-h-[260px] overflow-y-auto">
    <table className="w-full text-[13px]">
      <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-border last:border-0">
        <td className="py-1.5 pr-2 font-semibold text-foreground">{row.label}</td>
        <td className="py-1.5 text-right tabular-nums text-foreground">
          {row.drill ? <button type="button" onClick={() => drill(row.drill, row.title)} className="hover:underline">{row.text}</button> : row.text}
        </td>
        <td className="w-16 py-1.5 text-right text-[11.5px] text-muted-foreground">{row.change}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function CardBody({ result, chart, drill, linkFor }: { result: CardResult; chart: CardResult['chart']; drill: Drill; linkFor: LinkFor }) {
  switch (chart) {
    case 'number': return <NumberBody result={result} />
    case 'line': return <LineBody result={result} drill={drill} />
    case 'columns': return <ColumnsBody result={result} drill={drill} />
    case 'bars': return <BarsBody result={result} drill={drill} linkFor={linkFor} />
    case 'stacked': return <StackedBody result={result} drill={drill} linkFor={linkFor} />
    case 'heatmap': return <HeatmapBody result={result} drill={drill} linkFor={linkFor} />
    default: return <TableBody result={result} drill={drill} linkFor={linkFor} />
  }
}
