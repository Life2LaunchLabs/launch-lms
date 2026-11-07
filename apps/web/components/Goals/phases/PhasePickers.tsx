'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ArrowLeft, Baby, BookOpen, Briefcase, Building2, Heart, Home, HousePlus, Plane, Search, Sparkles, User, UserSearch, Users, X } from 'lucide-react'
import { MicButton } from '@components/Accessibility/ReadAloud'
import { cn } from '@/lib/utils'
import { lifeApi, type Activity, type Career, type Household, type School } from '@services/life/life'
import { KINDS, LEVELS, LIVING } from './setup'
import { monthName } from './graph'
import { useTranslation } from 'react-i18next'

const KIND_ICONS: Record<Activity['kind'], React.ElementType> = { learning: BookOpen, working: Briefcase, looking: UserSearch, caring: Heart, gap: Plane, other: Sparkles }
// A picture for every way of living, so a learner can choose by looking.
const LIVING_ICONS: Record<string, React.ElementType> = { family: Home, own: HousePlus, roommates: Users, partner: Heart, dorm: Building2, other: Sparkles }
export const tile = 'flex items-center gap-3 rounded-2xl bg-card p-3 text-left font-bold shadow-[0_0_0_2px_hsl(var(--border))] hover:shadow-[0_0_0_2px_var(--org-primary-color)]'
export const chip = (on: boolean) => cn('rounded-full px-3.5 py-2 text-sm font-extrabold', on ? 'bg-foreground text-background' : 'bg-muted hover:bg-raised')

/** Month and year selects for when a phase starts. */
export function MonthPicker({ value, onChange, from = 2000, to = new Date().getFullYear() + 25 }: { value: string; onChange: (v: string) => void; from?: number; to?: number }) {
  const [y, m] = value.split('-').map(Number)
  const set = (yy: number, mm: number) => onChange(`${yy}-${String(mm).padStart(2, '0')}`)
  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i)
  const cls = 'h-12 rounded-2xl bg-muted px-3 text-base font-bold'
  const { t } = useTranslation()
  return <div className="grid grid-cols-2 gap-2">
    <label className="grid gap-1 text-sm font-bold">{t('phases.month')}<select className={cls} value={m} onChange={(e) => set(y, Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i, 'long')}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-bold">{t('phases.year')}<select className={cls} value={y} onChange={(e) => set(Number(e.target.value), m)}>{years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}</select></label>
  </div>
}

export function LivingPicker({ value, onPick }: { value?: string | null; onPick: (key: string) => void }) {
  useTranslation()
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{LIVING.map(([key, title]) => {
    const Icon = LIVING_ICONS[key] || Sparkles
    return <button key={key} type="button" aria-pressed={value === key} onClick={() => onPick(key)}
      className={cn(tile, 'flex-col justify-center py-4 text-center', value === key && 'shadow-[0_0_0_3px_var(--org-primary-color)]')}>
      <span className="grid size-12 place-items-center rounded-2xl bg-muted"><Icon size={24} aria-hidden="true" /></span>{title}
    </button>
  })}</div>
}

