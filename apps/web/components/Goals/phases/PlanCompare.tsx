'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LifeDoc, Phase } from '@services/life/life'
import useLifeNumbers from '@components/LifePlan/useLifeNumbers'
import { money, project } from '@components/LifePlan/model'
import { isReal, mi, monthText, routeDoc, routeName, routes, thisMonthIndex } from './graph'

/** Every way through the map at one moment, side by side: where you'd be and what the money looks like. */
export default function PlanCompare({ doc, orgslug, token, onBack }: { doc: LifeDoc; orgslug: string; token?: string; onBack: () => void }) {
  const { valueOf } = useLifeNumbers(doc, token)
  const [at, setAt] = React.useState(() => thisMonthIndex() + 60)
  const all = routes(doc)
  const cols = all.map((r) => {
    let ph: Phase | null = null
    for (const p of r) if (mi(p.starts!) <= at) ph = p
    if (!ph) return null
    const rd = routeDoc(doc, r[r.length - 1].id)
    const proj = project(rd, valueOf)
    const g = Math.min(proj.months, Math.max(0, at - mi(rd.start)))
    const g0 = Math.min(proj.months, Math.max(0, thisMonthIndex() - mi(rd.start)))
    const net = (proj.inn[g] ?? 0) - (proj.out[g] ?? 0)
    const worth = (proj.sav[g] ?? 0) + (proj.own[g] ?? 0) - (proj.debt[g] ?? 0) - ((proj.sav[g0] ?? 0) + (proj.own[g0] ?? 0) - (proj.debt[g0] ?? 0))
    return { r, ph, net, worth, real: isReal(doc, ph) }
  }).filter(Boolean) as { r: Phase[]; ph: Phase; net: number; worth: number; real: boolean }[]
  const seen = new Set<string>()
  const years = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() + i)
  const row = (label: string, f: (c: typeof cols[number]) => React.ReactNode) => <tr className="border-t border-border"><th scope="row" className="py-3 pr-3 text-left text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{label}</th>{cols.map((c, i) => <td key={i} className="py-3 pr-4 align-top">{f(c)}</td>)}</tr>
  return <div className="flex flex-col gap-4">
    <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />Map</button>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Compare</p><h2 className="text-3xl font-extrabold tracking-tight">{monthText(at)}</h2><p className="text-muted-foreground">Where each way through your map has you at that moment.</p></div>
      <span className="inline-flex gap-1.5">
        <select aria-label="Month" className="h-10 rounded-xl bg-muted px-2 font-bold" value={at % 12} onChange={(e) => setAt(Math.floor(at / 12) * 12 + Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{monthText(2000 * 12 + i).slice(0, 3)}</option>)}</select>
        <select aria-label="Year" className="h-10 rounded-xl bg-muted px-2 font-bold" value={Math.floor(at / 12)} onChange={(e) => setAt(Number(e.target.value) * 12 + (at % 12))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
      </span>
    </div>
    <div className="overflow-x-auto rounded-[22px] bg-card p-4 shadow-[0_0_0_2px_hsl(var(--border))]">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr><th />{cols.map((c, i) => <th key={i} scope="col" className="pb-2 pr-4 text-left text-base font-extrabold">{routeName(c.r, all)}</th>)}</tr></thead>
        <tbody>
          {row('You’d be', (c) => <><b className="font-extrabold">{c.ph.title}</b>{c.ph.idea ? <span className="text-muted-foreground"> · idea</span> : null}<br /><small className="text-muted-foreground">since {monthText(c.ph.starts!)}</small></>)}
          {row('Where', (c) => c.ph.place_label || '—')}
          {row('Left a month', (c) => c.ph.lines.length ? <b className={c.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{money(c.net, { sign: true })}</b> : <span className="text-muted-foreground">No budget yet</span>)}
          {row('Saved up by then', (c) => <><b>{money(c.worth, { sign: true })}</b><br /><small className="text-muted-foreground">from today, after tax</small></>)}
          {row('', (c) => seen.has(c.ph.id) ? null : (seen.add(c.ph.id), <Button size="sm" variant="surface" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.phase(c.ph.id))}>Open {c.ph.title}</Link></Button>))}
        </tbody>
      </table>
    </div>
    <p className="text-sm text-muted-foreground">Each phase’s budget starts from sourced estimates (BLS pay, HUD rent) and your own numbers. A phase with no budget yet counts as nothing in or out.</p>
  </div>
}
