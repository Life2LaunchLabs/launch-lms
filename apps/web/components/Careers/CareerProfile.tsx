'use client'

import React, { type Dispatch } from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import { ArrowLeftRight, Check, ChevronDown, ChevronRight, GitBranch, Globe, Loader2, MapPin } from 'lucide-react'
import { SpeakButton } from '@components/Accessibility/ReadAloud'
import { useOrg } from '@components/Contexts/OrgContext'
import { PORTFOLIO_STRENGTHS } from '@components/Portfolio/traitOptions'
import { routesFor } from '@components/Goals/phases/graph'
import { getUriWithOrg } from '@services/config/config'
import {
  careersApi, fullMoney, hourlyMoney, type CareerOutlook, type CareerPaths, type CareerProgram, type CareerProfile as Profile, type CareerWages, type EducationShare, type PlaceWage,
} from '@services/life/careers'
import { cn } from '@/lib/utils'
import { CAREER_TYPES, TRAINING, matchLabel } from './CareerTile'
import CareerCompare, { type CompareChoice } from './CareerCompare'
import HomeBaseSheet from './HomeBaseSheet'

import { tr } from '@/lib/tr'
// A career's page inside its resource sheet, as the questions a learner asks: what would I do, would I like it,
// what does it pay, can I get a job, what does it take, how do I get there, and what else is like this. Each answer
// is one plain sentence first, with more behind a "more" button, and pay and openings follow the learner's home
// base. Every number names where it came from under "How we know".

const ORDER = ['R', 'I', 'A', 'S', 'E', 'C']
const ZONE: Record<number, [string, string]> = {
  1: ['Little or no training', 'Many people start right after high school and learn on the job.'],
  2: ['High school plus on-the-job training', 'Many people start right after high school and learn on the job.'],
  3: ['Training after high school', 'Think a certificate, an apprenticeship or a 2-year degree.'],
  4: ['Usually a 4-year degree', 'Most people in this job have a bachelor’s degree.'],
  5: ['Graduate school', 'Most people in this job have a master’s, doctorate or professional degree.'],
}
// O*NET's 12 education levels, grouped the way a 15-year-old thinks about them.
const SCHOOLING: Array<{ label: string; levels: number[]; shade: number }> = [
  { get label() { return tr('careers.career_profile.high_school_or_less', 'High school or less') }, levels: [1, 2], shade: 0.22 },
  { get label() { return tr('careers.career_profile.certificate_or_some_college', 'Certificate or some college') }, levels: [3, 4], shade: 0.42 },
  { get label() { return tr('careers.career_profile.associate_s', 'Associate’s') }, levels: [5], shade: 0.62 },
  { get label() { return tr('careers.career_profile.bachelor_s', 'Bachelor’s') }, levels: [6, 7], shade: 0.82 },
  { get label() { return tr('careers.career_profile.master_s_or_more', 'Master’s or more') }, levels: [8, 9, 10, 11, 12], shade: 1 },
]

