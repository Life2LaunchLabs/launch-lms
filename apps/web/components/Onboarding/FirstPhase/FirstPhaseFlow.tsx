'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mutate as refresh } from 'swr'
import { ArrowLeft, ArrowRight, Loader2, MapPin, Plus, Search, Target, Upload, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import PhaseCover, { usePlacePhotos } from '@components/Goals/phases/PhaseCover'
import useLifePlan from '@components/Goals/phases/useLifePlan'
import { ActivityPicker, LivingPicker, MonthPicker, chip } from '@components/Goals/phases/PhasePickers'
import { activityText, eyebrowFor, kindFor, purposeOptions, suggestTitle } from '@components/Goals/phases/setup'
import { routeWaiting } from '@components/Goals/phases/MapParts'
import { monthText, normalize, phaseId } from '@components/Goals/phases/graph'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalsApi } from '@services/goals/goals'
import { lifeApi, lifeUrl, type Activity, type PlaceOption, type Phase } from '@services/life/life'
import { uploadMediaAsset } from '@services/media/library'
import { tr } from '@/lib/tr'
import { useTranslation } from 'react-i18next'
import { MicButton, ReadToMeToggle, SpokenQuestion } from '@components/Accessibility/ReadAloud'

type Draft = { place: PlaceOption | null; living: string | null; activities: Activity[]; purpose: string; starts: string; title: string; titleTouched: boolean; cover: string | null }

/** Goal ideas for a first phase, by what it's about. */
const IDEAS: Record<string, [string, string][]> = {
  middle: [['ready_hs', 'Get ready for high school'], ['club', 'Try a new club or sport'], ['good_at', 'Find out what I’m good at']],
  high: [['graduate', 'Graduate on time'], ['license', 'Get my driver’s license'], ['gpa', 'Raise my GPA'], ['after_hs', 'Figure out what’s after high school']],
  ged: [['pass_ged', 'Pass my GED tests'], ['schedule', 'Make a study schedule'], ['after_ged', 'Find out what’s after my GED']],
  college: [['first_year', 'Finish my first year'], ['study_group', 'Find a study group'], ['major', 'Pick a major'], ['scholarships', 'Apply for scholarships']],
  working: [['first_90', 'Get through my first 90 days'], ['save_1000', 'Save my first $1,000'], ['new_skill', 'Learn a new skill at work'], ['raise', 'Ask for a raise']],
  looking: [['land_job', 'Land a job'], ['resume', 'Update my résumé'], ['interviews', 'Practice interviews']],
  other: [['routine', 'Build a routine'], ['save_up', 'Save up'], ['whats_next', 'Figure out what’s next']],
}
const ideasFor = (acts: Activity[]) => {
  const a = acts[0]
  const key = !a ? 'other' : a.kind === 'learning' ? (['middle', 'high', 'ged'].includes(a.level || '') ? a.level! : 'college') : a.kind === 'working' || a.kind === 'looking' ? a.kind : 'other'
  const group = IDEAS[key] ? key : 'other'
  return IDEAS[group].map(([id, en]) => tr(`onboarding.ideas.${group}.${id}`, en))
}

/**
 * A new learner's first phase, set up as part of joining: where they are and how they live there,
 * what they're doing (a school, a job, or both), what this time is for (which names it: "Gap year",
 * not "Cashier"), since when, its name and picture, then what they
 * want to work toward. Every pick is a tap or a search. An organization's invitation needs a phase
 * to land in, so this comes before anything else.
 */
