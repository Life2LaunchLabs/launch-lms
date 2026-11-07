'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { GitBranch, Loader2, Plus, Search, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import useLifePlan from '@components/Goals/phases/useLifePlan'
import { addRoute, careerName, current, normalize, routesFor, type CareerLike } from '@components/Goals/phases/graph'
import { getUriWithOrg } from '@services/config/config'
import { careersApi, fullMoney, hourlyMoney, type CareerProfile as Profile, type CareerProgram, type PlaceWage } from '@services/life/careers'
import { lifeApi } from '@services/life/life'
import { cn } from '@/lib/utils'
import { CAREER_TYPES, TRAINING } from './CareerTile'

import { tr } from '@/lib/tr'
// Two or three careers side by side, as the mockup's Compare screen: one plain "In short", then pay near the
// learner on one scale, openings, getting in, fit and a day at work, and a button to put them all on the plan map
// as dashed ideas after the learner's current phase. Every figure is one the career pages already show, with the
// same sources.

const MAX = 3
export interface CompareChoice { code: string; title: string }

const colorOf = (profile: Profile) => (CAREER_TYPES[(profile.career.top_interests || 'E')[0]] || CAREER_TYPES.E).color
const sidesOf = (profile: Profile) => (profile.career.top_interests || '').split('').slice(0, 2).map((letter) => CAREER_TYPES[letter]?.name).filter(Boolean)
const hereWage = (profile: Profile): PlaceWage | undefined => profile.wages.places.find((row) => row.place === profile.wages.here)
/** Openings a year near the learner (their Oregon region), else in Oregon. */
const openingsOf = (profile: Profile) => {
  const outlook = profile.outlook
  if (!outlook) return null
  const row = (outlook.here && outlook.places.find((place) => place.place === outlook.here)) || outlook.places.find((place) => place.place === 'state:OR')
  return row?.openings != null ? { ...row, openings: row.openings, end: outlook.end } : null
}
const fitOf = (match: number | null) => match == null ? null : match >= 0.7 ? tr('lit.career_profile.strong_fit', 'Strong fit') : match >= 0.4 ? tr('lit.career_profile.good_fit', 'Good fit') : tr('lit.career_compare.not_much_like_you', 'Not much like you')
/** "uses 3 of your skills", when the learner has picked some. */
const usesLine = (profile: Profile) => profile.skills?.mine?.length ? `uses ${profile.skills.used.length || 'none'} of your skills` : ''
const apprenticeship = (profile: Profile) => /apprentice/i.test(routesFor(profile.career)[0]?.steps[0]?.title || '')
// The lowest credential that fits each O*NET job zone (Scorecard levels: 1 certificate, 2 associate, 3 bachelor's, 5 master's).
const LEAST_CREDENTIAL: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 3, 5: 5 }
/** The nearest program at the career's level in the learner's state, the cheaper one among equally near schools. */
const nearestProgram = (profile: Profile) => {
  const least = LEAST_CREDENTIAL[profile.career.job_zone || 3] || 1
  const fits = (profile.paths?.programs || []).filter((program) => program.near_rank <= 3 && program.credential >= least)
  return fits.sort((a, b) => a.near_rank - b.near_rank || (a.tuition ?? Infinity) - (b.tuition ?? Infinity))[0] || null
}
/** "About $6,377 a year at Umpqua Community College." The Scorecard's tuition is for undergraduates, so graduate programs get their name only. */
const programLine = (program: CareerProgram) => program.tuition != null && program.credential <= 3
  ? `About ${fullMoney(program.tuition)} a year at ${program.school}.` : `Nearest: ${program.credential_label.toLowerCase()} at ${program.school}.`

