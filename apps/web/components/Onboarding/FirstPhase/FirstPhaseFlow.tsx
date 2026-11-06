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
import { activityText, kindFor, seedLines, suggestTitle } from '@components/Goals/phases/setup'
import { monthText, normalize, phaseId } from '@components/Goals/phases/graph'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalsApi } from '@services/goals/goals'
import { lifeApi, lifeUrl, type Activity, type PlaceOption, type Phase } from '@services/life/life'
import { uploadMediaAsset } from '@services/media/library'
import { MicButton, ReadToMeToggle, SpokenQuestion } from '@components/Accessibility/ReadAloud'

type Draft = { place: PlaceOption | null; living: string | null; activities: Activity[]; starts: string; title: string; titleTouched: boolean; cover: string | null }

/** Goal ideas for a first phase, by what it's about. */
const IDEAS: Record<string, string[]> = {
  middle: ['Get ready for high school', 'Try a new club or sport', 'Find out what I’m good at'],
  high: ['Graduate on time', 'Get my driver’s license', 'Raise my GPA', 'Figure out what’s after high school'],
  ged: ['Pass my GED tests', 'Make a study schedule', 'Find out what’s after my GED'],
  college: ['Finish my first year', 'Find a study group', 'Pick a major', 'Apply for scholarships'],
  working: ['Get through my first 90 days', 'Save my first $1,000', 'Learn a new skill at work', 'Ask for a raise'],
  looking: ['Land a job', 'Update my résumé', 'Practice interviews'],
  other: ['Build a routine', 'Save up', 'Figure out what’s next'],
}
const ideasFor = (acts: Activity[]) => {
  const a = acts[0]
  const key = !a ? 'other' : a.kind === 'learning' ? (['middle', 'high', 'ged'].includes(a.level || '') ? a.level! : 'college') : a.kind === 'working' || a.kind === 'looking' ? a.kind : 'other'
  return IDEAS[key] || IDEAS.other
}

/**
 * A new learner's first phase, set up as part of joining: where they are and how they live there,
 * what they're doing (a school, a job, or both), since when, its name and picture, then what they
 * want to work toward. Every pick is a tap or a search. An organization's invitation needs a phase
 * to land in, so this comes before anything else.
 */