/** Who the budget provides for: the learner, maybe a partner, and kids by age. Picked, then used once. */
export function HouseholdPicker({ value, onPick }: { value?: Household | null; onPick: (h: Household | null) => void }) {
  const { t } = useTranslation()
  const [partner, setPartner] = React.useState(Boolean(value?.partner))
  const [kids, setKids] = React.useState<number[]>(value?.kids || [])
  const ages = Array.from({ length: 18 }, (_, i) => i)
  return <div className="grid gap-3">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" aria-pressed={!partner} onClick={() => setPartner(false)} className={cn(tile, 'flex-col justify-center py-4 text-center', !partner && 'shadow-[0_0_0_3px_var(--org-primary-color)]')}>
        <span className="grid size-12 place-items-center rounded-2xl bg-muted"><User size={24} aria-hidden="true" /></span>{t('phases.household.just_me_tile', 'Just me')}</button>
      <button type="button" aria-pressed={partner} onClick={() => setPartner(true)} className={cn(tile, 'flex-col justify-center py-4 text-center', partner && 'shadow-[0_0_0_3px_var(--org-primary-color)]')}>
        <span className="grid size-12 place-items-center rounded-2xl bg-muted"><Users size={24} aria-hidden="true" /></span>{t('phases.household.partner_tile', 'Me and a partner')}</button>
    </div>
    {kids.length ? <ul className="grid gap-1.5">{kids.map((age, i) => <li key={i} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 font-bold">
      <Baby size={18} aria-hidden="true" /><span className="flex-1">{t('phases.household.kid_n', 'Kid {{n}}', { n: i + 1 })}</span>
      <label className="flex items-center gap-1.5 text-sm">{t('phases.household.age', 'Age')}
        <select className="h-9 rounded-xl bg-card px-2 font-bold" value={age} onChange={(e) => setKids(kids.map((a, j) => (j === i ? Number(e.target.value) : a)))}>{ages.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
      <button type="button" aria-label={t('phases.household.remove_kid', 'Remove kid {{n}}', { n: i + 1 })} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-destructive" onClick={() => setKids(kids.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>
    </li>)}</ul> : null}
    {kids.length < 8 ? <button type="button" className="w-fit rounded-full bg-muted px-3.5 py-2 text-sm font-extrabold hover:bg-raised" onClick={() => setKids([...kids, 5])}>+ {t('phases.household.add_kid', 'A kid')}</button> : null}
    <button type="button" className="w-fit rounded-full bg-foreground px-4 py-2 text-sm font-extrabold text-background" onClick={() => onPick(partner || kids.length ? { partner, kids } : null)}>{t('phases.household.use', 'Use this')}</button>
  </div>
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
    <MicButton value="" onChange={(said) => onChange(said.replace(/[.!?]+$/, ''))} size="sm" label={`Say the ${label.toLowerCase()}`} />
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
  const { t } = useTranslation()
  const college = LEVELS.find((l) => l.key === level)?.college
  const schools = useSearch<School>(q, (s) => lifeApi.schools(s, state || 'OR', token).then((r) => r.schools.slice(0, 8)), kind === 'learning' && Boolean(college))
  const careers = useSearch<Career>(q, (s) => lifeApi.careers(s, token).then((r) => r.careers.slice(0, 8)), kind === 'working' && !career)
  const back = () => { setQ(''); if (career) setCareer(null); else if (level) setLevel(null); else setKind(null) }
  const backBtn = <button type="button" onClick={back} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={15} aria-hidden="true" />{t('phases.back')}</button>

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
      <SearchBox value={q} onChange={setQ} label={t('phases.school')} placeholder={college ? t('phases.search_colleges') : t('phases.type_school')} />
      <ul className="grid gap-1.5">
        {college ? schools.map((s) => <li key={s.unitid}><button type="button" className={cn(tile, 'w-full')} onClick={() => onPick({ kind: 'learning', level, school: s.name, school_id: s.unitid })}><span className="grid"><span>{s.name}</span><small className="text-xs font-semibold text-muted-foreground">{s.city}, {s.state}</small></span></button></li>) : null}
        {typed ? <li><button type="button" className={cn(tile, 'w-full')} onClick={() => onPick({ kind: 'learning', level, school: typed })}>{t('phases.use_typed', { text: typed })}</button></li> : null}
        <li><button type="button" className="px-1 py-2 text-sm font-bold text-[var(--org-primary-color)]" onClick={() => onPick({ kind: 'learning', level })}>{college ? t('phases.not_sure_where') : t('phases.skip_school')}</button></li>
      </ul>
    </div>
  }

  if (kind === 'working' && !career) return <div className="grid gap-2">{backBtn}
    <SearchBox value={q} onChange={setQ} label={t('phases.job')} placeholder={t('phases.job_placeholder')} />
    <ul className="grid gap-1.5">{careers.map((c) => <li key={c.code}><button type="button" className={cn(tile, 'w-full')} onClick={() => { setCareer(c); setQ('') }}><span className="grid"><span>{c.title}</span>{c.alt_titles?.length ? <small className="text-xs font-semibold text-muted-foreground">{c.alt_titles.slice(0, 3).join(', ')}</small> : null}</span></button></li>)}{q.trim() ? <li><button type="button" className={cn(tile, 'w-full')} onClick={() => onPick({ kind: 'working', career_title: q.trim() })}>{t('phases.use_typed', { text: q.trim() })}</button></li> : null}</ul>
    <p className="text-xs text-muted-foreground">{t('phases.onet_note')}</p>
  </div>

  if (kind === 'working' && career) {
    const typed = q.trim()
    return <div className="grid gap-2">{backBtn}
      <p className="font-extrabold">{t('phases.career_where', { career: career.title })}</p>
      <SearchBox value={q} onChange={setQ} label={t('phases.employer')} placeholder={t('phases.employer_placeholder')} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip(false)} onClick={() => onPick({ kind: 'working', career: career.code, career_title: career.title, employer: typed || null })}>{typed ? t('phases.at_employer', { employer: typed }) : t('phases.skip_employer')}</button>
        {/^(47|49|51)/.test(career.code) ? <button type="button" className={chip(false)} onClick={() => onPick({ kind: 'working', career: career.code, career_title: career.title, employer: typed || null, apprentice: true })}>{t('phases.as_apprentice')}</button> : null}
      </div>
    </div>
  }
  return null
}
