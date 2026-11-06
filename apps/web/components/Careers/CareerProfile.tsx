'use client'

import React, { type Dispatch } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, ChevronDown, GitBranch, Loader2, MapPin } from 'lucide-react'
import { SpeakButton } from '@components/Accessibility/ReadAloud'
import { useOrg } from '@components/Contexts/OrgContext'
import { routesFor } from '@components/Goals/phases/graph'
import { getUriWithOrg } from '@services/config/config'
import {
  careersApi, fullMoney, hourlyMoney, type CareerOutlook, type CareerProfile as Profile, type CareerWages, type EducationShare, type PlaceWage,
} from '@services/life/careers'
import { cn } from '@/lib/utils'
import { CAREER_TYPES, TRAINING, matchLabel } from './CareerTile'

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
  { label: 'High school or less', levels: [1, 2], shade: 0.22 },
  { label: 'Certificate or some college', levels: [3, 4], shade: 0.42 },
  { label: 'Associate’s', levels: [5], shade: 0.62 },
  { label: 'Bachelor’s', levels: [6, 7], shade: 0.82 },
  { label: 'Master’s or more', levels: [8, 9, 10, 11, 12], shade: 1 },
]

function Section({ title, headline, speak, accent, more, moreLabel = 'More', children }: {
  title: string; headline?: React.ReactNode; speak?: string; accent?: string; more?: React.ReactNode; moreLabel?: string; children?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  return <section className="flex flex-col gap-2.5 rounded-[20px] border-2 bg-card p-4" style={{ borderColor: accent || 'hsl(var(--border))', boxShadow: `0 4px 0 ${accent ? `${accent}55` : 'hsl(var(--border))'}` }}>
    <div className="flex items-start justify-between gap-2">
      <h3 className="m-0 pt-1 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
      {speak ? <SpeakButton text={speak} size="sm" label={`Read “${title}” aloud`} /> : null}
    </div>
    {headline ? <p className="m-0 text-[16px] font-bold leading-snug">{headline}</p> : null}
    {children}
    {more ? <>
      {open ? <div id={id} className="flex flex-col gap-3 border-t-2 border-border/60 pt-3">{more}</div> : null}
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="-mb-1 flex min-h-11 items-center gap-1 self-start text-[14px] font-extrabold text-[var(--org-primary-color)] hover:underline">
        {open ? 'Show less' : moreLabel}<ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
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
  return <div className="relative h-11" role="img" aria-label={`Hourly pay ${wage.label === 'Oregon' ? 'in Oregon' : `in ${wage.label}`}: ${label}`}>
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
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose a place">
      {chips.map((row) => <button key={row.place} type="button" aria-pressed={row.place === current.place} onClick={() => setPick(row.place)}
        className={cn('min-h-10 rounded-full border-2 px-3 text-[12.5px] font-extrabold', row.place === current.place ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}>
        {cap(row.label)}{row.place === wages.here && row.place !== 'state:OR' ? ' (you)' : ''}
      </button>)}
    </div>
    <PayRange wage={current} color={color} lo={lo} hi={hi} />
    <div className="grid grid-cols-3 gap-2">
      <Tile value={current.hourly.p10 != null ? hourlyMoney(current.hourly.p10) : '–'} label="1 in 10 earn under" />
      <Tile value={current.hourly.p50 != null ? hourlyMoney(current.hourly.p50) : '–'} label="Half earn over" tone={color} />
      <Tile value={current.hourly.p90 != null ? hourlyMoney(current.hourly.p90) : '–'} label="1 in 10 earn over" />
    </div>
    <p className="m-0 text-[13px] text-muted-foreground">The dark band is the middle half of workers {inPlace(current)}. Hourly pay before taxes; a full-time year is about 2,080 hours. {credit(current)}.</p>
    {sorted.length > 1 ? <div className="flex flex-col gap-1">
      <h4 className="m-0 text-[13px] font-extrabold">Typical pay around Oregon</h4>
      {sorted.map((row) => <div key={row.place} className={cn('grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13.5px]', row.place === wages.here && 'bg-amber-500/15')}>
        <span className="flex min-w-0 items-center gap-1 font-bold">{row.place === wages.here ? <MapPin size={13} className="shrink-0 text-amber-600" aria-label="Near you" /> : null}<span className="truncate">{cap(row.label)}</span></span>
        <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${((row.hourly.p50 || 0) / top) * 100}%`, backgroundColor: row.place === wages.here ? '#b26b00' : color }} /></span>
        <span className="font-extrabold tabular-nums">{row.hourly.p50 != null ? hourlyMoney(row.hourly.p50) : '–'}</span>
      </div>)}
      <p className="m-0 text-[12px] text-muted-foreground">Pay in small areas can swing from year to year.</p>
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
    <h4 className="m-0 text-[13px] font-extrabold">Over the years</h4>
    <p className="m-0 text-[14px]">Typical Oregon pay went from {hourlyMoney(first.hourly!)} an hour in {first.year} to {hourlyMoney(last.hourly!)} in {last.year}.</p>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Typical hourly pay, ${first.year} to ${last.year}: Oregon ${hourlyMoney(first.hourly!)} to ${hourlyMoney(last.hourly!)}${usLast ? `, the US ${hourlyMoney(us[0].hourly!)} to ${hourlyMoney(usLast.hourly!)}` : ''}`}>
      <line x1="0" x2={W - 70} y1={H - 20} y2={H - 20} stroke="currentColor" strokeOpacity="0.2" />
      {us.length > 1 ? <polyline points={line(us)} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.5" strokeLinejoin="round" /> : null}
      <polyline points={line(oregon)} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <text x={px(last.year) + 6} y={py(last.hourly!) + 4} fontSize="12" fontWeight="800" fill={color}>Oregon {hourlyMoney(last.hourly!)}</text>
      {usLast ? <text x={px(usLast.year) + 6} y={py(usLast.hourly!) + 4} fontSize="12" fontWeight="800" fill="currentColor" fillOpacity="0.7">US {hourlyMoney(usLast.hourly!)}</text> : null}
      <text x="0" y={H - 4} fontSize="11" fill="currentColor" fillOpacity="0.7">{y0}</text>
      <text x={W - 70} y={H - 4} fontSize="11" fill="currentColor" fillOpacity="0.7" textAnchor="end">{y1}</text>
    </svg>
    <p className="m-0 text-[12px] text-muted-foreground">Not adjusted for rising prices.</p>
  </div>
}

const growthWord = (growth: number | null) => growth == null ? '' : growth > 0.03 ? 'and growing' : growth < -0.03 ? 'but shrinking' : 'and holding steady'
const percent = (growth: number) => `${growth > 0 ? '+' : ''}${(growth * 100).toFixed(1)}%`
const many = (openings: number) => openings >= 100 ? 'Lots of openings' : openings >= 20 ? 'Steady openings' : openings >= 5 ? 'A few openings' : 'Very few openings'

function JobsSection({ outlook, home }: { outlook: CareerOutlook; home: Profile['home'] }) {
  const oregon = outlook.places.find((row) => row.place === 'state:OR')
  const near = outlook.here ? outlook.places.find((row) => row.place === outlook.here) : null
  const main = near || oregon
  if (!main || main.openings == null) return null
  const span = outlook.end && outlook.start ? outlook.end - outlook.start : 10
  const newJobs = main.jobs != null && main.jobs_later != null ? (main.jobs_later - main.jobs) / span : null
  const headline = `${many(main.openings)}: about ${main.openings.toLocaleString('en-US')} a year ${inPlace(main)}${main.growth != null ? `, ${growthWord(main.growth)}` : ''}.`
  const regions = outlook.places.filter((row) => row.place !== 'state:OR' && row.openings != null).sort((a, b) => (b.openings || 0) - (a.openings || 0))
  return <Section title="Can I get a job?" headline={headline} speak={headline} moreLabel="Jobs over 10 years, by region" more={<>
    <p className="m-0 text-[14px]">{outlook.start && outlook.end ? `From ${outlook.start} to ${outlook.end}, ` : ''}Oregon expects {oregon?.jobs != null && oregon.jobs_later != null ? `${oregon.jobs.toLocaleString('en-US')} jobs to become ${oregon.jobs_later.toLocaleString('en-US')}` : 'these openings'}.</p>
    {regions.length ? <div className="flex flex-col gap-1">
      {regions.map((row) => <div key={row.place} className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-[13.5px]', row.place === outlook.here && 'bg-amber-500/15')}>
        <span className="flex min-w-0 items-center gap-1 font-bold">{row.place === outlook.here ? <MapPin size={13} className="shrink-0 text-amber-600" aria-label="Near you" /> : null}<span className="truncate">{cap(row.label)}</span></span>
        <span className="text-[12.5px] font-bold text-muted-foreground tabular-nums">{row.growth != null ? percent(row.growth) : ''}</span>
        <span className="font-extrabold tabular-nums">{row.openings!.toLocaleString('en-US')} a year</span>
      </div>)}
    </div> : null}
    <p className="m-0 text-[12px] text-muted-foreground">{outlook.source}. Openings count new jobs and jobs people leave. Oregon leaves out some small regions.</p>
  </>}>
    <div className="grid grid-cols-3 gap-2">
      {near ? <Tile value={near.openings!.toLocaleString('en-US')} label="openings a year near you" /> : null}
      {oregon?.openings != null ? <Tile value={oregon.openings.toLocaleString('en-US')} label="a year in Oregon" /> : null}
      {main.growth != null ? <Tile value={percent(main.growth)} label={`${main.growth >= 0 ? 'more' : 'fewer'} jobs by ${outlook.end || 'ten years'}`} /> : null}
    </div>
    {newJobs != null && main.openings > Math.max(1, newJobs) * 2 ? <p className="m-0 text-[13px] text-muted-foreground">Most openings come from people retiring or changing jobs, not only new jobs.</p> : null}
    {!near && !home ? <p className="m-0 text-[13px] text-muted-foreground">Add your town to your portfolio to see openings near you.</p> : null}
  </Section>
}

function Schooling({ education, color }: { education: EducationShare[]; color: string }) {
  const groups = SCHOOLING.map((group) => ({ ...group, pct: education.filter((row) => group.levels.includes(row.level)).reduce((sum, row) => sum + row.pct, 0) })).filter((group) => group.pct >= 1)
  const total = groups.reduce((sum, group) => sum + group.pct, 0)
  if (!groups.length || total < 50) return null
  return <div className="flex flex-col gap-1.5">
    <span className="text-[13.5px] font-bold">What people in this job say you need</span>
    <div className="flex h-6 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={groups.map((group) => `${group.label} ${Math.round(group.pct)} percent`).join(', ')}>
      {groups.map((group) => <span key={group.label} style={{ width: `${(group.pct / total) * 100}%`, backgroundColor: color, opacity: group.shade }} />)}
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-bold text-muted-foreground">{groups.map((group) => <span key={group.label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color, opacity: group.shade }} />{group.label} {Math.round(group.pct)}%</span>)}</div>
  </div>
}

/** A career's page inside its resource sheet; `onAddToPlans` puts one of its routes on the learner's plan map. */
export default function CareerProfile({ code, token, onOpen, onAddToPlans }: { code: string; token: string; onOpen: Dispatch<string>; onAddToPlans?: Dispatch<Profile> }) {
  const org = useOrg() as any
  const { data, error } = useSWR(token ? ['career-profile', code, org?.id] : null, () => careersApi.profile(code, org?.id, token))
  if (error) return null
  if (!data) return <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading career" /></div>
  const { career, scores, wages, outlook, home } = data
  const top = (career.top_interests || '').split('').slice(0, 2)
  const color = (CAREER_TYPES[top[0]] || CAREER_TYPES.E).color
  const zone = career.job_zone ? ZONE[career.job_zone] : null
  const quizHref = org?.slug ? getUriWithOrg(org.slug, '/portfolio/interests') : ''
  const portfolioHref = org?.slug ? getUriWithOrg(org.slug, '/portfolio') : ''
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
    career.job_zone ? `Training: O*NET job zone ${career.job_zone} (${TRAINING[career.job_zone]})${career.education?.length ? ' and O*NET’s survey of the education workers say the job needs' : ''}.` : '',
  ].filter(Boolean)

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold">
      {top.map((letter) => <span key={letter} className="rounded-full px-2.5 py-1 font-extrabold text-white" style={{ backgroundColor: CAREER_TYPES[letter]?.color }}>{CAREER_TYPES[letter]?.name}</span>)}
      {data.match != null ? <span className="text-muted-foreground">{matchLabel(data.match)} for you</span> : null}
    </div>

    {tasks.length ? <Section title="What would I do?" speak={tasks.slice(0, 3).join('. ')} moreLabel="More about the work" more={tasks.length > 3 || career.alt_titles?.length ? <>
      {tasks.slice(3).map((task) => <span key={task} className="text-[14px]">{task}</span>)}
      {career.alt_titles?.length ? <span className="text-[12.5px] text-muted-foreground">Also called: {career.alt_titles.slice(0, 6).join(', ')}</span> : null}
    </> : undefined}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {tasks.slice(0, 3).map((task) => <li key={task} className="flex gap-2 text-[14.5px] leading-snug"><Check size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true" /><span>{task}</span></li>)}
      </ul>
    </Section> : null}

    <Section title="Would I like it?" headline={fitLine || 'Find out how this fits you.'} speak={fitLine || undefined} moreLabel="Your interests next to this career" more={scores ? <>
      <div className="flex gap-4 text-[12px] font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-foreground/35" />You</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />This career</span>
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
      {!scores ? <p className="m-0 text-[14px] text-muted-foreground">Answer a few questions or sort some pictures to see how this career lines up with you.{quizHref ? <> <Link href={quizHref} className="font-extrabold text-foreground underline">Find your interests</Link></> : null}</p> : null}
    </Section>

    {here && payLine ? <Section title="What does it pay?" headline={payLine} speak={payLine} moreLabel="Pay around Oregon and over time" more={<PayMore wages={wages} color={color} />}>
      <PayRange wage={here} color={color} lo={lo} hi={hi} />
      <div className="flex justify-between text-[12.5px] font-bold text-muted-foreground">
        <span>{here.hourly.p10 != null ? `Lower: ${hourlyMoney(here.hourly.p10)}` : here.hourly.p25 != null ? `Lower: ${hourlyMoney(here.hourly.p25)}` : ''}</span>
        <span>{here.hourly.p90 != null ? `Higher: ${hourlyMoney(here.hourly.p90)}` : here.hourly.p75 != null ? `Higher: ${hourlyMoney(here.hourly.p75)}` : ''}</span>
      </div>
      {!home ? <p className="m-0 text-[13px] text-muted-foreground">Showing Oregon. {portfolioHref ? <Link href={portfolioHref} className="font-extrabold text-foreground underline">Add your town to your portfolio</Link> : 'Add your town to your portfolio'} to see pay near you.</p> : null}
    </Section> : null}

    {outlook ? <JobsSection outlook={outlook} home={home} /> : null}

    {zone ? <Section title="What does it take?" headline={takeLine} speak={`${takeLine} ${zone[1]}`}>
      <div className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4, 5].map((step) => <span key={step} className="h-2 flex-1 rounded-full" style={{ backgroundColor: step <= (career.job_zone || 0) ? color : 'hsl(var(--muted))' }} />)}</div>
      <div className="flex justify-between text-[11.5px] font-bold text-muted-foreground"><span>Less training</span><span>More</span></div>
      <p className="m-0 text-[14px]">{zone[1]}</p>
      {career.education?.length ? <Schooling education={career.education} color={color} /> : null}
    </Section> : null}

    <Section title="How do I get there?" accent={color} headline={routes.length === 1 ? 'One main way in.' : `${routes.length} ways in.`}>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {routes.map((route, index) => <li key={index} className="flex flex-col gap-0.5 rounded-2xl bg-muted/60 px-3 py-2">
          <span className="text-[14px] font-extrabold">{route.steps.map((step) => step.title).join(' → ')}</span>
          {route.why ? <span className="text-[12.5px] font-semibold text-muted-foreground">{route.why}</span> : null}
        </li>)}
      </ol>
      {onAddToPlans ? <button type="button" onClick={() => onAddToPlans(data)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-extrabold text-white shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-[3px] active:shadow-[0_1px_0_rgba(0,0,0,0.25)]" style={{ backgroundColor: color }}>
        <GitBranch size={16} aria-hidden="true" />Add to my plan ideas
      </button> : null}
    </Section>

    {similar.length ? <Section title="What else is like this?">
      <div className="flex flex-col gap-2">
        {similar.map((item) => <button key={item.code} type="button" onClick={() => onOpen(item.resource_uuid!)} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-left hover:bg-muted">
          <span className="text-[14.5px] font-extrabold">{item.title}</span>
          <span className="shrink-0 text-[12.5px] font-bold text-muted-foreground">{[item.job_zone ? TRAINING[item.job_zone] : '', item.pay ? `$${Math.round(item.pay.yearly / 2080)}/hr` : ''].filter(Boolean).join(' · ')}</span>
        </button>)}
      </div>
    </Section> : null}

    <details className="group rounded-2xl px-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 text-[12.5px] font-bold text-muted-foreground hover:text-foreground">
        How we know{here ? `: O*NET, ${here.publisher || 'BLS'}` : ': O*NET'}<ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pb-2 text-[12px] font-semibold leading-relaxed text-muted-foreground">{credits.map((line) => <li key={line}>{line}</li>)}</ul>
    </details>
  </div>
}