export default function FirstPhaseFlow() {
  const router = useRouter()
  const params = useSearchParams()
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
    return { place: null, living: null, activities: [], starts: `${fall}-09`, title: '', titleTouched: false, cover: null }
  })
  const [addingAct, setAddingAct] = React.useState(true)
  const [goals, setGoals] = React.useState<string[]>([])
  const [own, setOwn] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const next = params.get('next')
  const home = (id?: string) => (next && next.startsWith('/') ? next : getUriWithOrg(org?.slug, id ? routePaths.org.phase(id) : routePaths.org.plans()))

  // Someone who already has a plan doesn't need this.
  React.useEffect(() => { if (!isLoading && doc?.phases?.length && !busy) router.replace(home()) }, [isLoading, doc, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = d.titleTouched ? d.title : suggestTitle({ activities: d.activities, living: d.living, place_label: d.place?.label || '' })
  const preview: Phase = { id: 'new', title, kind: kindFor(d.activities), place: d.place?.key || null, place_label: d.place?.label || '', months: 12, lines: [], cover: d.cover ? { url: d.cover } : null }
  const steps = ['where', 'living', 'doing', 'since', 'card', 'goal'] as const
  const s = steps[step]
  const canNext = s === 'where' ? Boolean(d.place) : s === 'living' ? Boolean(d.living) : s === 'doing' ? d.activities.length > 0 : true

  const finish = async (skipGoals = false) => {
    if (busy) return
    setBusy(true)
    const id = phaseId()
    const phase: Phase = { ...preview, id, title: title.trim() || 'Now', starts: d.starts, after: [], idea: false, activities: d.activities, living: d.living, places: [], goals: [] }
    phase.lines = seedLines(phase)
    const saved = await change((plan) => {
      Object.assign(plan, normalize({ ...plan, start: d.starts, phases: [...(plan.phases || []), phase] }))
    })
    if (!saved) { setBusy(false); return }
    const titles = skipGoals ? [] : [...goals, ...(own.trim() ? [own.trim()] : [])]
    for (const t of titles) {
      try {
        const g = await goalsApi.create({ title: t }, token)
        await lifeApi.placeGoal(g.goal_uuid, id, token).catch(() => undefined)
      } catch { toast.error(`Couldn’t add “${t}”. You can add it from your phase.`) }
    }
    if (titles.length) await refresh(lifeUrl('/plan'))
    router.replace(home(id))
  }

  const upload = async (file: File) => {
    if (!token || userId === undefined) return
    setUploading(true)
    try { const asset = await uploadMediaAsset({ type: 'user', id: Number(userId) }, 'image', file, token, file.name); setD({ ...d, cover: asset.url }) }
    catch { toast.error('That photo couldn’t be uploaded. Try a smaller image.') } finally { setUploading(false) }
  }

  const question = {
    where: { q: `${firstName ? `Hi ${firstName}! ` : ''}Where do you live right now?`, sub: 'A town or a county is plenty.' },
    living: { q: 'Who do you live with?', sub: 'It helps with your budget. You can change it any time.' },
    doing: { q: 'What are you doing these days?', sub: 'School, a job or both. Add as many as you like.' },
    since: { q: 'Since when?', sub: 'Roughly is fine. A phase lasts until the next one starts.' },
    card: { q: 'Here’s your first phase', sub: 'Change its name, or use your own photo.' },
    goal: { q: 'What do you want to get done in this phase?', sub: 'Pick a few to start. Each becomes a goal you can break into steps.' },
  }[s]

  return <div className="min-h-screen bg-background">
    <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-6 px-4 py-6 sm:py-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous question" className="grid size-10 place-items-center rounded-full bg-muted disabled:opacity-0"><ArrowLeft size={18} aria-hidden="true" /></button>
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((x, i) => <span key={x} className={cn('h-2 flex-1 rounded-full', i <= step ? 'bg-[var(--org-primary-color)]' : 'bg-muted')} />)}</div>
        <ReadToMeToggle />
      </div>
      <SpokenQuestion key={s} title={question.q} sub={question.sub} className="text-[clamp(26px,6vw,34px)] font-extrabold leading-tight tracking-tight" subClassName="mt-1 text-muted-foreground" />

      {s === 'where' ? <PlaceSearch token={token} value={d.place} onPick={(place) => { setD({ ...d, place }); setStep(1) }} /> : null}
      {s === 'living' ? <LivingPicker value={d.living} onPick={(living) => { setD({ ...d, living }); setTimeout(() => setStep(2), 160) }} /> : null}
      {s === 'doing' ? <div className="grid gap-3">
        {d.activities.length ? <ul className="grid gap-2">{d.activities.map((a, i) => <li key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 font-bold shadow-[0_0_0_2px_var(--org-primary-color)]">
          <span className="flex-1">{activityText(a)}</span>
          <button type="button" aria-label={`Remove ${activityText(a)}`} onClick={() => setD({ ...d, activities: d.activities.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-full hover:bg-muted"><X size={16} aria-hidden="true" /></button>
        </li>)}</ul> : null}
        {addingAct || !d.activities.length
          ? <ActivityPicker key={d.activities.length} token={token} onPick={(a) => { setD({ ...d, activities: [...d.activities, a] }); setAddingAct(false) }} />
          : <button type="button" onClick={() => setAddingAct(true)} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--org-primary-color)]"><Plus size={15} aria-hidden="true" />Add something else (a job, another school…)</button>}
      </div> : null}
      {s === 'since' ? <MonthPicker value={d.starts} onChange={(starts) => setD({ ...d, starts })} to={new Date().getFullYear() + 1} /> : null}
      {s === 'card' ? <div className="grid gap-3">
        <div className="relative h-[260px] overflow-hidden rounded-[28px] bg-muted text-white">
          <PhaseCover phase={preview} photos={photos} className={cn('absolute inset-0 h-full w-full', uploading && 'animate-pulse')} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgb(8_20_30/0.65))]" aria-hidden="true" />
          <div className="absolute inset-x-5 bottom-5 grid gap-1.5">
            <span className="text-sm font-extrabold opacity-95">{d.activities.map(activityText).join(' + ')}</span>
            <input aria-label="Phase name" value={title} onChange={(e) => setD({ ...d, title: e.target.value, titleTouched: true })} className="w-full rounded-xl bg-black/25 px-2.5 py-0.5 text-[clamp(28px,7vw,42px)] font-extrabold text-white outline outline-2 outline-white/60 focus:outline-white" />
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold"><MapPin size={13} aria-hidden="true" />{d.place?.label} · since {monthText(d.starts)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.titleTouched ? <button type="button" className={chip(false)} onClick={() => setD({ ...d, titleTouched: false, title: '' })}>Use “{suggestTitle({ activities: d.activities, living: d.living, place_label: d.place?.label || '' })}”</button> : null}
          <button type="button" className={chip(false)} onClick={() => fileInput.current?.click()} disabled={uploading}><Upload size={14} className="mr-1 inline" aria-hidden="true" />{d.cover ? 'Another photo' : 'Use my own photo'}</button>
          {d.cover ? <button type="button" className={chip(false)} onClick={() => setD({ ...d, cover: null })}>Use ours</button> : null}
        </div>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
      </div> : null}
      {s === 'goal' ? <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">{ideasFor(d.activities).map((t) => {
          const on = goals.includes(t)
          return <button key={t} type="button" aria-pressed={on} onClick={() => setGoals(on ? goals.filter((x) => x !== t) : [...goals, t])} className={cn(chip(on), 'inline-flex items-center gap-1.5')}>{on ? <Target size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{t}</button>
        })}</div>
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-muted px-3"><Target size={18} className="text-muted-foreground" aria-hidden="true" />
          <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Or write your own" aria-label="Your own goal" className="h-full w-full bg-transparent text-base font-bold outline-none" />
          <MicButton value={own} onChange={setOwn} size="sm" label="Say your own goal" /></label>
        {org?.name ? <p className="text-sm text-muted-foreground">Plans from {org.name} land in this phase too, next to your own goals.</p> : null}
      </div> : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        {s === 'goal' ? <button type="button" onClick={() => void finish(true)} disabled={busy} className="text-sm font-bold text-muted-foreground">Skip for now</button> : <span />}
        {s === 'where' || s === 'living' ? null
          : s === 'goal' ? <Button variant="brand" size="lg" disabled={busy} onClick={() => void finish()}>{busy ? <Loader2 className="animate-spin" /> : null}{goals.length || own.trim() ? 'Start my plan' : 'Start without goals'}</Button>
            : <Button variant="brand" size="lg" disabled={!canNext} onClick={() => { setStep(step + 1); setAddingAct(false) }}>Next<ArrowRight size={16} aria-hidden="true" /></Button>}
      </div>
    </div>
  </div>
}