/** One plain paragraph: who pays more, who has more openings, which fits better, which takes less school. */
function inShort(profiles: Profile[]) {
  const named = (profile: Profile) => careerName(profile.career.title).toLowerCase().replace(/^./, (c) => c.toUpperCase()) + 's'
  const lines: string[] = []
  const pay = profiles.map((profile) => ({ profile, pay: hereWage(profile)?.hourly.p50 })).filter((row) => row.pay != null) as Array<{ profile: Profile; pay: number }>
  if (pay.length >= 2) {
    pay.sort((a, b) => b.pay - a.pay)
    const gap = pay[0].pay - pay[pay.length - 1].pay
    lines.push(gap >= 1 ? `${named(pay[0].profile)} usually earn about ${fullMoney(gap)} more an hour than ${named(pay[pay.length - 1].profile).toLowerCase()}.` : tr('lit.career_compare.pay_is_about_the_same', 'Pay is about the same.'))
  }
  const jobs = profiles.map((profile) => ({ profile, n: openingsOf(profile)?.openings })).filter((row) => row.n != null) as Array<{ profile: Profile; n: number }>
  if (jobs.length >= 2) {
    jobs.sort((a, b) => b.n - a.n)
    const ratio = jobs[0].n / Math.max(1, jobs[jobs.length - 1].n)
    if (ratio >= 1.5) lines.push(`${named(jobs[0].profile)} have ${ratio >= 2.5 ? `about ${Math.round(ratio)} times` : 'more'} the openings near you.`)
  }
  const fit = profiles.filter((profile) => profile.match != null).sort((a, b) => (b.match || 0) - (a.match || 0))
  if (fit.length >= 2 && (fit[0].match || 0) - (fit[fit.length - 1].match || 0) >= 0.15) lines.push(`${named(fit[0])} fit your interests better.`)
  const zones = profiles.filter((profile) => profile.career.job_zone).sort((a, b) => (a.career.job_zone || 0) - (b.career.job_zone || 0))
  if (zones.length >= 2 && zones[0].career.job_zone !== zones[zones.length - 1].career.job_zone) {
    lines.push(apprenticeship(zones[0]) ? `${named(zones[0])} skip college and get paid while they train.` : `${named(zones[0])} take less training to start.`)
  }
  return lines.join(' ')
}

