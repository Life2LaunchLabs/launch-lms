'use client'

import React, { type Dispatch } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, GitBranch, Loader2, Star } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { careersApi, fullMoney, shortMoney, type CareerProfile as Profile } from '@services/life/careers'
import { CAREER_TYPES, CareerTile, TRAINING, matchLabel } from './CareerTile'

const ORDER = ['R', 'I', 'A', 'S', 'E', 'C']
const ZONE: Record<number, [string, string]> = {
  1: ['Little or no training', 'Many people start right after high school and learn on the job.'],
  2: ['High school plus on-the-job training', 'Many people start right after high school and learn on the job.'],
  3: ['Training after high school', 'Think a certificate, an apprenticeship or a 2-year degree.'],
  4: ['Usually a 4-year degree', 'Most people in this job have a bachelor’s degree.'],
  5: ['Graduate school', 'Most people in this job have a master’s, doctorate or professional degree.'],
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2.5">
    <h3 className="m-0 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
    {children}
  </section>
}

/** The middle half of pay as a band, with the typical pay as a tick. */
function PayBand({ low, mid, high, color }: { low: number; mid: number; high: number; color: string }) {
  const lo = Math.min(30000, low), hi = Math.max(180000, high)
  const x = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`
  return <div className="relative h-9" role="img" aria-label={`Middle half of pay ${fullMoney(low)} to ${fullMoney(high)}, typical ${fullMoney(mid)}`}>
    <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
    <span className="absolute top-1/2 h-4 -translate-y-1/2 rounded-full opacity-85" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})`, backgroundColor: color }} />
    <span className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: x(mid) }} />
  </div>
}

/**
 * A career's page inside its resource sheet: what people do, pay in Oregon and around it (places on the learner's
 * phases starred and first), training, how it lines up with their interest quiz, and similar careers. Every
 * fact names its source.
 */
