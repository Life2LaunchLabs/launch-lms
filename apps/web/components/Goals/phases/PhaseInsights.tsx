'use client'

import React from 'react'
import useSWR from 'swr'
import { Briefcase, GraduationCap, MapPin } from 'lucide-react'
import { lifeApi, type Career, type Estimate, type Phase } from '@services/life/life'
import { money, short } from '@components/LifePlan/model'
import { levelOf } from './setup'

import { tr } from '@/lib/tr'
const TRAINING: Record<number, string> = {
  1: 'Little or no training: most people learn on the job',
  2: 'Usually a high school diploma',
  3: 'Training after high school: a certificate, an associate’s degree or an apprenticeship',
  4: 'Usually a bachelor’s degree',
  5: 'Usually a graduate degree',
}
// O*NET titles are mostly plural already, and a place label can be a whole area.
const plural = (name: string) => /s$/i.test(name) ? name : `${name}s`
const inPlace = (label: string) => / area$/i.test(label) ? `the ${label}` : label
const Src = ({ children }: { children: React.ReactNode }) => <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />{children}</span>
const Head = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground"><Icon size={15} aria-hidden="true" />{children}</span>
const srcText = (e: Estimate) => `${e.source.publisher} · ${e.source.title}${e.fallback && e.asked_place_label ? ` (no ${e.asked_place_label} number, so ${e.place_label})` : ''}`
const yearly = (e: Estimate, v: number) => (e.period === 'hr' ? v * 2080 : e.period === 'mo' ? v * 12 : e.period === 'wk' ? v * 52 : v)

/** Careers in a phase's activities, with their O*NET facts (job zone, title). */
export function useCareers(phase: Phase, token?: string) {
  const codes = [...new Set((phase.activities || []).map((a) => a.career).filter(Boolean) as string[])]
  const { data } = useSWR(token && codes.length ? ['phase-careers', ...codes] : null, () => Promise.all(codes.map((c) => lifeApi.career(c, token).then((r) => r.career).catch(() => null))), { revalidateOnFocus: false })
  return (data || []).filter(Boolean) as Career[]
}

/**
 * Plain sentences about this phase's job, school and place, each with its source: typical pay with the
 * middle half as a bar (and where your own pay sits), the training the job usually needs, the
 * school's numbers, and rent.
 */