export default function FirstPhaseFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const userId = session?.data?.user?.id
  const firstName = session?.data?.user?.first_name
  const { doc, isLoading, change } = useLifePlan(token)
  const photos = usePlacePhotos(token)
  const [step, setStep] = React.useState(0)
  const [d, setD] = React.useState<Draft>(() => {
    const now = new Date()
    // School years start in September: before then, the one that started last fall.
    const fall = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
    return { place: null, living: null, activities: [], purpose: '', starts: `${fall}-09`, title: '', titleTouched: false, cover: null }
  })
  const [addingAct, setAddingAct] = React.useState(true)
  const [goals, setGoals] = React.useState<string[]>([])
  const [own, setOwn] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const next = params.get('next')
  // A career chosen before there was a plan waits for the map: the new phase opens it, holding that career's route.
  const home = (id?: string) => (next && next.startsWith('/') ? next : getUriWithOrg(org?.slug, id && routeWaiting() ? `${routePaths.org.plans()}?map&hold=1` : id ? routePaths.org.phase(id) : routePaths.org.plans()))

  // Someone who already has a plan doesn't need this.
  React.useEffect(() => { if (!isLoading && doc?.phases?.length && !busy) router.replace(home()) }, [isLoading, doc, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  const suggested = d.purpose.trim() || suggestTitle({ activities: d.activities, living: d.living, place_label: d.place?.label || '' })
  const title = d.titleTouched ? d.title : suggested
  const preview: Phase = { id: 'new', title, kind: kindFor(d.activities), place: d.place?.key || null, place_label: d.place?.label || '', months: 12, lines: [], cover: d.cover ? { url: d.cover } : null }
  const steps = ['where', 'living', 'doing', 'purpose', 'since', 'card', 'goal'] as const
  const s = steps[step]
  const canNext = s === 'where' ? Boolean(d.place) : s === 'living' ? Boolean(d.living) : s === 'doing' ? d.activities.length > 0 : s === 'purpose' ? Boolean(d.purpose.trim()) : true

  const finish = async (skipGoals = false) => {
    if (busy) return
    setBusy(true)
    const id = phaseId()
    const phase: Phase = { ...preview, id, title: title.trim() || t('onboarding.now'), starts: d.starts, after: [], idea: false, activities: d.activities, living: d.living, places: [], goals: [] }
    const saved = await change((plan) => {
      Object.assign(plan, normalize({ ...plan, start: d.starts, phases: [...(plan.phases || []), phase] }))
    })
    if (!saved) { setBusy(false); return }
    const titles = skipGoals ? [] : [...goals, ...(own.trim() ? [own.trim()] : [])]
    for (const goalTitle of titles) {
      try {
        const g = await goalsApi.create({ title: goalTitle }, token)
        await lifeApi.placeGoal(g.goal_uuid, id, token).catch(() => undefined)
      } catch { toast.error(t('onboarding.goal_add_failed', { title: goalTitle })) }
    }
    if (titles.length) await refresh(lifeUrl('/plan'))
    router.replace(home(id))
  }

  const upload = async (file: File) => {
    if (!token || userId === undefined) return
    setUploading(true)
    try { const asset = await uploadMediaAsset({ type: 'user', id: Number(userId) }, 'image', file, token, file.name); setD({ ...d, cover: asset.url }) }
    catch { toast.error(t('onboarding.photo_failed')) } finally { setUploading(false) }
  }

  const question = {
    where: { q: firstName ? t('onboarding.where_hi', { name: firstName }) : t('onboarding.where'), sub: t('onboarding.where_sub') },
    living: { q: t('onboarding.living'), sub: t('onboarding.living_sub') },
    doing: { q: t('onboarding.doing'), sub: t('onboarding.doing_sub') },
    purpose: { q: t('onboarding.purpose'), sub: t('onboarding.purpose_sub') },
    since: { q: t('onboarding.since'), sub: t('onboarding.since_sub') },
    card: { q: t('onboarding.card'), sub: t('onboarding.card_sub') },
    goal: { q: t('onboarding.goal'), sub: t('onboarding.goal_sub') },
  }[s]

  return <div className="min-h-screen bg-background">
    <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-6 px-4 py-6 sm:py-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label={t('onboarding.previous')} className="grid size-10 place-items-center rounded-full bg-muted disabled:opacity-0"><ArrowLeft size={18} aria-hidden="true" /></button>
        <div className="flex flex-1 gap-1.5" aria-label={t('onboarding.step_of', { step: step + 1, total: steps.length })}>{steps.map((x, i) => <span key={x} className={cn('h-2 flex-1 rounded-full', i <= step ? 'bg-[var(--org-primary-color)]' : 'bg-muted')} />)}</div>
        <ReadToMeToggle />
      </div>
      <SpokenQuestion key={s} title={question.q} sub={question.sub} className="text-[clamp(26px,6vw,34px)] font-extrabold leading-tight tracking-tight" subClassName="mt-1 text-muted-foreground" />

      {s === 'where' ? <PlaceSearch token={token} value={d.place} onPick={(place) => { setD({ ...d, place }); setStep(1) }} /> : null}
      {s === 'living' ? <LivingPicker value={d.living} onPick={(living) => { setD({ ...d, living }); setTimeout(() => setStep(2), 160) }} /> : null}
      {s === 'doing' ? <div className="grid gap-3">
        {d.activities.length ? <ul className="grid gap-2">{d.activities.map((a, i) => <li key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 font-bold shadow-[0_0_0_2px_var(--org-primary-color)]">
          <span className="flex-1">{activityText(a)}</span>
          <button type="button" aria-label={t('onboarding.remove', { name: activityText(a) })} onClick={() => setD({ ...d, activities: d.activities.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-full hover:bg-muted"><X size={16} aria-hidden="true" /></button>
        </li>)}</ul> : null}
        {addingAct || !d.activities.length
          ? <ActivityPicker key={d.activities.length} token={token} onPick={(a) => { setD({ ...d, activities: [...d.activities, a] }); setAddingAct(false) }} />
          : <button type="button" onClick={() => setAddingAct(true)} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--org-primary-color)]"><Plus size={15} aria-hidden="true" />{t('onboarding.add_else')}</button>}
      </div> : null}
      {s === 'purpose' ? <PurposePicker options={purposeOptions(d.activities)} value={d.purpose} onChange={(purpose) => setD({ ...d, purpose })} onPick={(purpose) => { setD({ ...d, purpose }); setTimeout(() => setStep(steps.indexOf('since')), 160) }} /> : null}
      {s === 'since' ? <MonthPicker value={d.starts} onChange={(starts) => setD({ ...d, starts })} to={new Date().getFullYear() + 1} /> : null}
      {s === 'card' ? <div className="grid gap-3">
        <div className="relative h-[260px] overflow-hidden rounded-[28px] bg-muted text-white">
          <PhaseCover phase={preview} photos={photos} className={cn('absolute inset-0 h-full w-full', uploading && 'animate-pulse')} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgb(8_20_30/0.65))]" aria-hidden="true" />
          <div className="absolute inset-x-5 bottom-5 grid gap-1.5">
            <span className="text-sm font-extrabold opacity-95">{eyebrowFor(d.activities, title)}</span>
            <input aria-label={t('onboarding.phase_name')} value={title} onChange={(e) => setD({ ...d, title: e.target.value, titleTouched: true })} className="w-full rounded-xl bg-black/25 px-2.5 py-0.5 text-[clamp(28px,7vw,42px)] font-extrabold text-white outline outline-2 outline-white/60 focus:outline-white" />
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold"><MapPin size={13} aria-hidden="true" />{d.place?.label} · {t('onboarding.since_month', { month: monthText(d.starts) })}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.titleTouched ? <button type="button" className={chip(false)} onClick={() => setD({ ...d, titleTouched: false, title: '' })}>{t('phases.use_typed', { text: suggested })}</button> : null}
          <button type="button" className={chip(false)} onClick={() => fileInput.current?.click()} disabled={uploading}><Upload size={14} className="mr-1 inline" aria-hidden="true" />{d.cover ? t('onboarding.another_photo') : t('onboarding.own_photo')}</button>
          {d.cover ? <button type="button" className={chip(false)} onClick={() => setD({ ...d, cover: null })}>{t('onboarding.use_ours')}</button> : null}
        </div>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
      </div> : null}
      {s === 'goal' ? <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">{ideasFor(d.activities).map((idea) => {
          const on = goals.includes(idea)
          return <button key={idea} type="button" aria-pressed={on} onClick={() => setGoals(on ? goals.filter((x) => x !== idea) : [...goals, idea])} className={cn(chip(on), 'inline-flex items-center gap-1.5')}>{on ? <Target size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{idea}</button>
        })}</div>
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-muted px-3"><Target size={18} className="text-muted-foreground" aria-hidden="true" />
          <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder={t('onboarding.write_own')} aria-label={t('onboarding.own_goal')} className="h-full w-full bg-transparent text-base font-bold outline-none" />
          <MicButton value={own} onChange={setOwn} size="sm" label="Say your own goal" /></label>
        {org?.name ? <p className="text-sm text-muted-foreground">{t('onboarding.org_plans', { org: org.name })}</p> : null}
      </div> : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        {s === 'goal' ? <button type="button" onClick={() => void finish(true)} disabled={busy} className="text-sm font-bold text-muted-foreground">{t('onboarding.skip_for_now')}</button> : <span />}
        {s === 'where' || s === 'living' ? null
          : s === 'goal' ? <Button variant="brand" size="lg" disabled={busy} onClick={() => void finish()}>{busy ? <Loader2 className="animate-spin" /> : null}{goals.length || own.trim() ? t('onboarding.start_plan') : t('onboarding.start_without')}</Button>
            : <Button variant="brand" size="lg" disabled={!canNext} onClick={() => { setStep(step + 1); setAddingAct(false) }}>{t('onboarding.next')}<ArrowRight size={16} aria-hidden="true" /></Button>}
      </div>
    </div>
  </div>
}