/** A big search for towns and counties, for the first question. */
function PlaceSearch({ token, value, onPick }: { token?: string; value: PlaceOption | null; onPick: (p: PlaceOption) => void }) {
  const [q, setQ] = React.useState('')
  const [rows, setRows] = React.useState<PlaceOption[]>([])
  React.useEffect(() => {
    let live = true
    const t = setTimeout(() => { lifeApi.places(q, token).then((r) => { if (live) setRows(r.places.slice(0, 8)) }).catch(() => undefined) }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [q, token])
  return <div className="grid gap-2">
    <label className="flex h-14 items-center gap-2 rounded-2xl bg-muted px-4"><Search size={20} className="text-muted-foreground" aria-hidden="true" />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Eugene, Bend, Coos County…" aria-label="Search towns and counties" className="h-full w-full bg-transparent text-lg font-bold outline-none" />
      <MicButton value="" onChange={(said) => setQ(said.replace(/[.!?]+$/, ''))} label="Say your town" /></label>
    <ul className="grid gap-1.5">{rows.map((r) => <li key={r.key}><button type="button" onClick={() => onPick(r)} aria-pressed={value?.key === r.key}
      className={cn('flex w-full items-baseline justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left font-bold shadow-[0_0_0_2px_hsl(var(--border))] hover:shadow-[0_0_0_2px_var(--org-primary-color)]', value?.key === r.key && 'shadow-[0_0_0_2px_var(--org-primary-color)]')}>
      <span>{r.label}</span><small className="text-xs font-semibold text-muted-foreground">{r.detail}</small></button></li>)}</ul>
  </div>
}