export default function PhaseInsights({ phase, token, careers }: { phase: Phase; token?: string; careers: Career[] }) {
  const queries = React.useMemo(() => {
    const out: { id: string; metric: string; place: string | null; dims: Record<string, any> }[] = []
    for (const c of careers) out.push({ id: `wage:${c.code}`, metric: 'wage', place: phase.place || null, dims: { soc: c.soc || c.code.slice(0, 7) } })
    if (phase.place) { out.push({ id: 'rent1', metric: 'rent', place: phase.place, dims: { bedrooms: 1 } }); out.push({ id: 'rent2', metric: 'rent', place: phase.place, dims: { bedrooms: 2 } }) }
    return out
  }, [careers, phase.place])
  const { data } = useSWR(token && queries.length ? ['phase-insights', JSON.stringify(queries)] : null, () => lifeApi.estimates(queries, token), { revalidateOnFocus: false })
  const est = data?.estimates || {}
  const schoolAct = (phase.activities || []).find((a) => a.kind === 'learning' && a.school_id)
  const { data: school } = useSWR(token && schoolAct?.school_id ? ['school', schoolAct.school_id] : null, () => lifeApi.school(schoolAct!.school_id!, token).then((r) => r.school), { revalidateOnFocus: false })
  const [mine, setMine] = React.useState<Record<string, number | null>>({})

  const sections: React.ReactNode[] = []
  for (const c of careers) {
    const e = est[`wage:${c.code}`]
    const name = c.title.split(/,| and /)[0].trim()
    const act = (phase.activities || []).find((a) => a.career === c.code)
    sections.push(<div key={c.code} className="grid gap-2">
      <Head icon={Briefcase}>{name}</Head>
      {e ? (() => {
        const mid = yearly(e, e.value), lo = e.percentiles ? yearly(e, e.percentiles.p25) : null, hi = e.percentiles ? yearly(e, e.percentiles.p75) : null
        const you = mine[c.code]
        const min = Math.min(lo ?? mid, you ?? mid) * 0.7, max = Math.max(hi ?? mid, you ?? mid) * 1.15, X = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
        const verdict = you && lo && hi ? (you < lo ? 'low' : you > hi ? 'high' : 'mid') : null
        return <>
          <p className="font-semibold">{act?.apprentice ? tr('goals.phase_insights.once_you_re_through_tolowercase', 'Once you’re through, {{toLowerCase}}', { toLowerCase: plural(name).toLowerCase() }) : plural(name)}{' '}{tr('goals.phase_insights.in_inplace_typically_make', 'in {{inPlace}} typically make', { inPlace: inPlace(e.place_label) })}{' '}<b className="font-extrabold">{money(mid)}</b>{' '}{tr('goals.phase_insights.a_year', 'a year.')}</p>
          {lo && hi ? <div className="relative h-9" role="img" aria-label={tr('goals.phase_insights.middle_half_of_pay_money', 'Middle half of pay: {{money}} to {{money2}}', { money: money(lo), money2: money(hi) })}>
            <span className="absolute inset-x-0 top-3 h-2 rounded-full bg-muted" />
            <span className="absolute top-3 h-2 rounded-full bg-[color-mix(in_srgb,var(--org-primary-color)_55%,transparent)]" style={{ left: `${X(lo)}%`, width: `${X(hi) - X(lo)}%` }} />
            {you ? <span className="absolute top-1.5 h-5 w-1 -translate-x-0.5 rounded bg-foreground" style={{ left: `${X(you)}%` }} /> : null}
            <span className="absolute top-6 -translate-x-1/2 text-[11px] font-bold text-muted-foreground" style={{ left: `${X(lo)}%` }}>{short(lo)}</span>
            <span className="absolute top-6 -translate-x-1/2 text-[11px] font-bold text-muted-foreground" style={{ left: `${X(hi)}%` }}>{short(hi)}</span>
          </div> : null}
          <Src>{lo && hi ? tr('goals.phase_insights.middle_half_of_pay', 'Middle half of pay · ') : ''}{srcText(e)}</Src>
          {!act?.apprentice ? <label className="flex items-center gap-2 text-sm text-muted-foreground">{tr('goals.phase_insights.what_do_you_make_a', 'What do you make a year?')}
            <input inputMode="numeric" placeholder="$" value={mine[c.code] ?? ''} onChange={(ev) => setMine({ ...mine, [c.code]: Number(ev.target.value.replace(/[^0-9]/g, '')) || null })} className="h-9 w-32 rounded-xl bg-muted px-2.5 font-bold text-foreground outline-none" />
          </label> : null}
          {verdict === 'low' ? <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">{tr('goals.phase_insights.most_tolowercases_here_make_more', 'Most {{toLowerCase}}s here make more than that. Worth asking about a raise, or looking around.', { toLowerCase: name.toLowerCase() })}</p> : null}
          {verdict === 'high' ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">{tr('goals.phase_insights.you_re_paid_more_than', 'You’re paid more than most {{toLowerCase}}s here.', { toLowerCase: name.toLowerCase() })}</p> : null}
          {verdict === 'mid' ? <p className="rounded-xl bg-muted px-3 py-2 text-sm font-bold">{tr('goals.phase_insights.you_re_in_the_middle', 'You’re in the middle of what most {{toLowerCase}}s here make.', { toLowerCase: name.toLowerCase() })}</p> : null}
        </>
      })() : <p className="text-sm text-muted-foreground">{tr('goals.phase_insights.no_pay_numbers_for_this', 'No pay numbers for this job')}{phase.place_label ? ` around ${phase.place_label}` : ''}{' '}{tr('goals.phase_insights.yet', 'yet.')}</p>}
      {c.job_zone ? <><p className="font-semibold">{tr('goals.phase_insights.what_it_takes', 'What it takes:')}{' '}<b className="font-extrabold">{TRAINING[c.job_zone]}</b></p><Src>{tr('goals.phase_insights.o_net_job_zone_job', 'O*NET job zone {{job_zone}}', { job_zone: c.job_zone })}</Src></> : null}
    </div>)
  }
  if (schoolAct && school) sections.push(<div key="school" className="grid gap-2">
    <Head icon={GraduationCap}>{school.name}</Head>
    <div className="grid grid-cols-2 gap-2">
      {school.tuition?.in != null ? <Fact value={money(school.tuition.in)} label={tr('goals.phase_insights.tuition_a_year_in_state', 'tuition a year, in state')} /> : null}
      {school.admission_rate != null ? <Fact value={`${Math.round(school.admission_rate * 100)}%`} label={tr('goals.phase_insights.of_applicants_get_in', 'of applicants get in')} /> : null}
      {school.completion_rate != null ? <Fact value={`${Math.round(school.completion_rate * 100)}%`} label="finish" /> : null}
      {school.median_earnings != null ? <Fact value={money(school.median_earnings)} label={tr('goals.phase_insights.typical_pay_10_years_after', 'typical pay 10 years after starting')} /> : null}
    </div>
    {school.source ? <Src>{school.source.title}</Src> : null}
  </div>)
  else if ((phase.activities || []).some((a) => a.kind === 'learning' && a.level === 'high')) sections.push(<div key="hs" className="grid gap-2">
    <Head icon={GraduationCap}>{levelOf('high')!.short}</Head>
    <p className="font-semibold">{tr('goals.phase_insights.an_oregon_diploma_takes', 'An Oregon diploma takes')}{' '}<b className="font-extrabold">{tr('goals.phase_insights.24_credits', '24 credits')}</b>.</p><Src>{tr('goals.phase_insights.oregon_department_of_education', 'Oregon Department of Education')}</Src>
  </div>)
  if (est.rent1 || est.rent2) sections.push(<div key="place" className="grid gap-2">
    <Head icon={MapPin}>{phase.place_label || tr('goals.phase_insights.where', 'Where')}</Head>
    <p className="font-semibold">{tr('goals.phase_insights.a_modest_1_bedroom_rents', 'A modest 1-bedroom rents for about')}{' '}<b className="font-extrabold">{est.rent1 ? money(est.rent1.value) : '—'}</b>{' '}{tr('goals.phase_insights.a_month', 'a month')}{est.rent2 ? <>{tr('goals.phase_insights.a_2_bedroom_about', '; a 2-bedroom about')}{' '}<b className="font-extrabold">{money(est.rent2.value)}</b></> : null}.</p>
    <Src>{srcText((est.rent1 || est.rent2)!)}</Src>
  </div>)

  return <section aria-labelledby="phase-insights" className="grid gap-4 rounded-[22px] bg-card p-5 shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)]">
    <h2 id="phase-insights" className="text-xl font-extrabold tracking-tight">{tr('goals.phase_insights.insights', 'Insights')}</h2>
    {sections.length ? sections.map((s, i) => <div key={i} className={i ? 'border-t-2 border-muted pt-4' : ''}>{s}</div>) : <p className="text-sm text-muted-foreground">{tr('goals.phase_insights.pick_a_place_a_school', 'Pick a place, a school or a job, and what we know about them shows up here, with where each number comes from.')}</p>}
  </section>
}

function Fact({ value, label }: { value: string; label: string }) {
  return <div className="grid gap-0.5 rounded-2xl bg-muted px-3 py-2.5"><b className="text-lg font-extrabold tabular-nums">{value}</b><span className="text-xs font-semibold text-muted-foreground">{label}</span></div>
}