function Section({ title, headline, speak, accent, more, moreLabel = 'More', children }: {
  title: string; headline?: React.ReactNode; speak?: string; accent?: string; more?: React.ReactNode; moreLabel?: string; children?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  return <section className="flex flex-col gap-2.5 rounded-[20px] border-2 bg-card p-4" style={{ borderColor: accent || 'hsl(var(--border))', boxShadow: `0 4px 0 ${accent ? `${accent}55` : 'hsl(var(--border))'}` }}>
    <div className="flex items-start justify-between gap-2">
      <h3 className="m-0 pt-1 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
      {speak ? <SpeakButton text={speak} size="sm" label={tr('careers.career_profile.read_title_aloud', 'Read “{{title}}” aloud', { title })} /> : null}
    </div>
    {headline ? <p className="m-0 text-[16px] font-bold leading-snug">{headline}</p> : null}
    {children}
    {more ? <>
      {open ? <div id={id} className="flex flex-col gap-3 border-t-2 border-border/60 pt-3">{more}</div> : null}
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="-mb-1 flex min-h-11 items-center gap-1 self-start text-[14px] font-extrabold text-[var(--org-primary-color)] hover:underline">
        {open ? tr('careers.career_profile.show_less', 'Show less') : moreLabel}<ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
    </> : null}
  </section>
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-muted/60 p-2.5" style={tone ? { backgroundColor: `${tone}1a` } : undefined}>
    <span className="text-[19px] font-extrabold tabular-nums">{value}</span>
    <span className="text-[12px] font-bold leading-tight text-muted-foreground">{label}</span>
  </div>
}

/** The spread of pay: 10th to 90th percentile pale, the middle half dark, typical pay as a tick. */
function PayRange({ wage, color, lo, hi }: { wage: PlaceWage; color: string; lo: number; hi: number }) {
  const h = wage.hourly
  const x = (value: number) => `${Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100))}%`
  const span = (a?: number, b?: number) => a != null && b != null ? { left: x(a), width: `calc(${x(b)} - ${x(a)})` } : null
  const outer = span(h.p10, h.p90), inner = span(h.p25, h.p75)
  const label = [h.p10 != null ? `1 in 10 earn under ${hourlyMoney(h.p10)}` : '', h.p25 != null && h.p75 != null ? `the middle half earn ${hourlyMoney(h.p25)} to ${hourlyMoney(h.p75)}` : '',
    h.p50 != null ? `typical ${hourlyMoney(h.p50)}` : '', h.p90 != null ? `1 in 10 earn over ${hourlyMoney(h.p90)}` : ''].filter(Boolean).join(', ')
  return <div className="relative h-11" role="img" aria-label={tr('careers.career_profile.hourly_pay_value_label', 'Hourly pay {{value}}: {{label}}', { value: wage.label === 'Oregon' ? 'in Oregon' : `in ${wage.label}`, label })}>
    <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
    {outer ? <span className="absolute top-1/2 h-4 -translate-y-1/2 rounded-full" style={{ ...outer, backgroundColor: color, opacity: 0.35 }} /> : null}
    {inner ? <span className="absolute top-1/2 h-4 -translate-y-1/2 rounded-md" style={{ ...inner, backgroundColor: color }} /> : null}
    {h.p50 != null ? <span className="absolute top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: x(h.p50) }} /> : null}
  </div>
}

/** A place's name at the start of a line: "the South Coast" becomes "The South Coast". */
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
/** "Oregon Employment Department, Oregon Occupational Wage Information, 2026", with the year once. */
const credit = (wage: PlaceWage) => wage.year && !wage.source.includes(String(wage.year)) ? `${wage.source}, ${wage.year}` : wage.source

/** "in Douglas County", "in Oregon", "across the US". */
const inPlace = (wage: { place: string; label: string }) => wage.place === 'us' ? 'across the US' : `in ${wage.label}`

function PayMore({ wages, color }: { wages: CareerWages; color: string }) {
  const [pick, setPick] = React.useState(wages.here || 'state:OR')
  const rank = (row: PlaceWage) => row.place === wages.here ? 0 : row.place === 'state:OR' ? 1 : row.level === 'state' ? 2 : row.place === 'us' ? 3 : 4
  const regional = wages.places.some((row) => row.level === 'region') ? 'region' : 'area'
  const chips = wages.places.filter((row) => row.place === wages.here || row.level === 'state' || row.level === 'us' || row.level === regional)
    .sort((a, b) => rank(a) - rank(b)).slice(0, 14)
  const current = wages.places.find((row) => row.place === pick) || wages.places[0]
  const lo = Math.min(...wages.places.map((row) => row.hourly.p10 ?? row.hourly.p50 ?? 0)) * 0.9
  const hi = Math.max(...wages.places.map((row) => row.hourly.p90 ?? row.hourly.p50 ?? 0)) * 1.05
  // Oregon's own areas, highest typical pay first, so the learner sees where their area stands.
  const areas = wages.places.filter((row) => row.level === 'region').length ? wages.places.filter((row) => row.level === 'region') : wages.places.filter((row) => row.level === 'area')
  const top = Math.max(1, ...areas.map((row) => row.hourly.p50 || 0))
  const sorted = [...areas].sort((a, b) => (b.hourly.p50 || 0) - (a.hourly.p50 || 0))
  return <>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr('careers.career_profile.choose_a_place', 'Choose a place')}>
      {chips.map((row) => <button key={row.place} type="button" aria-pressed={row.place === current.place} onClick={() => setPick(row.place)}
        className={cn('min-h-10 rounded-full border-2 px-3 text-[12.5px] font-extrabold', row.place === current.place ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}>
        {cap(row.label)}{row.place === wages.here && row.place !== 'state:OR' ? tr('careers.career_profile.you', ' (you)') : ''}
      </button>)}
    </div>
    <PayRange wage={current} color={color} lo={lo} hi={hi} />
    <div className="grid grid-cols-3 gap-2">
      <Tile value={current.hourly.p10 != null ? hourlyMoney(current.hourly.p10) : '–'} label={tr('careers.career_profile.1_in_10_earn_under', '1 in 10 earn under')} />
      <Tile value={current.hourly.p50 != null ? hourlyMoney(current.hourly.p50) : '–'} label={tr('careers.career_profile.half_earn_over', 'Half earn over')} tone={color} />
      <Tile value={current.hourly.p90 != null ? hourlyMoney(current.hourly.p90) : '–'} label={tr('careers.career_profile.1_in_10_earn_over', '1 in 10 earn over')} />
    </div>
    <p className="m-0 text-[13px] text-muted-foreground">{tr('careers.career_profile.the_dark_band_is_the', 'The dark band is the middle half of workers {{inPlace}}. Hourly pay before taxes; a full-time year is about 2,080 hours. {{credit}}.', { inPlace: inPlace(current), credit: credit(current) })}</p>
    {sorted.length > 1 ? <div className="flex flex-col gap-1">
      <h4 className="m-0 text-[13px] font-extrabold">{tr('careers.career_profile.typical_pay_around_oregon', 'Typical pay around Oregon')}</h4>
      {sorted.map((row) => <div key={row.place} className={cn('grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13.5px]', row.place === wages.here && 'bg-amber-500/15')}>
        <span className="flex min-w-0 items-center gap-1 font-bold">{row.place === wages.here ? <MapPin size={13} className="shrink-0 text-amber-600" aria-label={tr('careers.career_profile.near_you', 'Near you')} /> : null}<span className="truncate">{cap(row.label)}</span></span>
        <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${((row.hourly.p50 || 0) / top) * 100}%`, backgroundColor: row.place === wages.here ? '#b26b00' : color }} /></span>
        <span className="font-extrabold tabular-nums">{row.hourly.p50 != null ? hourlyMoney(row.hourly.p50) : '–'}</span>
      </div>)}
      <p className="m-0 text-[12px] text-muted-foreground">{tr('careers.career_profile.pay_in_small_areas_can', 'Pay in small areas can swing from year to year.')}</p>
    </div> : null}
    <PayHistory wages={wages} color={color} />
  </>
}

/** Typical hourly pay over the years we have, Oregon against the US. Shown with three years or more. */
function PayHistory({ wages, color }: { wages: CareerWages; color: string }) {
  const oregon = (wages.history['state:OR'] || []).filter((row) => row.hourly != null)
  const us = (wages.history.us || []).filter((row) => row.hourly != null)
  if (oregon.length < 3) return null
  const years = [...oregon, ...us].map((row) => row.year)
  const y0 = Math.min(...years), y1 = Math.max(...years)
  const values = [...oregon, ...us].map((row) => row.hourly!)
  const v0 = Math.floor(Math.min(...values) * 0.95), v1 = Math.ceil(Math.max(...values) * 1.05)
  const W = 320, H = 150
  const px = (year: number) => y1 === y0 ? 0 : ((year - y0) / (y1 - y0)) * (W - 70)
  const py = (value: number) => H - 20 - ((value - v0) / (v1 - v0)) * (H - 40)
  const line = (rows: typeof oregon) => rows.map((row) => `${px(row.year).toFixed(1)},${py(row.hourly!).toFixed(1)}`).join(' ')
  const first = oregon[0], last = oregon[oregon.length - 1], usLast = us[us.length - 1]
  return <div className="flex flex-col gap-1.5">
    <h4 className="m-0 text-[13px] font-extrabold">{tr('careers.career_profile.over_the_years', 'Over the years')}</h4>
    <p className="m-0 text-[14px]">{tr('careers.career_profile.typical_oregon_pay_went_from', 'Typical Oregon pay went from {{hourlyMoney}} an hour in {{year}} to {{hourlyMoney2}} in {{year2}}.', { hourlyMoney: hourlyMoney(first.hourly!), year: first.year, hourlyMoney2: hourlyMoney(last.hourly!), year2: last.year })}</p>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={tr('careers.career_profile.typical_hourly_pay_year_to', 'Typical hourly pay, {{year}} to {{year2}}: Oregon {{hourlyMoney}} to {{hourlyMoney2}}{{value}}', { year: first.year, year2: last.year, hourlyMoney: hourlyMoney(first.hourly!), hourlyMoney2: hourlyMoney(last.hourly!), value: usLast ? `, the US ${hourlyMoney(us[0].hourly!)} to ${hourlyMoney(usLast.hourly!)}` : '' })}>
      <line x1="0" x2={W - 70} y1={H - 20} y2={H - 20} stroke="currentColor" strokeOpacity="0.2" />
      {us.length > 1 ? <polyline points={line(us)} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.5" strokeLinejoin="round" /> : null}
      <polyline points={line(oregon)} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <text x={px(last.year) + 6} y={py(last.hourly!) + 4} fontSize="12" fontWeight="800" fill={color}>{tr('careers.career_profile.oregon_hourlymoney', 'Oregon {{hourlyMoney}}', { hourlyMoney: hourlyMoney(last.hourly!) })}</text>
      {usLast ? <text x={px(usLast.year) + 6} y={py(usLast.hourly!) + 4} fontSize="12" fontWeight="800" fill="currentColor" fillOpacity="0.7">{tr('careers.career_profile.us_hourlymoney', 'US {{hourlyMoney}}', { hourlyMoney: hourlyMoney(usLast.hourly!) })}</text> : null}
      <text x="0" y={H - 4} fontSize="11" fill="currentColor" fillOpacity="0.7">{y0}</text>
      <text x={W - 70} y={H - 4} fontSize="11" fill="currentColor" fillOpacity="0.7" textAnchor="end">{y1}</text>
    </svg>
    <p className="m-0 text-[12px] text-muted-foreground">{tr('careers.career_profile.not_adjusted_for_rising_prices', 'Not adjusted for rising prices.')}</p>
  </div>
}

const growthWord = (growth: number | null) => growth == null ? '' : growth > 0.03 ? 'and growing' : growth < -0.03 ? 'but shrinking' : 'and holding steady'
const percent = (growth: number) => `${growth > 0 ? '+' : ''}${(growth * 100).toFixed(1)}%`
const many = (openings: number) => openings >= 100 ? 'Lots of openings' : openings >= 20 ? 'Steady openings' : openings >= 5 ? 'A few openings' : 'Very few openings'

function JobsSection({ outlook, home, onHome }: { outlook: CareerOutlook; home: Profile['home']; onHome: () => void }) {
  const oregon = outlook.places.find((row) => row.place === 'state:OR')
  const near = outlook.here ? outlook.places.find((row) => row.place === outlook.here) : null
  const main = near || oregon
  if (!main || main.openings == null) return null
  const span = outlook.end && outlook.start ? outlook.end - outlook.start : 10
  const newJobs = main.jobs != null && main.jobs_later != null ? (main.jobs_later - main.jobs) / span : null
  const headline = `${many(main.openings)}: about ${main.openings.toLocaleString('en-US')} a year ${inPlace(main)}${main.growth != null ? `, ${growthWord(main.growth)}` : ''}.`
  const regions = outlook.places.filter((row) => row.place !== 'state:OR' && row.openings != null).sort((a, b) => (b.openings || 0) - (a.openings || 0))
  return <Section title={tr('careers.career_profile.can_i_get_a_job', 'Can I get a job?')} headline={headline} speak={headline} moreLabel="Jobs over 10 years, by region" more={<>
    <p className="m-0 text-[14px]">{outlook.start && outlook.end ? tr('careers.career_profile.from_start_to_end', 'From {{start}} to {{end}}, ', { start: outlook.start, end: outlook.end }) : ''}{tr('careers.career_profile.oregon_expects', 'Oregon expects')}{' '}{oregon?.jobs != null && oregon.jobs_later != null ? `${oregon.jobs.toLocaleString('en-US')} jobs to become ${oregon.jobs_later.toLocaleString('en-US')}` : tr('careers.career_profile.these_openings', 'these openings')}.</p>
    {regions.length ? <div className="flex flex-col gap-1">
      {regions.map((row) => <div key={row.place} className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-[13.5px]', row.place === outlook.here && 'bg-amber-500/15')}>
        <span className="flex min-w-0 items-center gap-1 font-bold">{row.place === outlook.here ? <MapPin size={13} className="shrink-0 text-amber-600" aria-label={tr('careers.career_profile.near_you', 'Near you')} /> : null}<span className="truncate">{cap(row.label)}</span></span>
        <span className="text-[12.5px] font-bold text-muted-foreground tabular-nums">{row.growth != null ? percent(row.growth) : ''}</span>
        <span className="font-extrabold tabular-nums">{tr('careers.career_compare.tolocalestring_a_year', '{{toLocaleString}} a year', { toLocaleString: row.openings!.toLocaleString('en-US') })}</span>
      </div>)}
    </div> : null}
    <p className="m-0 text-[12px] text-muted-foreground">{tr('careers.career_profile.source_openings_count_new_jobs', '{{source}}. Openings count new jobs and jobs people leave. Oregon leaves out some small regions.', { source: outlook.source })}</p>
  </>}>
    <div className="grid grid-cols-3 gap-2">
      {near ? <Tile value={near.openings!.toLocaleString('en-US')} label={tr('careers.career_profile.openings_a_year_near_you', 'openings a year near you')} /> : null}
      {oregon?.openings != null ? <Tile value={oregon.openings.toLocaleString('en-US')} label={tr('careers.career_profile.a_year_in_oregon', 'a year in Oregon')} /> : null}
      {main.growth != null ? <Tile value={percent(main.growth)} label={`${main.growth >= 0 ? 'more' : 'fewer'} jobs by ${outlook.end || 'ten years'}`} /> : null}
    </div>
    {newJobs != null && main.openings > Math.max(1, newJobs) * 2 ? <p className="m-0 text-[13px] text-muted-foreground">{tr('careers.career_profile.most_openings_come_from_people', 'Most openings come from people retiring or changing jobs, not only new jobs.')}</p> : null}
    {!near && !home ? <p className="m-0 text-[13px] text-muted-foreground"><TownButton onClick={onHome} />{' '}{tr('careers.career_profile.to_see_openings_near_you', 'to see openings near you.')}</p> : null}
  </Section>
}

function Schooling({ education, color }: { education: EducationShare[]; color: string }) {
  const groups = SCHOOLING.map((group) => ({ ...group, pct: education.filter((row) => group.levels.includes(row.level)).reduce((sum, row) => sum + row.pct, 0) })).filter((group) => group.pct >= 1)
  const total = groups.reduce((sum, group) => sum + group.pct, 0)
  if (!groups.length || total < 50) return null
  return <div className="flex flex-col gap-1.5">
    <span className="text-[13.5px] font-bold">{tr('careers.career_profile.what_people_in_this_job', 'What people in this job say you need')}</span>
    <div className="flex h-6 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={groups.map((group) => `${group.label} ${Math.round(group.pct)} percent`).join(', ')}>
      {groups.map((group) => <span key={group.label} style={{ width: `${(group.pct / total) * 100}%`, backgroundColor: color, opacity: group.shade }} />)}
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-bold text-muted-foreground">{groups.map((group) => <span key={group.label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color, opacity: group.shade }} />{group.label} {Math.round(group.pct)}%</span>)}</div>
  </div>
}

/** Which of the skills the learner picked in their portfolio this job uses, or a nudge to pick some. */
function SkillsLine({ skills, color, href }: { skills: Profile['skills']; color: string; href: string }) {
  if (!skills) return null
  const words = (ids: string[]) => ids.map((id) => PORTFOLIO_STRENGTHS.find((option) => option.id === id)?.text || id)
  if (!skills.mine?.length) return <p className="m-0 text-[14px] text-muted-foreground">
    {tr('careers.career_profile.pick_what_you_re_good', 'Pick what you’re good at to see which of your skills this job uses.')}{href ? <> <Link href={href} className="font-extrabold text-foreground underline">{tr('careers.career_profile.pick_your_skills', 'Pick your skills')}</Link></> : null}
  </p>
  if (!skills.used.length) return <p className="m-0 text-[14px] text-muted-foreground">{tr('careers.career_profile.it_doesn_t_lean_on', 'It doesn’t lean on the skills you picked')}{href ? <>{tr('careers.career_profile.so_it_would_mean_learning', ', so it would mean learning new ones.')}{' '}<Link href={href} className="font-extrabold text-foreground underline">{tr('careers.career_profile.change_your_skills', 'Change your skills')}</Link></> : '.'}</p>
  return <div className="flex flex-col gap-1.5">
    <span className="text-[14px] font-bold">{tr('careers.career_profile.uses', 'Uses')}{' '}{skills.used.length === 1 ? 'one' : skills.used.length}{' '}{tr('careers.career_profile.of_your_skills', 'of your skills')}</span>
    <div className="flex flex-wrap gap-1.5">{words(skills.used).map((word) => <span key={word} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-extrabold" style={{ backgroundColor: `${color}22` }}><Check size={13} aria-hidden="true" />{word}</span>)}</div>
  </div>
}

type PathSort = 'near' | 'short' | 'cost' | 'online'
const PATH_SORTS: Array<[PathSort, string]> = [['near', 'Near you'], ['short', 'Shortest'], ['cost', 'Lowest cost'], ['online', 'Online']]
const STATE_NAMES: Record<string, string> = { OR: 'Oregon', WA: 'Washington', CA: 'California', ID: 'Idaho' }
/** Tuition for the whole program, where the Scorecard has a yearly figure. */
const totalCost = (program: CareerProgram) => program.tuition != null && program.years ? program.tuition * program.years : null

function ProgramCard({ program, onOpen }: { program: CareerProgram; onOpen: Dispatch<string> }) {
  const earnings = program.earnings_5yr ?? program.earnings_1yr
  const where = STATE_NAMES[program.state] || program.state
  const facts = [
    earnings != null ? { value: fullMoney(earnings), label: program.earnings_5yr != null ? 'a year, 5 years after' : 'a year, 1 year after' } : null,
    program.tuition != null ? { value: fullMoney(program.tuition), label: tr('careers.career_profile.tuition_a_year', 'tuition a year') } : null,
    program.debt != null ? { value: fullMoney(program.debt), label: tr('careers.career_profile.typical_loans', 'typical loans') } : null,
    program.in_state != null && !program.online ? { value: `${Math.round(program.in_state * 100)}%`, label: `work in ${where}` } : null,
  ].filter(Boolean) as Array<{ value: string; label: string }>
  const body = <>
    <span className="flex items-start justify-between gap-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-extrabold leading-snug">{program.school}</span>
        <span className="text-[12.5px] font-bold text-muted-foreground">{[program.credential_label, program.years ? `about ${program.years} year${program.years === 1 ? '' : 's'}` : '', program.online ? 'online' : `${program.city}, ${program.state}`].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-extrabold', program.near_rank <= 2 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
        {program.near_rank === 5 ? <Globe size={12} aria-hidden="true" /> : program.near_rank <= 2 ? <MapPin size={12} aria-hidden="true" /> : null}{program.near}
      </span>
    </span>
    {facts.length ? <span className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
      {facts.map((fact) => <span key={fact.label} className="flex flex-col"><span className="text-[14px] font-extrabold tabular-nums">{fact.value}</span><span className="text-[11.5px] font-bold leading-tight text-muted-foreground">{fact.label}</span></span>)}
    </span> : <span className="text-[12.5px] text-muted-foreground">{tr('careers.career_profile.too_few_graduates_for_the', 'Too few graduates for the Scorecard to share earnings.')}</span>}
  </>
  const shell = 'flex w-full flex-col gap-2 rounded-2xl bg-muted/60 px-3 py-2.5 text-left'
  return program.resource_uuid
    ? <button type="button" onClick={() => onOpen(program.resource_uuid!)} className={cn(shell, 'relative pr-8 hover:bg-muted')} aria-label={`${program.school}, ${program.credential_label}`}>
      {body}<ChevronRight size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </button>
    : <div className={shell}>{body}</div>
}

/** Schools that train for the career: Oregon's (or the learner's own state's) and fully online ones, nearest first. */
const TownButton = ({ onClick }: { onClick: () => void }) => <button type="button" onClick={onClick} className="font-extrabold text-foreground underline">{tr('careers.career_profile.add_your_town', 'Add your town')}</button>
const REACH_WORDS = { close: 'staying close', region: 'your region', state: 'anywhere in Oregon', anywhere: 'anywhere' } as const

/** Where "near you" starts and how far the learner would go, with a button to change it. */
function HomeLine({ home, onHome }: { home: Profile['home']; onHome: () => void }) {
  return <button type="button" onClick={onHome} className="flex min-h-9 items-center gap-1.5 self-start rounded-full border-2 border-border bg-card px-3 text-[13px] font-bold">
    <MapPin size={14} className="shrink-0 text-amber-600" aria-hidden="true" />
    {home ? <span>{home.label} · {REACH_WORDS[home.reach] || REACH_WORDS.state}{home.online ? tr('careers.career_profile.online_ok', ' · online OK') : ''}</span> : <span>{tr('careers.career_profile.set_your_home_base', 'Set your home base')}</span>}
    <span className="font-extrabold text-[var(--org-primary-color)]">{home ? tr('careers.career_profile.change', 'Change') : ''}</span>
  </button>
}

function Paths({ paths, onOpen, color, home, onHome }: { paths: CareerPaths; onOpen: Dispatch<string>; color: string; home: Profile['home']; onHome: () => void }) {
  const [sort, setSort] = React.useState<PathSort>('near')
  const [all, setAll] = React.useState(false)
  const programs = paths.programs
  if (!paths.has_data) return null
  if (!programs.length) return <div className="flex flex-col gap-2"><HomeLine home={home} onHome={onHome} /><p className="m-0 text-[13.5px] text-muted-foreground">{tr('careers.career_profile.no_schools_that_far_from', 'No schools that far from home list a program for this yet.')}</p></div>
  const list = sort === 'online' ? programs.filter((p) => p.online)
    : sort === 'short' ? [...programs].sort((a, b) => (a.years ?? 99) - (b.years ?? 99) || a.near_rank - b.near_rank)
    : sort === 'cost' ? [...programs].sort((a, b) => (totalCost(a) ?? Infinity) - (totalCost(b) ?? Infinity) || a.near_rank - b.near_rank)
    : programs
  const shown = all ? list : list.slice(0, 4)
  const schools = new Set(programs.filter((p) => !p.online || p.near_rank < 5).map((p) => p.unitid)).size
  return <div className="flex flex-col gap-2">
    <HomeLine home={home} onHome={onHome} />
    <span className="text-[13.5px] font-bold">{tr('careers.career_profile.schools_school', '{{schools}} school', { schools })}{schools === 1 ? '' : 's'}{' '}{tr('careers.career_profile.near_you_train_for_this', 'near you train for this')}{programs.some((p) => p.near_rank === 5) ? tr('careers.career_profile.plus_online_programs', ', plus online programs') : ''}.</span>
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label={tr('careers.career_profile.sort_programs', 'Sort programs')}>
      {PATH_SORTS.filter(([key]) => key !== 'online' || programs.some((p) => p.online)).map(([key, label]) => <button key={key} type="button" aria-pressed={sort === key} onClick={() => { setSort(key); setAll(false) }}
        className={cn('min-h-9 shrink-0 rounded-full border-2 px-3 text-[13px] font-extrabold', sort === key ? 'text-white' : 'border-border bg-card text-foreground')}
        style={sort === key ? { backgroundColor: color, borderColor: color } : undefined}>{label}</button>)}
    </div>
    {shown.length ? <div className="flex flex-col gap-2">{shown.map((program) => <ProgramCard key={`${program.unitid}-${program.cip}-${program.credential}`} program={program} onOpen={onOpen} />)}</div>
      : <p className="m-0 text-[13.5px] text-muted-foreground">{tr('careers.career_profile.none_of_these_programs_are', 'None of these programs are fully online.')}</p>}
    {list.length > 4 ? <button type="button" onClick={() => setAll(!all)} className="flex min-h-11 items-center gap-1 self-start text-[14px] font-extrabold text-[var(--org-primary-color)] hover:underline">
      {all ? tr('careers.career_profile.show_fewer', 'Show fewer') : `Show all ${list.length}`}<ChevronDown size={16} className={cn('transition-transform', all && 'rotate-180')} aria-hidden="true" />
    </button> : null}
    <p className="m-0 text-[12px] text-muted-foreground">{tr('careers.career_profile.earnings_and_loans_are_for', 'Earnings and loans are for graduates of each program; small programs aren’t shown.')}{' '}{sort === 'cost' ? tr('careers.career_profile.lowest_cost_uses_in_state', 'Lowest cost uses in-state tuition for the whole program. ') : ''}{paths.source}.</p>
  </div>
}

/** A career's page inside its resource sheet; `onAddToPlans` puts one of its routes on the learner's plan map. */
export default function CareerProfile({ code, token, onOpen, onAddToPlans }: { code: string; token: string; onOpen: Dispatch<string>; onAddToPlans?: Dispatch<Profile> }) {
  const org = useOrg() as any
  const { data, error } = useSWR(token ? ['career-profile', code, org?.id] : null, () => careersApi.profile(code, org?.id, token))
  const [compare, setCompare] = React.useState<CompareChoice[] | null>(null)
  const [homeOpen, setHomeOpen] = React.useState(false)
  const { mutate } = useSWRConfig()
  // A new home base changes pay, openings and schools on every career page.
  const homeSaved = () => mutate((key) => Array.isArray(key) && (key[0] === 'career-profile' || key[0] === 'life-home'))
  const openHome = () => setHomeOpen(true)
  if (error) return null
  if (!data) return <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label={tr('careers.career_profile.loading_career', 'Loading career')} /></div>
  const { career, scores, wages, outlook, home } = data
  const top = (career.top_interests || '').split('').slice(0, 2)
  const color = (CAREER_TYPES[top[0]] || CAREER_TYPES.E).color
  const zone = career.job_zone ? ZONE[career.job_zone] : null
  const quizHref = org?.slug ? getUriWithOrg(org.slug, '/portfolio/interests') : ''
  const similar = data.similar.filter((item) => item.resource_uuid)
  const here = wages.places.find((row) => row.place === wages.here)
  const tasks = career.tasks || []
  const routes = routesFor(career)

  const fit = data.match == null ? null : data.match >= 0.7 ? 'Strong fit' : data.match >= 0.4 ? 'Good fit' : 'Not much like your interests'
  const sides = top.map((letter) => CAREER_TYPES[letter]?.name).filter(Boolean).join(' and ')
  const fitLine = fit ? (data.match! >= 0.4 ? `${fit} with your ${sides} side.` : `${fit}: this career leans ${sides}.`) : null
  const payLine = here?.hourly.p50 != null ? `Usually ${hourlyMoney(here.hourly.p50)} an hour ${here.place === wages.here && home && here.place !== 'state:OR' ? `${inPlace(here)}, near you` : inPlace(here)}, about ${fullMoney(here.yearly.p50 || here.hourly.p50 * 2080)} a year.` : null
  const takeLine = zone ? `${zone[0]}.${outlook?.entry?.typical ? ` Oregon says most start with: ${outlook.entry.typical.toLowerCase()}.` : ''}` : null
  const lo = here ? Math.min(...wages.places.map((row) => row.hourly.p10 ?? row.hourly.p50 ?? 0)) * 0.9 : 0
  const hi = here ? Math.max(...wages.places.map((row) => row.hourly.p90 ?? row.hourly.p50 ?? 0)) * 1.05 : 1
  const credits = [
    `Career facts: ${career.source?.title || 'O*NET Database'}, U.S. Department of Labor, Employment and Training Administration (CC BY 4.0); we shortened some descriptions. O*NET-SOC ${career.code}.`,
    here ? `Pay: ${credit(here)}.` : '',
    wages.history['state:OR']?.length >= 3 ? 'Pay over time: BLS Occupational Employment and Wage Statistics.' : '',
    outlook ? `Jobs and openings: ${outlook.source}.` : '',
    data.paths?.programs.length ? `Programs: ${data.paths.source}, linked to careers through the ${data.paths.credit}.` : '',
    career.job_zone ? `Training: O*NET job zone ${career.job_zone} (${TRAINING[career.job_zone]})${career.education?.length ? ' and O*NET’s survey of the education workers say the job needs' : ''}.` : '',
  ].filter(Boolean)

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold">
      {top.map((letter) => <span key={letter} className="rounded-full px-2.5 py-1 font-extrabold text-white" style={{ backgroundColor: CAREER_TYPES[letter]?.color }}>{CAREER_TYPES[letter]?.name}</span>)}
      {data.match != null ? <span className="text-muted-foreground">{tr('careers.career_profile.matchlabel_for_you', '{{matchLabel}} for you', { matchLabel: matchLabel(data.match) })}</span> : null}
    </div>

    {tasks.length ? <Section title={tr('careers.career_profile.what_would_i_do', 'What would I do?')} speak={tasks.slice(0, 3).join('. ')} moreLabel="More about the work" more={tasks.length > 3 || career.alt_titles?.length ? <>
      {tasks.slice(3).map((task) => <span key={task} className="text-[14px]">{task}</span>)}
      {career.alt_titles?.length ? <span className="text-[12.5px] text-muted-foreground">{tr('careers.career_profile.also_called_join', 'Also called: {{join}}', { join: career.alt_titles.slice(0, 6).join(', ') })}</span> : null}
    </> : undefined}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {tasks.slice(0, 3).map((task) => <li key={task} className="flex gap-2 text-[14.5px] leading-snug"><Check size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true" /><span>{task}</span></li>)}
      </ul>
    </Section> : null}

    <Section title={tr('careers.career_profile.would_i_like_it', 'Would I like it?')} headline={fitLine || 'Find out how this fits you.'} speak={fitLine || undefined} moreLabel="Your interests next to this career" more={scores ? <>
      <div className="flex gap-4 text-[12px] font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-foreground/35" />{tr('careers.career_profile.you_2', 'You')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{tr('careers.career_profile.this_career', 'This career')}</span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        {ORDER.map((letter) => <React.Fragment key={letter}>
          <span className="flex items-center gap-1.5 text-[13px] font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CAREER_TYPES[letter].color }} />{CAREER_TYPES[letter].name}</span>
          <span className="flex flex-col gap-1">
            <span className="h-1.5 rounded-full bg-foreground/35" style={{ width: `${(scores[letter] || 0) / Math.max(1, ...Object.values(scores)) * 100}%` }} />
            <span className="h-1.5 rounded-full" style={{ width: `${((career.interests[letter] || 0) / 7) * 100}%`, backgroundColor: CAREER_TYPES[letter].color }} />
          </span>
        </React.Fragment>)}
      </div>
    </> : undefined}>
      {!scores ? <p className="m-0 text-[14px] text-muted-foreground">{tr('careers.career_profile.answer_a_few_questions_or', 'Answer a few questions or sort some pictures to see how this career lines up with you.')}{quizHref ? <> <Link href={quizHref} className="font-extrabold text-foreground underline">{tr('careers.career_profile.find_your_interests', 'Find your interests')}</Link></> : null}</p> : null}
      <SkillsLine skills={data.skills} color={color} href={org?.slug ? getUriWithOrg(org.slug, '/portfolio/results?open=skills-values') : ''} />
    </Section>

    {here && payLine ? <Section title={tr('careers.career_profile.what_does_it_pay', 'What does it pay?')} headline={payLine} speak={payLine} moreLabel="Pay around Oregon and over time" more={<PayMore wages={wages} color={color} />}>
      <PayRange wage={here} color={color} lo={lo} hi={hi} />
      <div className="flex justify-between text-[12.5px] font-bold text-muted-foreground">
        <span>{here.hourly.p10 != null ? tr('careers.career_profile.lower_hourlymoney', 'Lower: {{hourlyMoney}}', { hourlyMoney: hourlyMoney(here.hourly.p10) }) : here.hourly.p25 != null ? tr('careers.career_profile.lower_hourlymoney', 'Lower: {{hourlyMoney}}', { hourlyMoney: hourlyMoney(here.hourly.p25) }) : ''}</span>
        <span>{here.hourly.p90 != null ? tr('careers.career_profile.higher_hourlymoney', 'Higher: {{hourlyMoney}}', { hourlyMoney: hourlyMoney(here.hourly.p90) }) : here.hourly.p75 != null ? tr('careers.career_profile.higher_hourlymoney', 'Higher: {{hourlyMoney}}', { hourlyMoney: hourlyMoney(here.hourly.p75) }) : ''}</span>
      </div>
      {!home ? <p className="m-0 text-[13px] text-muted-foreground">{tr('careers.career_profile.showing_oregon', 'Showing Oregon.')}{' '}<TownButton onClick={openHome} />{' '}{tr('careers.career_profile.to_see_pay_near_you', 'to see pay near you.')}</p> : null}
    </Section> : null}

    {outlook ? <JobsSection outlook={outlook} home={home} onHome={openHome} /> : null}

    {zone ? <Section title={tr('careers.career_profile.what_does_it_take', 'What does it take?')} headline={takeLine} speak={`${takeLine} ${zone[1]}`}>
      <div className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4, 5].map((step) => <span key={step} className="h-2 flex-1 rounded-full" style={{ backgroundColor: step <= (career.job_zone || 0) ? color : 'hsl(var(--muted))' }} />)}</div>
      <div className="flex justify-between text-[11.5px] font-bold text-muted-foreground"><span>{tr('careers.career_profile.less_training', 'Less training')}</span><span>{tr('careers.career_profile.more', 'More')}</span></div>
      <p className="m-0 text-[14px]">{zone[1]}</p>
      {career.education?.length ? <Schooling education={career.education} color={color} /> : null}
    </Section> : null}

    <Section title={tr('careers.career_profile.how_do_i_get_there', 'How do I get there?')} accent={color} headline={routes.length === 1 ? 'One main way in.' : `${routes.length} ways in.`}>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {routes.map((route, index) => <li key={index} className="flex flex-col gap-0.5 rounded-2xl bg-muted/60 px-3 py-2">
          <span className="text-[14px] font-extrabold">{route.steps.map((step) => step.title).join(' → ')}</span>
          {route.why ? <span className="text-[12.5px] font-semibold text-muted-foreground">{route.why}</span> : null}
        </li>)}
      </ol>
      {data.paths ? <Paths paths={data.paths} onOpen={onOpen} color={color} home={home} onHome={openHome} /> : null}
      {onAddToPlans ? <button type="button" onClick={() => onAddToPlans(data)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-extrabold text-white shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-[3px] active:shadow-[0_1px_0_rgba(0,0,0,0.25)]" style={{ backgroundColor: color }}>
        <GitBranch size={16} aria-hidden="true" />{tr('careers.career_profile.add_to_my_plan_ideas', 'Add to my plan ideas')}
      </button> : null}
    </Section>

    <Section title={tr('careers.career_profile.what_else_is_like_this', 'What else is like this?')}>
      {similar.length ? <div className="flex flex-col gap-2">
        {similar.map((item) => <div key={item.code} className="flex items-stretch gap-1.5">
          <button type="button" onClick={() => onOpen(item.resource_uuid!)} className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-left hover:bg-muted">
            <span className="text-[14.5px] font-extrabold">{item.title}</span>
            <span className="shrink-0 text-[12.5px] font-bold text-muted-foreground">{[item.job_zone ? TRAINING[item.job_zone] : '', item.pay ? `$${Math.round(item.pay.yearly / 2080)}/hr` : ''].filter(Boolean).join(' · ')}</span>
          </button>
          <button type="button" onClick={() => setCompare([{ code: career.code, title: career.title }, { code: item.code, title: item.title }])} aria-label={`Compare with ${item.title}`} title={tr('careers.career_compare.compare', 'Compare')}
            className="flex w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeftRight size={16} aria-hidden="true" /></button>
        </div>)}
      </div> : null}
      <button type="button" onClick={() => setCompare([{ code: career.code, title: career.title }])} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-[14px] font-extrabold hover:bg-muted/60">
        <ArrowLeftRight size={16} aria-hidden="true" />{tr('careers.career_profile.compare_with_another_career', 'Compare with another career')}
      </button>
    </Section>
    {homeOpen ? <HomeBaseSheet token={token} onClose={() => setHomeOpen(false)} onSaved={homeSaved} /> : null}
    {compare ? <CareerCompare start={compare} token={token} onClose={() => setCompare(null)} suggestions={data.similar.map((item) => ({ code: item.code, title: item.title }))} /> : null}

    <details className="group rounded-2xl px-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 text-[12.5px] font-bold text-muted-foreground hover:text-foreground">
        {tr('careers.career_profile.how_we_know', 'How we know')}{here ? tr('careers.career_profile.o_net_value', ': O*NET, {{value}}', { value: here.publisher || 'BLS' }) : tr('careers.career_profile.o_net', ': O*NET')}<ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pb-2 text-[12px] font-semibold leading-relaxed text-muted-foreground">{credits.map((line) => <li key={line}>{line}</li>)}</ul>
    </details>
  </div>
}