function Block({ title, chip, chipTone, children }: { title: string; chip?: string | null; chipTone?: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-card p-4 shadow-[0_4px_0_hsl(var(--border))]">
    <h3 className="m-0 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
    {children}
    {chip ? <span className="self-start rounded-full px-2.5 py-1 text-[12.5px] font-extrabold" style={{ backgroundColor: `${chipTone || '#22a06b'}22` }}>{chip}</span> : null}
  </section>
}

function Columns({ profiles, cell }: { profiles: Profile[]; cell: Map<Profile, React.ReactNode> }) {
  return <div className={cn('grid gap-3', profiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
    {profiles.map((profile) => <div key={profile.career.code} className="flex min-w-0 flex-col gap-1 text-[13.5px] leading-snug">{cell.get(profile)}</div>)}
  </div>
}
/** Each career's cell in a row of columns. */
// eslint-disable-next-line no-unused-vars -- parameter names in function types
const cells = (profiles: Profile[], make: (profile: Profile) => React.ReactNode) => new Map(profiles.map((profile) => [profile, make(profile)]))

/** Pay near the learner for each career, on one shared scale. */
function PayBars({ profiles }: { profiles: Profile[] }) {
  const rows = profiles.map((profile) => ({ profile, wage: hereWage(profile) })).filter((row) => row.wage?.hourly.p50 != null) as Array<{ profile: Profile; wage: PlaceWage }>
  if (!rows.length) return <p className="m-0 text-[13.5px] text-muted-foreground">{tr('careers.career_compare.no_pay_figures_for_these', 'No pay figures for these yet.')}</p>
  const lo = Math.floor(Math.min(...rows.map((row) => row.wage.hourly.p10 ?? row.wage.hourly.p50!)) * 0.9 / 5) * 5
  const hi = Math.ceil(Math.max(...rows.map((row) => row.wage.hourly.p90 ?? row.wage.hourly.p50!)) * 1.05 / 5) * 5
  const x = (value: number) => `${Math.max(0, Math.min(100, ((value - lo) / Math.max(1, hi - lo)) * 100))}%`
  return <div className="flex flex-col gap-1">
    {rows.map(({ profile, wage }) => {
      const h = wage.hourly
      const from = h.p10 ?? h.p25, to = h.p90 ?? h.p75
      return <div key={profile.career.code} className="flex flex-col gap-1">
        <div className="flex justify-between gap-2 text-[13.5px] font-extrabold"><span className="truncate">{careerName(profile.career.title)}</span><span className="tabular-nums">{tr('careers.career_compare.hourlymoney_hr', '{{hourlyMoney}}/hr', { hourlyMoney: hourlyMoney(h.p50!) })}</span></div>
        <div className="relative h-6" role="img" aria-label={tr('careers.career_compare.title_valuetypical_hourlymoney', '{{title}}: {{value}}typical {{hourlyMoney}}', { title: profile.career.title, value: from != null && to != null ? `${hourlyMoney(from)} to ${hourlyMoney(to)} an hour, ` : '', hourlyMoney: hourlyMoney(h.p50!) })}>
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
          {from != null && to != null ? <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full opacity-85" style={{ left: x(from), width: `calc(${x(to)} - ${x(from)})`, backgroundColor: colorOf(profile) }} /> : null}
          <span className="absolute top-0 h-6 w-1 -translate-x-1/2 rounded bg-foreground" style={{ left: x(h.p50!) }} />
        </div>
      </div>
    })}
    <div className="flex justify-between text-[11.5px] font-bold text-muted-foreground"><span>${lo}</span><span>${hi}</span></div>
  </div>
}

/** Pick careers to compare: ones like the first, or any by name. */
function Picker({ chosen, suggestions, onPick, token }: { chosen: CompareChoice[]; suggestions: CompareChoice[]; onPick: React.Dispatch<CompareChoice>; token: string }) {
  const [query, setQuery] = React.useState('')
  const { data } = useSWR(query.trim().length >= 2 ? ['career-search', query.trim()] : null, () => lifeApi.careers(query.trim(), token))
  const taken = new Set(chosen.map((choice) => choice.code))
  const options = (query.trim().length >= 2 ? (data?.careers || []).map((career) => ({ code: career.code, title: career.title })) : suggestions).filter((option) => !taken.has(option.code)).slice(0, 8)
  return <div className="flex flex-col gap-2">
    <label className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-border bg-card px-3 focus-within:border-foreground">
      <Search size={16} className="text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{tr('careers.career_compare.find_a_career', 'Find a career')}</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('careers.career_compare.find_a_career', 'Find a career')} className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none" />
    </label>
    {!query.trim() && options.length ? <span className="px-1 text-[12.5px] font-bold text-muted-foreground">{tr('careers.career_compare.careers_like_title', 'Careers like {{title}}', { title: chosen[0]?.title })}</span> : null}
    <div className="flex flex-col gap-1.5">
      {options.map((option) => <button key={option.code} type="button" onClick={() => onPick(option)} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-muted/60 px-3 py-2 text-left text-[14.5px] font-extrabold hover:bg-muted">
        {option.title}<Plus size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>)}
      {query.trim().length >= 2 && data && !options.length ? <span className="px-1 text-[13.5px] text-muted-foreground">{tr('careers.career_compare.no_careers_match_trim', 'No careers match “{{trim}}”.', { trim: query.trim() })}</span> : null}
    </div>
  </div>
}

export default function CareerCompare({ start, suggestions, token, onClose }: { start: CompareChoice[]; suggestions: CompareChoice[]; token: string; onClose: () => void }) {
  const org = useOrg() as any
  const router = useRouter()
  const [chosen, setChosen] = React.useState<CompareChoice[]>(start.slice(0, MAX))
  const [picking, setPicking] = React.useState(start.length < 2)
  const codes = chosen.map((choice) => choice.code)
  const { data: profiles } = useSWR(chosen.length >= 2 ? ['career-compare', codes.join(','), org?.id] : null,
    () => Promise.all(codes.map((code) => careersApi.profile(code, org?.id, token))), { keepPreviousData: true })
  const { doc, isLoading: planLoading, change, busy } = useLifePlan(token)
  const plan = React.useMemo(() => (doc && doc.phases.length ? normalize(doc) : null), [doc])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const pick = (choice: CompareChoice) => { setChosen((list) => [...list, choice].slice(0, MAX)); setPicking(false) }
  const drop = (code: string) => setChosen((list) => { const next = list.filter((choice) => choice.code !== code); if (next.length < 2) setPicking(true); return next })

  /** Each career's usual route goes on the map as dashed ideas, side by side after the current phase. */
  const add = async (careers: CareerLike[]) => {
    if (!plan) return
    const after = (current(plan) || plan.phases[plan.phases.length - 1]).id
    let first = ''
    const saved = await change((next) => {
      let doc = normalize(next)
      for (const career of careers) {
        const result = addRoute(doc, after, routesFor(career)[0].steps)
        doc = result.doc
        first ||= result.ids[0]
      }
      Object.assign(next, doc)
    })
    if (saved && org?.slug) router.push(getUriWithOrg(org.slug, first ? `/plans?phase=${encodeURIComponent(first)}` : '/plans?map'))
  }

  const ready = profiles && profiles.length === chosen.length && profiles.every((profile, index) => profile.career.code === codes[index]) ? profiles : null
  const home = ready?.find((profile) => profile.home)?.home
  const payPlace = ready ? hereWage(ready[0]) : undefined
  const jobs = ready?.map((profile) => ({ profile, row: openingsOf(profile) })) || []
  const jobsWhere = jobs.find((item) => item.row)?.row?.label
  const topJobs = [...jobs].filter((item) => item.row).sort((a, b) => b.row!.openings - a.row!.openings)
  const ratio = topJobs.length >= 2 ? topJobs[0].row!.openings / Math.max(1, topJobs[topJobs.length - 1].row!.openings) : 0
  const pays = ready?.map((profile) => ({ profile, pay: hereWage(profile)?.hourly.p50 })).filter((row) => row.pay != null).sort((a, b) => b.pay! - a.pay!) || []
  const payGap = pays.length >= 2 ? pays[0].pay! - pays[pays.length - 1].pay! : 0
  const both = chosen.length === 2 ? 'both' : 'all three'

  const body = <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'calc(var(--z-modal) + 1)' }}>
    <div aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-labelledby="career-compare-title" className="relative flex max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-[28px] bg-background p-4 pb-[max(20px,env(safe-area-inset-bottom))] text-foreground sm:max-w-[600px] sm:rounded-[28px] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="career-compare-title" className="m-0 text-[24px] font-extrabold leading-tight">{tr('careers.career_compare.compare', 'Compare')}</h2>
        <div className="flex items-center gap-2">
          {chosen.length >= 2 && chosen.length < MAX && !picking ? <button type="button" onClick={() => setPicking(true)} className="min-h-11 rounded-full border-2 border-dashed border-border bg-card px-3.5 text-[13px] font-extrabold">{tr('careers.career_compare.add_a_third', '+ Add a third')}</button> : null}
          <button type="button" onClick={onClose} aria-label={tr('discover.resource_sheet.close', 'Close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background"><X size={18} /></button>
        </div>
      </div>

      <div className={cn('grid gap-2.5', chosen.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {chosen.map((choice) => {
          const profile = ready?.find((item) => item.career.code === choice.code)
          return <div key={choice.code} className="relative flex min-w-0 flex-col gap-1.5 rounded-[18px] border-2 border-border bg-card p-3 pr-9">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: profile ? colorOf(profile) : 'hsl(var(--muted))' }} aria-hidden="true" />
            <span className="text-[15px] font-extrabold leading-tight">{choice.title}</span>
            {profile ? <span className="text-[12px] font-bold text-muted-foreground">{sidesOf(profile).join(' · ')}</span> : null}
            {chosen.length > 1 ? <button type="button" onClick={() => drop(choice.code)} aria-label={`Take ${choice.title} out`} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X size={15} /></button> : null}
          </div>
        })}
      </div>

      {picking ? <Picker chosen={chosen} suggestions={suggestions} onPick={pick} token={token} /> : null}

      {chosen.length >= 2 && !ready ? <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label={tr('careers.career_compare.loading_careers', 'Loading careers')} /></div> : null}

      {ready ? <>
        {inShort(ready) ? <section className="flex flex-col gap-1.5 rounded-[20px] bg-foreground p-4 text-background">
          <span className="text-xs font-extrabold uppercase tracking-[0.08em] opacity-75">{tr('careers.career_compare.in_short', 'In short')}</span>
          <p className="m-0 text-[15.5px] font-bold leading-snug">{inShort(ready)}</p>
        </section> : null}

        <Block title={`Pay ${payPlace && payPlace.place !== 'us' ? `in ${payPlace.label}` : 'across the US'}`} chip={payGap >= 1 ? `${careerName(pays[0].profile.career.title)}: about ${fullMoney(payGap)} more an hour` : null} chipTone={pays[0] ? colorOf(pays[0].profile) : undefined}>
          <PayBars profiles={ready} />
        </Block>

        {topJobs.length ? <Block title={`Openings ${jobsWhere ? `in ${jobsWhere}` : ''}`} chip={ratio >= 1.5 ? `${careerName(topJobs[0].profile.career.title)}: ${ratio >= 2.5 ? `${Math.round(ratio)} times` : 'more'} the openings` : null} chipTone={topJobs[0] ? colorOf(topJobs[0].profile) : undefined}>
          <Columns profiles={ready} cell={cells(ready, (profile) => {
            const row = openingsOf(profile)
            return row ? <>
              <span className="text-[22px] font-extrabold tabular-nums">{tr('careers.career_compare.tolocalestring_a_year', '{{toLocaleString}} a year', { toLocaleString: row.openings.toLocaleString('en-US') })}</span>
              {row.growth != null ? <span className="text-[12.5px] font-bold text-muted-foreground">{row.growth > 0 ? '+' : ''}{(row.growth * 100).toFixed(1)}%{row.end ? ` by ${row.end}` : ''}</span> : null}
            </> : <span className="text-muted-foreground">{tr('careers.career_compare.no_projection_yet', 'No projection yet')}</span>
          })} />
        </Block> : null}

        <Block title={tr('careers.career_compare.getting_in', 'Getting in')} chip={ready.some(apprenticeship) && !ready.every(apprenticeship) ? `${careerName(ready.find(apprenticeship)!.career.title)}: no tuition` : null} chipTone="#e8742a">
          <Columns profiles={ready} cell={cells(ready, (profile) => {
            const program = nearestProgram(profile)
            const entry = profile.outlook?.entry?.typical
            return <>
              <span className="font-extrabold">{apprenticeship(profile) ? tr('careers.career_compare.paid_apprenticeship', 'Paid apprenticeship') : profile.career.job_zone ? TRAINING[profile.career.job_zone] : tr('careers.career_compare.training_varies', 'Training varies')}</span>
              <span className="text-[13px] text-muted-foreground">{apprenticeship(profile) ? tr('careers.career_compare.learn_on_the_job_with', 'Learn on the job with classes.') : program ? programLine(program) : entry ? tr('careers.career_compare.most_start_with_tolowercase', 'Most start with: {{toLowerCase}}.', { toLowerCase: entry.toLowerCase() }) : ''}</span>
            </>
          })} />
        </Block>

        {ready.some((profile) => profile.match != null || profile.skills?.mine?.length) ? <Block title={tr('careers.career_compare.fit_with_you', 'Fit with you')}>
          <Columns profiles={ready} cell={cells(ready, (profile) => <>
            <span className="font-extrabold">{fitOf(profile.match) || tr('careers.career_compare.no_quiz_yet', 'No quiz yet')}</span>
            <span className="text-[13px] text-muted-foreground">{[sidesOf(profile).length ? `Leans ${sidesOf(profile).join(' and ')}` : '', usesLine(profile)].filter(Boolean).join('; ')}</span>
          </>)} />
        </Block> : null}

        {ready.some((profile) => profile.career.tasks?.length) ? <Block title={tr('careers.career_compare.a_day_at_work', 'A day at work')}>
          <Columns profiles={ready} cell={cells(ready, (profile) => <span>{(profile.career.tasks || [])[0]}</span>)} />
        </Block> : null}

        {home ? null : <p className="m-0 px-1 text-[12.5px] text-muted-foreground">{tr('careers.career_compare.showing_oregon_add_your_town', 'Showing Oregon. Add your town to your portfolio to compare pay and openings near you.')}</p>}

        {planLoading ? null : plan ? <>
          <div className={cn('grid gap-2.5', chosen.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {ready.map((profile) => <button key={profile.career.code} type="button" disabled={busy} onClick={() => void add([profile.career])}
              className="min-h-12 rounded-2xl border-2 border-border bg-card px-2 text-[14px] font-extrabold shadow-[0_4px_0_hsl(var(--border))] disabled:opacity-60">{tr('careers.career_compare.add_tolowercase', 'Add {{toLowerCase}}', { toLowerCase: careerName(profile.career.title).toLowerCase() })}</button>)}
          </div>
          <button type="button" disabled={busy} onClick={() => void add(ready.map((profile) => profile.career))}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-extrabold text-background shadow-[0_4px_0_#000] disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <GitBranch size={16} aria-hidden="true" />}{tr('careers.career_compare.add_both_to_plan_ideas', 'Add {{both}} to plan ideas', { both })}
          </button>
          <p className="m-0 px-1 text-center text-[12px] text-muted-foreground">{tr('careers.career_compare.they_go_on_your_plan', 'They go on your plan map as dashed ideas after where you are now, so you can try each path.')}</p>
        </> : org?.slug ? <Link href={getUriWithOrg(org.slug, '/plans')} className="self-center rounded-2xl bg-[var(--org-primary-color)] px-5 py-3 text-sm font-extrabold text-[var(--org-on-primary-color)] no-underline">{tr('careers.career_compare.start_my_plan_to_add', 'Start my plan to add these')}</Link> : null}
      </> : null}
    </div>
  </div>
  return mounted ? createPortal(body, document.body) : null
}
