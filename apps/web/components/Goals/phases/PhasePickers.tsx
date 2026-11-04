'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ArrowLeft, BookOpen, Briefcase, Heart, Plane, Search, Sparkles, UserSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lifeApi, type Activity, type Career, type School } from '@services/life/life'
import { KINDS, LEVELS, LIVING } from './setup'

const KIND_ICONS: Record<Activity['kind'], React.ElementType> = { learning: BookOpen, working: Briefcase, looking: UserSearch, caring: Heart, gap: Plane, other: Sparkles }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const tile = 'flex items-center gap-3 rounded-2xl bg-card p-3 text-left font-bold shadow-[0_0_0_2px_hsl(var(--border))] hover:shadow-[0_0_0_2px_var(--org-primary-color)]'
export const chip = (on: boolean) => cn('rounded-full px-3.5 py-2 text-sm font-extrabold', on ? 'bg-foreground text-background' : 'bg-muted hover:bg-raised')

/** Month and year selects for when a phase starts. */
export function MonthPicker({ value, onChange, from = 2000, to = new Date().getFullYear() + 25 }: { value: string; onChange: (v: string) => void; from?: number; to?: number }) {
  const [y, m] = value.split('-').map(Number)
  const set = (yy: number, mm: number) => onChange(`${yy}-${String(mm).padStart(2, '0')}`)
  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i)
  const cls = 'h-12 rounded-2xl bg-muted px-3 text-base font-bold'
  return <div className="grid grid-cols-2 gap-2">
    <label className="grid gap-1 text-sm font-bold">Month<select className={cls} value={m} onChange={(e) => set(y, Number(e.target.value))}>{MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-bold">Year<select className={cls} value={y} onChange={(e) => set(Number(e.target.value), m)}>{years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}</select></label>
  </div>
}

export function LivingPicker({ value, onPick }: { value?: string | null; onPick: (key: string) => void }) {
  return <div className="flex flex-wrap gap-2">{LIVING.map(([key, title]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onPick(key)} className={chip(value === key)}>{title}</button>)}</div>
}

function useSearch<T>(q: string, run: (q: string) => Promise<T[]>, enabled = true) {
  const [rows, setRows] = React.useState<T[]>([])
  const runRef = React.useRef(run)
  React.useEffect(() => { runRef.current = run })
  React.useEffect(() => {
    if (!enabled) return
    let live = true
    const t = setTimeout(() => { runRef.current(q).then((r) => { if (live) setRows(r) }).catch(() => { if (live) setRows([]) }) }, 160)
    return () => { live = false; clearTimeout(t) }
  }, [q, enabled])
  return rows
}

function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return <label className="flex h-12 items-center gap-2 rounded-2xl bg-muted px-3">
    <Search size={18} className="text-muted-foreground" aria-hidden="true" />
    { }
    <input autoFocus aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full w-full bg-transparent text-base font-bold outline-none" />
  </label>
}

/**
 * What you're doing, picked in a few taps: learning (level, then the school) or working (the career,
 * then the employer), or one of the others. Schools and careers come from College Scorecard and O*NET;
 * a high school or an employer you can type.
 */
export function ActivityPicker({ token, state, onPick }: { token?: string; state?: string | null; onPick: (a: Activity) => void }) {
  const [kind, setKind] = React.useState<Activity['kind'] | null>(null)
  const [level, setLevel] = React.useState<string | null>(null)
  const [career, setCareer] = React.useState<Career | null>(null)
  const [q, setQ] = React.useState('')
  const college = LEVELS.find((l) => l.key === level)?.college
  const schools = useSearch<School>(q, (s) => lifeApi.schools(s, state || 'OR', token).then((r) => r.schools.slice(0, 8)), kind === 'learning' && Boolean(college))
  const careers = useSearch<Career>(q, (s) => lifeApi.careers(s, token).then((r) => r.careers.slice(0, 8)), kind === 'working' && !career)
  const back = () => { setQ(''); if (career) setCareer(null); else if (level) setLevel(null); else setKind(null) }
  const backBtn = <button type="button" onClick={back} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={15} aria-hidden="true" />Back</button>

  if (!kind) return <div className="grid gap-2 sm:grid-cols-2">{KINDS.map((k) => {
    const Icon = KIND_ICONS[k.key]
    return <button key={k.key} type="button" className={tile} onClick={() => { if (k.key === 'learning' || k.key === 'working') setKind(k.key); else onPick({ kind: k.key }) }}>
      <span className="grid size-10 place-items-center rounded-xl bg-muted"><Icon size={19} aria-hidden="true" /></span>
      <span className="grid"><span>{k.title}</span><small className="text-xs font-semibold text-muted-foreground">{k.hint}</small></span>
    </button>
  })}</div>

  if (kind === 'learning' && !level) return <div className="grid gap-2">{backBtn}
    <div className="grid gap-2 sm:grid-cols-2">{LEVELS.map((l) => <button key={l.key} type="button" className={tile} onClick={() => { setLevel(l.key); setQ('') }}>{l.title}</button>)}</div>
  </div>

  if (kind === 'learning') {
    const typed = q.trim()
    return <div className="grid gap-2">{backBtn}
      <SearchBox value={q} onChange={setQ} label="School" placeholder={college ? 'Search colleges and programs' : 'Type your school’s name'} />
      <ul className="grid gap-1.5">
        {college ? schools.map((s) => <li key={s.unitid}><button type="button" className={cn(tile, 'w-full')} onClick={() => onPick({ kind: 'learning', level, school: s.name, school_id: s.unitid })}><span className="grid"><span>{s.name}</span><small className="text-xs font-semibold text-muted-foreground">{s.city}, {s.state}</small></span></button></li>) : null}
        {typed ? <li><button type="button" className={cn(tile, 'w-full')} onClick={() => onPick({ kind: 'learning', level, school: typed })}>Use “{typed}”</button></li> : null}
        <li><button type="button" className="px-1 py-2 text-sm font-bold text-[var(--org-primary-color)]" onClick={() => onPick({ kind: 'learning', level })}>{college ? 'Not sure where yet' : 'Skip the school name'}</button></li>
      </ul>
    </div>
  }

  if (kind === 'working' && !career) return <div className="grid gap-2">{backBtn}
    <SearchBox value={q} onChange={setQ} label="Job" placeholder="A job: barista, nurse, electrician…" />
    <ul className="grid gap-1.5">{careers.map((c) => <li key={c.code}><button type="button" className={cn(tile, 'w-full')} onClick={() => { setCareer(c); setQ('') }}><span className="grid"><span>{c.title}</span>{c.alt_titles?.length ? <small className="text-xs font-semibold text-muted-foreground">{c.alt_titles.slice(0, 3).join(', ')}</small> : null}</span></button></li>)}</ul>
    <p className="text-xs text-muted-foreground">Jobs come from O*NET, so pay and training facts can follow.</p>
  </div>

  if (kind === 'working' && career) {
    const typed = q.trim()
    return <div className="grid gap-2">{backBtn}
      <p className="font-extrabold">{career.title}: where?</p>
      <SearchBox value={q} onChange={setQ} label="Employer" placeholder="Employer name (optional)" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip(false)} onClick={() => onPick({ kind: 'working', career: career.code, career_title: career.title, employer: typed || null })}>{typed ? `At ${typed}` : 'Skip the employer'}</button>
        {/^(47|49|51)/.test(career.code) ? <button type="button" className={chip(false)} onClick={() => onPick({ kind: 'working', career: career.code, career_title: career.title, employer: typed || null, apprentice: true })}>As an apprentice</button> : null}
      </div>
    </div>
  }
  return null
}