/** What this time is for: a tap on one we offer, or their own words. Their pick names the phase. */
function PurposePicker({ options, value, onChange, onPick }: { options: string[]; value: string; onChange: (v: string) => void; onPick: (v: string) => void }) {
  const { t } = useTranslation()
  const typed = value && !options.includes(value) ? value : ''
  return <div className="grid gap-3">
    <div className="flex flex-wrap gap-2">{options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onPick(o)} className={chip(value === o)}>{o}</button>)}</div>
    <label className="flex h-12 items-center gap-2 rounded-2xl bg-muted px-3">
      <input value={typed} onChange={(e) => onChange(e.target.value)} placeholder={t('onboarding.purpose_own')} aria-label={t('onboarding.purpose_own')} className="h-full w-full bg-transparent text-base font-bold outline-none" />
      <MicButton value={typed} onChange={onChange} size="sm" label={t('onboarding.purpose_own')} /></label>
  </div>
}

/** A big search for towns and counties, for the first question. */
function PlaceSearch({ token, value, onPick }: { token?: string; value: PlaceOption | null; onPick: (p: PlaceOption) => void }) {
  const [q, setQ] = React.useState('')
  const { t } = useTranslation()
  const [rows, setRows] = React.useState<PlaceOption[]>([])
  React.useEffect(() => {
    let live = true
    const timer = setTimeout(() => { lifeApi.places(q, token).then((r) => { if (live) setRows(r.places.slice(0, 8)) }).catch(() => undefined) }, 150)
    return () => { live = false; clearTimeout(timer) }
  }, [q, token])
  return <div className="grid gap-2">
    <label className="flex h-14 items-center gap-2 rounded-2xl bg-muted px-4"><Search size={20} className="text-muted-foreground" aria-hidden="true" />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('onboarding.place_placeholder')} aria-label={t('onboarding.place_search')} className="h-full w-full bg-transparent text-lg font-bold outline-none" />
      <MicButton value="" onChange={(said) => setQ(said.replace(/[.!?]+$/, ''))} label="Say your town" /></label>
    <ul className="grid gap-1.5">{rows.map((r) => <li key={r.key}><button type="button" onClick={() => onPick(r)} aria-pressed={value?.key === r.key}
      className={cn('flex w-full items-baseline justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left font-bold shadow-[0_0_0_2px_hsl(var(--border))] hover:shadow-[0_0_0_2px_var(--org-primary-color)]', value?.key === r.key && 'shadow-[0_0_0_2px_var(--org-primary-color)]')}>
      <span>{r.label}</span><small className="text-xs font-semibold text-muted-foreground">{r.detail}</small></button></li>)}</ul>
  </div>
}

