'use client'

/* eslint-disable no-unused-vars -- parameter names in function types */
import React from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarBlank, Wallet } from '@phosphor-icons/react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LifeDoc } from '@services/life/life'
import useLifeNumbers from '@components/LifePlan/useLifeNumbers'
import { money, project, short, type Projection } from '@components/LifePlan/model'
import { monthText, routeDoc } from './graph'
import { gapsOf, howLong, leftAMonth, moneyAt, spanOf, waysOf, type Span } from './compare'
import CompareChart, { WAY_COLORS, WAY_STYLE } from './CompareChart'

import { tr } from '@/lib/tr'
const SPANS = (): [Span, string][] => ([['options', tr('lit.plan_compare.the_options', 'The options')], ['ten', tr('lit.plan_compare.ten_years', '10 years')], ['all', tr('lit.plan_compare.whole_plan', 'Whole plan')]])

/** A split's options side by side: what each does to your savings and debt, over the options or long after. */
export default function PlanCompare({ doc, orgslug, token, only, onBack }: { doc: LifeDoc; orgslug: string; token?: string; only: string[]; onBack: () => void }) {
  const { valueOf } = useLifeNumbers(doc, token)
  const [span, setSpan] = React.useState<Span>('options')
  const ids = only.slice(0, WAY_COLORS.length)
  const projs = Object.fromEntries(ids.map((id) => [id, project(routeDoc(doc, id), valueOf)])) as Record<string, Projection>
  const ways = waysOf(doc, ids, (id) => projs[id]?.months ?? 0)
  if (ways.length < 2) return <div className="flex flex-col gap-4"><Back onBack={onBack} /><p className="text-muted-foreground">{tr('goals.plan_compare.compare_needs_two_options_or', 'Compare needs two options or more.')}</p></div>
  const [a, b] = spanOf(ways, span), split = Math.min(...ways.map((w) => w.start))
  const gaps = gapsOf(ways)
  const short_ = ways.filter((w) => w.last < b && span !== 'options')
  const open = (id: string) => getUriWithOrg(orgslug, routePaths.org.phase(id))
  const endOf = (w: typeof ways[number]) => moneyAt(w, projs[w.id], Math.min(b, w.last))
  const row = (label: string, note: string, f: (w: typeof ways[number], i: number) => React.ReactNode) => (
    <tr className="border-t border-border"><th scope="row" className="py-2.5 pr-3 text-left align-top"><span className="text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>{note && <><br /><small className="text-[11px] text-muted-foreground">{note}</small></>}</th>{ways.map((w, i) => <td key={w.id} className="py-2.5 pr-4 align-top tabular-nums">{f(w, i)}</td>)}</tr>
  )
  return (
    <div className="way-colors flex flex-col gap-4">
      <style>{WAY_STYLE}</style>
      <Back onBack={onBack} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{tr('goals.plan_compare.compare', 'Compare')}</p>
        <h2 className="text-3xl font-extrabold tracking-tight">{ways.map((w) => w.title).join(tr('goals.plan_compare.or', ' or '))}</h2>
        <p className="text-muted-foreground">{tr('goals.plan_compare.what_each_option_does_to', 'What each option does to your savings and debt.')}</p>
      </div>
      <div role="radiogroup" aria-label={tr('goals.plan_compare.how_far_to_look', 'How far to look')} className="flex w-fit flex-wrap gap-1 rounded-2xl bg-muted p-1">
        {SPANS().map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={span === k} onClick={() => setSpan(k)} className={`h-9 rounded-xl px-3 text-sm font-bold ${span === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
      </div>
      <div className="rounded-[22px] bg-card p-4 shadow-[0_0_0_2px_hsl(var(--border))]">
        <p className="mb-3 text-sm font-bold">{tr('goals.plan_compare.monthtext_to_monthtext2', '{{monthText}} to {{monthText2}}', { monthText: monthText(a), monthText2: monthText(b) })}</p>
        <CompareChart ways={ways} projs={projs} a={a} b={b} split={split} />
        {short_.length > 0 && <p className="mt-3 text-sm text-muted-foreground">{short_.map((w) => tr('goals.plan_compare.stops_in', '{{title}} stops in {{month}}', { title: w.title, month: monthText(w.last) })).join('; ')}{tr('goals.plan_compare.add_what_comes_after_to', '. Add what comes after to see further.')}</p>}
      </div>
      <div className="overflow-x-auto rounded-[22px] bg-card p-4 shadow-[0_0_0_2px_hsl(var(--border))]">
        <table className="w-full text-sm" style={{ minWidth: ways.length > 2 ? 110 + 130 * ways.length : undefined }}>
          <thead><tr><th />{ways.map((w, i) => <th key={w.id} scope="col" className="pb-2 pr-4 text-left text-base font-extrabold"><span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: WAY_COLORS[i] }} />{w.title}</span></th>)}</tr></thead>
          <tbody>
            {row(tr('lit.plan_compare.takes', 'Takes'), '', (w) => <>{howLong(w.end - w.start)}<br /><small className="text-muted-foreground">{tr('goals.plan_compare.monthtext_to_monthtext2', '{{monthText}} to {{monthText2}}', { monthText: monthText(w.start), monthText2: monthText(w.end) })}</small></>)}
            {row(tr('lit.plan_compare.left_a_month', 'Left a month'), tr('goals.plan_compare.on_average_after_tax', 'on average, after tax'), (w) => w.piece.some((p) => p.lines.length) ? <b className={leftAMonth(w, projs[w.id]) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{money(Math.round(leftAMonth(w, projs[w.id])), { sign: true })}</b> : <span className="text-muted-foreground">{tr('goals.plan_compare.no_budget_yet', 'No budget yet')}</span>)}
            {row(tr('lit.plan_compare.saved', 'Saved'), tr('goals.plan_compare.with_what_you_own_by', 'with what you own, by {{month}}', { month: monthText(b) }), (w) => { const v = endOf(w); return v ? <b>{short(v.saved)}</b> : '—' })}
            {row(tr('lit.plan_compare.owed', 'Owed'), tr('goals.plan_compare.by_month', 'by {{month}}', { month: monthText(b) }), (w) => { const v = endOf(w); return v ? (v.owed > 0.5 ? short(v.owed) : tr('lit.plan_compare.nothing', 'Nothing')) : '—' })}
          </tbody>
        </table>
      </div>
      {gaps.length > 0 && (
        <div className="rounded-[22px] bg-card p-4 shadow-[0_0_0_2px_hsl(var(--border))]">
          <p className="font-extrabold">{tr('goals.plan_compare.fill_these_in_for_a', 'Fill these in for a fairer compare')}</p>
          <p className="mb-2 text-sm text-muted-foreground">{tr('goals.plan_compare.a_phase_with_no_budget', 'A phase with no budget counts as nothing in or out, so its line stays flat.')}</p>
          <ul className="flex flex-col gap-1.5">
            {gaps.map(({ phase, what }) => (
              <li key={phase.id}><Link href={open(phase.id)} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-bold hover:bg-muted/70">
                {what === 'date' ? <CalendarBlank size={18} aria-hidden="true" /> : <Wallet size={18} aria-hidden="true" />}
                <span className="flex-1">{phase.title}</span><span className="text-muted-foreground">{what === 'date' ? tr('goals.plan_compare.pick_how_long', 'Pick how long it lasts') : tr('goals.plan_compare.add_a_budget', 'Add a budget')}</span>
              </Link></li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{tr('goals.plan_compare.budgets_start_from_sourced_estimates', 'Budgets start from sourced estimates (BLS pay, HUD rent) and your own numbers. Things you own count as savings at what they’re worth, so buying a car doesn’t look like money lost.')}</p>
    </div>
  )
}

function Back({ onBack }: { onBack: () => void }) {
  return <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />{tr('goals.plan_compare.map', 'Map')}</button>
}