export default function CareerProfile({ code, token, onOpen, onAddToPlans }: { code: string; token: string; onOpen: Dispatch<string>; onAddToPlans?: Dispatch<Profile> }) {
  const org = useOrg() as any
  const { data, error } = useSWR(token ? ['career-profile', code, org?.id] : null, () => careersApi.profile(code, org?.id, token))
  if (error) return null
  if (!data) return <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading career" /></div>
  const { career, pay, scores } = data
  const top = (career.top_interests || '').split('').slice(0, 2)
  const color = (CAREER_TYPES[top[0]] || CAREER_TYPES.E).color
  const zone = career.job_zone ? ZONE[career.job_zone] : null
  const overall = pay.overall
  const widest = Math.max(1, ...pay.areas.map((row) => row.median))
  const starred = pay.areas.some((row) => row.mine)
  const similar = data.similar.filter((item) => item.resource_uuid)
  const quizHref = org?.slug ? getUriWithOrg(org.slug, '/portfolio/interests') : ''

  return <div className="flex flex-col gap-[18px]">
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold">
      {top.map((letter) => <span key={letter} className="rounded-full px-2.5 py-1 font-extrabold text-white" style={{ backgroundColor: CAREER_TYPES[letter]?.color }}>{CAREER_TYPES[letter]?.name}</span>)}
      {data.match != null ? <span className="text-muted-foreground">{matchLabel(data.match)} for you</span> : null}
    </div>

    {career.tasks?.length ? <Block title="What you’d do">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {career.tasks.map((task) => <li key={task} className="flex gap-2 text-[14px]"><Check size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true" /><span>{task}</span></li>)}
      </ul>
    </Block> : null}

    {overall?.median ? <Block title={`Pay in ${overall.place}`}>
      {overall.p25 && overall.p75 ? <PayBand low={overall.p25} mid={overall.median} high={overall.p75} color={color} /> : null}
      <p className="m-0 text-[14px]">
        {overall.p25 && overall.p75 ? <>Half earn between <b>{fullMoney(overall.p25)}</b> and <b>{fullMoney(overall.p75)}</b>. </> : null}
        Typical <b>{fullMoney(overall.median)}</b> a year (about ${Math.round(overall.median / 2080)} an hour).
      </p>
    </Block> : null}

    {pay.areas.length ? <Block title="Pay around Oregon">
      <div className="flex flex-col gap-1">
        {pay.areas.map((row) => <div key={row.area} className={`grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-[13.5px] ${row.mine ? 'bg-amber-500/10' : ''}`}>
          <span className="flex min-w-0 items-center gap-1 font-bold">
            {row.mine ? <Star size={13} className="shrink-0 fill-amber-500 text-amber-500" aria-label="On your plan" /> : null}
            <span className="truncate">{row.my_place && row.my_place !== row.label ? `${row.my_place} (${row.label})` : row.label}</span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(row.median / widest) * 100}%`, backgroundColor: color }} /></span>
          <span className="font-extrabold tabular-nums">{shortMoney(row.median)}</span>
        </div>)}
      </div>
      <p className="m-0 text-[12px] text-muted-foreground">{starred ? '★ Places on your plan come first. ' : ''}Typical yearly pay before taxes.</p>
    </Block> : null}

    {zone ? <Block title="Getting there">
      <div className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4, 5].map((step) => <span key={step} className="h-2 flex-1 rounded-full" style={{ backgroundColor: step <= (career.job_zone || 0) ? color : 'hsl(var(--muted))' }} />)}</div>
      <div className="flex justify-between text-[11.5px] font-bold text-muted-foreground"><span>Less training</span><span>More</span></div>
      <p className="m-0 text-[14px]"><b>{zone[0]}.</b> {zone[1]}</p>
      {onAddToPlans ? <button type="button" onClick={() => onAddToPlans(data)} className="flex h-11 items-center gap-2 self-start rounded-2xl border-2 border-border bg-card px-4 text-sm font-bold shadow-[0_4px_0_hsl(var(--border))] hover:bg-raised active:translate-y-[3px] active:shadow-[0_1px_0_hsl(var(--border))]">
        <GitBranch size={16} aria-hidden="true" />Add to my plans
      </button> : null}
    </Block> : null}

    <Block title="Your interests and this career">
      {scores ? <>
        <div className="flex gap-4 text-[12px] font-bold text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-foreground/35" />You</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />This career</span>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          {ORDER.map((letter) => <React.Fragment key={letter}>
            <span className="flex items-center gap-1.5 text-[13px] font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CAREER_TYPES[letter].color }} />{CAREER_TYPES[letter].name}</span>
            <span className="flex flex-col gap-1">
              <span className="h-1.5 rounded-full bg-foreground/35" style={{ width: `${((scores[letter] || 0) / 20) * 100}%` }} />
              <span className="h-1.5 rounded-full" style={{ width: `${((career.interests[letter] || 0) / 7) * 100}%`, backgroundColor: CAREER_TYPES[letter].color }} />
            </span>
          </React.Fragment>)}
        </div>
      </> : <p className="m-0 text-[14px] text-muted-foreground">Take the interest quiz to see how this career lines up with you.{quizHref ? <> <Link href={quizHref} className="font-extrabold text-foreground underline">Take the quiz</Link></> : null}</p>}
    </Block>

    {career.alt_titles?.length ? <Block title="Also called">
      <div className="flex flex-wrap gap-1.5">{career.alt_titles.slice(0, 8).map((title) => <span key={title} className="rounded-full bg-muted px-2.5 py-1 text-[12.5px] font-bold">{title}</span>)}</div>
    </Block> : null}

    {similar.length ? <Block title="Careers like this">
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {similar.map((item) => <CareerTile key={item.code} career={item} onOpen={() => onOpen(item.resource_uuid!)} />)}
      </div>
    </Block> : null}

    <p className="m-0 text-[11.5px] font-semibold leading-relaxed text-muted-foreground">
      Career facts: {career.source?.title || 'O*NET Database'}, U.S. Department of Labor, Employment and Training Administration (CC BY 4.0). Pay: {pay.source}. O*NET-SOC {career.code}.
      {career.job_zone ? ` Training: O*NET job zone ${career.job_zone} (${TRAINING[career.job_zone]}).` : ''}
    </p>
  </div>
}
