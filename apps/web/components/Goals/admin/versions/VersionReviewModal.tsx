'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Minus, MoveRight, PencilLine, Plus } from 'lucide-react'
import { useMediaQuery } from 'usehooks-ts'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import EditSheet from '@components/Goals/edit/EditSheet'
import { isTemplatesKey } from '@services/goals/templates'
import { assignmentVersionsApi, versionChangesKey, type StepChange, type VersionChanges, type VersionStageChange } from '@services/goals/versions'
import { cn } from '@/lib/utils'

const CHANGE: Record<StepChange, { label: string; tone: string; Icon: typeof Plus }> = {
  added: { label: 'Added', tone: 'bg-green-50 text-green-700', Icon: Plus },
  removed: { label: 'Removed', tone: 'bg-red-50 text-red-700', Icon: Minus },
  changed: { label: 'Changed', tone: 'bg-amber-50 text-amber-800', Icon: PencilLine },
  moved: { label: 'Moved here', tone: 'bg-blue-50 text-blue-700', Icon: MoveRight },
}

const SHEET_COLOR = '#7cc4ff'

const isGoalAdminKey = (key: unknown) => typeof key === 'string' && key.includes('/goal-admin/')

type ReviewProps = {
  orgId: number
  token?: string
  assignmentUuid: string
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (next: boolean) => void
  onApplied?: () => void | Promise<void>
}

/** The changes a new template version brings to one assignment, and applying it to the learners' open plans. */
export default function VersionReviewModal({ orgId, token, assignmentUuid, open, onOpenChange, onApplied }: ReviewProps) {
  const phone = useMediaQuery('(max-width: 639px)')
  const { data, isLoading, error } = useSWR<VersionChanges>(open && orgId && token ? versionChangesKey(orgId, assignmentUuid) : null,
    () => assignmentVersionsApi.changes(orgId, assignmentUuid, token), { revalidateOnFocus: false })
  const [saving, setSaving] = React.useState(false)
  const apply = async () => {
    if (!data || saving) return
    setSaving(true)
    try {
      const result = await assignmentVersionsApi.apply(orgId, assignmentUuid, data.target.version_uuid, token)
      await mutate((key) => isTemplatesKey(key) || isGoalAdminKey(key))
      await onApplied?.()
      const { plans, kept_started: kept } = result.applied
      toast.success(`Version ${data.target.number} applied to ${plans} plan${plans === 1 ? '' : 's'}.${kept ? ` ${kept} started step${kept === 1 ? '' : 's'} kept as they were.` : ''}`)
      onOpenChange(false)
    } catch (failure: any) { toast.error(failure?.message || 'Could not apply the version.') } finally { setSaving(false) }
  }
  const title = data ? `Version ${data.target.number} of this template` : 'New template version'
  const description = 'Nothing changes for learners until you apply it. Steps a learner has started or finished stay as they are, answers and all.'
  const changes = isLoading || (!data && !error) ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
    : !data ? <p className="py-8 text-center text-sm text-muted-foreground">Could not load the changes.</p>
      : <>
        <p className="text-sm text-muted-foreground">You&apos;re on version {data.current?.number ?? '?'}. {data.target.note ? <>Note from the publisher: <span className="text-foreground">{data.target.note}</span></> : null}</p>
        <BadgeNote changes={data} />
        {data.has_changes ? <div className="space-y-3 pr-1 sm:max-h-[50vh] sm:overflow-y-auto">{data.stages.filter((stage) => stage.change !== 'same').map((stage) => <StageChanges key={stage.stage_key} stage={stage} />)}</div>
          : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">This version has no step changes.</p>}
      </>
  const moving = data ? <p className="text-xs text-muted-foreground">{data.open_plans} open plan{data.open_plans === 1 ? '' : 's'} will move. Finished plans keep the version they finished on.</p> : null
  const applyButton = data ? <button type="button" onClick={() => void apply()} disabled={saving} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-black text-white disabled:opacity-40">
    {saving ? <Loader2 size={14} className="animate-spin" /> : null}Apply version {data.target.number}
  </button> : null
  // On a phone the review is a full-width tray from the bottom, like other edits there, with Apply pinned under it.
  if (phone) return <EditSheet open={open} onOpenChange={onOpenChange} color={SHEET_COLOR} title={title} description={description}
    footer={applyButton ? <div className="flex w-full flex-col gap-2">{moving}<span className="flex [&>button]:min-h-10 [&>button]:flex-1">{applyButton}</span></div> : null}>
    {changes}
  </EditSheet>
  return <Modal isDialogOpen={open} onOpenChange={onOpenChange} minHeight="no-min" minWidth="md" dialogTitle={title}
    dialogDescription={description}
    dialogContent={data ? <div className="space-y-4 p-1">
      {changes}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">{moving}{applyButton}</div>
    </div> : changes} />
}

/** The badge is part of the plan, so a version can add it, drop it or rename it. */
function BadgeNote({ changes }: { changes: VersionChanges }) {
  const now = changes.badge?.name
  const next = changes.target.badge?.name
  if (now === next) return null
  const text = !next ? `Version ${changes.target.number} no longer earns ${now}. Learners who already earned it keep it.`
    : !now ? `Learners who finish version ${changes.target.number} earn ${next}.`
    : `Version ${changes.target.number} earns ${next} instead of ${now}.`
  return <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">{text}</p>
}

function StageChanges({ stage }: { stage: VersionStageChange }) {
  return <section className="rounded-xl border border-border">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <h3 className="text-sm font-black">{stage.title}</h3>
      <span className="text-[10px] font-black uppercase text-muted-foreground">{stage.change === 'added' ? 'New stage' : stage.change === 'removed' ? 'Stage removed' : stage.fields.length ? `Stage ${stage.fields.join(', ')} changed` : ''}</span>
    </div>
    <ul className="divide-y divide-border">
      {stage.steps.map((step) => {
        const { label, tone, Icon } = CHANGE[step.change]
        return <li key={`${step.change}:${step.step_key}`} className="flex items-start gap-3 px-3 py-2">
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase', tone)}><Icon size={11} />{label}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{step.title || step.step_key}</p>
            <p className="text-xs text-muted-foreground">
              {step.moved_from ? `From ${step.moved_from}. ` : ''}{step.fields?.length ? `${step.fields.join(', ')} changed. ` : ''}
              {step.started_count ? `${step.started_count} learner${step.started_count === 1 ? ' has' : 's have'} started it and keep${step.started_count === 1 ? 's' : ''} their version.` : ''}
            </p>
          </div>
        </li>
      })}
    </ul>
  </section>
}
