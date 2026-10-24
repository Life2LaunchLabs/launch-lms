'use client'

import React from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Globe, Loader2, Sparkles, Users } from 'lucide-react'
import { stepDefinition } from '@components/Goals/steps'
import { Input } from '@components/ui/input'
import { isTemplatesKey, templatesApi, type DraftChanges } from '@services/goals/templates'
import type { StepTypeKey } from '@services/goals/types'
import { cn } from '@/lib/utils'
import AssignFlow from '@components/Assignments/assign/AssignFlow'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import PlanDialog, { ToggleRow } from './PlanDialog'
import { plural, semverProblem, versionLabel } from './planVersions'

type Props = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  orgId: number
  token?: string
  editing: TemplateEditing
  changes?: DraftChanges
  canAssign: boolean
  onPublished: () => void
  /** Opens "Who can find it", when the viewer has it. */
  onVisibility?: (() => void) | null
}

type Done = { semver: string; live: boolean; moved: number; first: boolean }

/**
 * Publish the draft: its number and note, what changed, and whether it goes live (moving active
 * assignments to it). Published versions are locked. A live version is celebrated, then assigned.
 */
export default function PublishFlow({ open, setOpen, orgId, token, editing, changes, canAssign, onPublished, onVisibility }: Props) {
  const template = editing.template!
  const draft = template.draft
  const live = template.live_version
  const versions = template.versions || []
  const [semver, setSemver] = React.useState('')
  const [note, setNote] = React.useState('')
  const [makeLive, setMakeLive] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<Done | null>(null)
  const { data: preview } = useSWR(open && live && token ? ['live-preview', orgId, template.template_uuid] : null, () => templatesApi.livePreview(orgId, template.template_uuid, token))
  React.useEffect(() => {
    if (!open) return
    setMakeLive(true); setDone(null); setSemver(draft?.semver || ''); setNote(draft?.note || '')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <Celebration open={open} setOpen={setOpen} title={template.document.template.title || template.title} done={done} canAssign={canAssign} templateUuid={template.template_uuid} onVisibility={onVisibility} />
  if (!draft) return null

  const problem = semver !== draft.semver ? semverProblem(semver, versions) : ''
  const publish = async () => {
    if (problem) return
    setBusy(true)
    try {
      if (semver !== draft.semver || note !== (draft.note || '')) await templatesApi.updateDraft(orgId, template.template_uuid, { semver, note }, token)
      const result = await templatesApi.publish(orgId, template.template_uuid, { make_live: makeLive }, token)
      await editing.replace(result)
      await globalMutate(isTemplatesKey)
      onPublished()
      setDone({ semver: result.versions?.[0]?.semver || semver, live: makeLive, moved: result.moved?.plans || 0, first: !versions.length })
    } catch (error: any) { toast.error(error?.message || 'Could not publish the version.') } finally { setBusy(false) }
  }
  const listed = (changes?.stages || []).flatMap((stage) => stage.steps.map((step) => ({ ...step, stage: stage.title }))).filter((step) => step.change !== 'moved')
  const document = template.document
  const stepCount = document.stages.reduce((total, stage) => total + stage.steps.length, 0)
  const learners = preview?.open_plans || 0

  return <PlanDialog open={open} onOpenChange={setOpen} title="Publish this draft" description="Published versions are locked. Future changes go in a new draft."
    footer={<><button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={() => setOpen(false)}>Cancel</button>
      <button type="button" className={smallPrimaryClass + ' h-10 px-4 text-sm'} onClick={() => void publish()} disabled={busy || !!problem || editing.stale}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Publish v{semver || draft.semver}</button></>}>
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-2.5 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">Version<Input value={semver} onChange={(event) => setSemver(event.target.value)} aria-invalid={!!problem} className="font-mono" autoComplete="off" /></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">Note<Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What’s changing?" maxLength={1000} autoComplete="off" /></label>
      </div>
      {problem ? <p className="-mt-1.5 text-[13px] text-red-600">{problem}</p> : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">{live ? `Changes from ${versionLabel(live)}` : 'Steps'}</span>
        {!live && !changes?.base ? <p className="text-[13px] text-muted-foreground">{plural(stepCount, 'step')}{document.stages.length > 1 ? ` in ${document.stages.length} stages` : ''}</p>
          : !changes ? <Loader2 className="animate-spin text-muted-foreground" />
          : listed.length ? <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">{listed.map((step) => <ChangeRow key={`${step.stage}:${step.step_key}`} type={step.type as StepTypeKey} title={step.title} change={step.change} />)}</ul>
          : <p className="text-[13px] text-muted-foreground">{changes.summary.stages_changed ? 'Only stage changes.' : 'No step changes.'}</p>}
      </div>
      <ToggleRow title="Make it the live version" checked={makeLive} onChange={setMakeLive}
        detail={live ? learners ? `${plural(learners, 'learner')} in progress move to v${semver || draft.semver} and keep their answers. Anyone who finished stays complete.` : `It replaces ${versionLabel(live)} for anyone you assign it to.` : 'Then you can start assigning it.'} />
      <p className="text-[12.5px] text-muted-foreground">Once published, this version is locked. Future changes go in a new draft.</p>
    </div>
  </PlanDialog>
}

function ChangeRow({ type, title, change }: { type: StepTypeKey; title: string; change: string }) {
  const definition = stepDefinition(type)
  const Icon = definition.icon
  return <li className={cn('flex items-center gap-2 rounded-[10px] border px-2.5 py-2 text-[13px]',
    change === 'added' ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950' : change === 'changed' ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950' : 'border-border')}>
    <i className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-white" style={{ background: definition.color }}><Icon size={12} aria-hidden="true" /></i>
    <span className={cn('min-w-0 flex-1 truncate', change === 'removed' && 'text-muted-foreground line-through')}>{title || 'Untitled step'}</span>
    <em className={cn('shrink-0 text-[11px] font-bold not-italic', change === 'added' ? 'text-emerald-700 dark:text-emerald-300' : change === 'changed' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
      {change === 'added' ? 'New' : change === 'changed' ? 'Changed' : 'Removed'}
    </em>
  </li>
}

/** The plan went out: confetti, what happened to learners, then the next thing to do with it. */
function Celebration({ open, setOpen, title, done, canAssign, templateUuid, onVisibility }: {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; title: string; done: Done; canAssign: boolean; templateUuid: string; onVisibility?: (() => void) | null
}) {
  const detail = !done.live ? 'It’s locked and in the version list. Make it live whenever you’re ready.'
    : done.first ? 'You built a plan. Now put it in someone’s hands.'
    : done.moved ? `${plural(done.moved, 'learner plan')} moved to it and kept their answers. Anyone who finished stays complete.` : 'New assignments get this version.'
  return <PlanDialog open={open} onOpenChange={setOpen} bare title={`v${done.semver} published`}
    footer={<button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={() => setOpen(false)}>Back to plan</button>}>
    <div className="relative overflow-hidden px-[26px] pb-[26px] pt-[34px] text-center" data-testid="plan-published">
      {done.live ? <Confetti /> : null}
      <span className="mx-auto grid h-[92px] w-[92px] place-items-center rounded-full bg-emerald-600 text-white shadow-[inset_0_-6px_0_hsl(0_0%_0%/.2),0_16px_40px_hsl(152_60%_30%/.35)] motion-safe:animate-[plan-pop_.6s_cubic-bezier(.2,1.6,.4,1)_both]">
        <Check size={46} strokeWidth={2.6} aria-hidden="true" />
      </span>
      <h2 className="mt-[18px] text-[28px] font-extrabold leading-tight tracking-tight">{done.live ? `${title} v${done.semver} is live!` : `v${done.semver} is published`}</h2>
      <p className="mt-2 text-[15px] leading-normal text-muted-foreground">{detail}</p>
      {done.live && (canAssign || onVisibility) ? <div className="relative mt-[22px] flex flex-col gap-2 text-left">
        {canAssign ? <AssignFlow initialTemplateUuid={templateUuid} trigger={<button type="button" className="flex items-center gap-3.5 rounded-2xl border border-brand bg-brand-soft p-3.5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white"><Users size={20} aria-hidden="true" /></span>
          <span><b className="block text-[14.5px]">{done.first ? 'Assign it to your first learners' : 'Assign it'}</b><span className="text-[13px] text-muted-foreground">To a group, or to learners one by one</span></span>
        </button>} /> : null}
        {onVisibility ? <button type="button" onClick={() => { setOpen(false); onVisibility() }} className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3.5 text-left hover:border-brand">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted"><Globe size={20} aria-hidden="true" /></span>
          <span><b className="block text-[14.5px]">Choose who can find it</b><span className="text-[13px] text-muted-foreground">Other organizations, or learners looking for it</span></span>
        </button> : null}
      </div> : null}
    </div>
  </PlanDialog>
}

const CONFETTI = ['#2F66D6', '#C8327D', '#F5A524', '#13B3A4', '#8B5CF6', '#7CC423']

/** A burst of paper from the top of the dialog, once; nothing with reduced motion. */
function Confetti() {
  const ref = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = canvas.getBoundingClientRect()
    canvas.width = box.width; canvas.height = box.height
    const context = canvas.getContext('2d')
    if (!context) return
    const bits = Array.from({ length: 120 }, () => ({ x: box.width / 2, y: 120, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 10 - 4, size: 4 + Math.random() * 5, color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)], angle: Math.random() * 6, spin: (Math.random() - 0.5) * 0.3 }))
    let tick = 0
    let frame = 0
    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const bit of bits) {
        bit.x += bit.vx; bit.y += bit.vy; bit.vy += 0.32; bit.vx *= 0.99; bit.angle += bit.spin
        context.save(); context.translate(bit.x, bit.y); context.rotate(bit.angle)
        context.fillStyle = bit.color; context.globalAlpha = Math.max(0, 1 - tick / 120)
        context.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2); context.restore()
      }
      if (++tick < 120) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
}
