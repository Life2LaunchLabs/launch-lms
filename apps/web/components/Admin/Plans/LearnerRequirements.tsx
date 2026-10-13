'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { learnerAdminApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'
import { PageLoader, SectionCard, StatusPill, StepTypeIcon } from './shared'

export const learnerRequirementsKey = (orgId: number, userId: number) => ['learner-requirements', orgId, userId]

export function useLearnerRequirements(orgId: number, userId: number, token?: string) {
  return useSWR(orgId && userId && token ? learnerRequirementsKey(orgId, userId) : null, () => learnerAdminApi.requirements(orgId, userId, token), { revalidateOnFocus: false })
}

const STATE: Record<string, { tone: 'green' | 'blue' | 'amber'; label: string }> = {
  met: { tone: 'green', label: 'Met' },
  planned: { tone: 'blue', label: 'In plan' },
  gap: { tone: 'amber', label: 'Gap' },
}

function stepSummary(node: any) {
  const missed = node.steps.filter((step: any) => step.status === 'canceled' || step.overdue)
  if (node.state === 'met') return node.sources.map((source: any) => source.kind === 'staff_credit' ? `Credited by ${source.verified_by?.first_name || source.verified_by?.username || 'staff'}` : source.title).join(' · ')
  if (node.state === 'planned') return node.steps.filter((step: any) => !['completed', 'canceled'].includes(step.status)).map((step: any) => `${step.title}${step.due_date ? ` · due ${new Date(step.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`).join(' · ')
  if (missed.length) return `${missed[0].status === 'canceled' ? 'Excused from' : 'Missed'} ${missed.map((step: any) => step.title).join(', ')}`
  return node.steps.length ? 'Nothing open in their plans meets this' : 'No step in their plans meets this'
}

/** Gaps first, for counselors: what this learner is missing and the two ways to close it. */
export function LearnerGaps({ orgId, userId, token, learnerName }: { orgId: number; userId: number; token?: string; learnerName: string }) {
  const { data, isLoading, mutate } = useLearnerRequirements(orgId, userId, token)
  const [action, setAction] = React.useState<{ kind: 'makeup' | 'credit'; framework: any; node: any } | null>(null)
  if (isLoading) return <SectionCard title="Requirements"><PageLoader /></SectionCard>
  const frameworks: any[] = data?.frameworks || []
  if (!frameworks.length) return <SectionCard title="Requirements"><p className="text-sm text-gray-500">No requirement framework is assigned to {learnerName} yet.</p></SectionCard>
  return <SectionCard title="Requirements">
    <div className="space-y-6">
      {frameworks.map((framework) => {
        const gaps = framework.nodes.filter((node: any) => node.state === 'gap')
        return <div key={framework.enrollment_uuid}>
          <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-[13px]"><span className="font-bold text-gray-900">{framework.name}</span><span className="text-gray-500">{framework.met} of {framework.total} met</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-black" style={{ width: `${framework.total ? framework.met / framework.total * 100 : 0}%` }} /></div>
          {gaps.length ? <ul className="mt-3 space-y-2">{gaps.map((node: any) => <li key={node.node_uuid} className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
            <div className="flex flex-wrap items-start gap-2"><StatusPill tone="amber">Gap</StatusPill><div className="min-w-0 flex-1"><p className="text-sm font-bold text-gray-950">{[node.code, node.title].filter(Boolean).join(' ')}</p><p className="text-xs text-gray-600">{stepSummary(node)}</p></div></div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setAction({ kind: 'makeup', framework, node })} className="h-8 rounded-full bg-black px-3.5 text-xs font-semibold text-white">Add a make-up step</button>
              <button type="button" onClick={() => setAction({ kind: 'credit', framework, node })} className="h-8 rounded-full border border-gray-200 bg-white px-3.5 text-xs font-semibold">Credit with a note</button>
            </div>
          </li>)}</ul> : <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-green-700"><CheckCircle2 size={14} />No gaps. Everything left is in their plans.</p>}
        </div>
      })}
    </div>
    {action ? <GapAction orgId={orgId} userId={userId} token={token} plans={data?.plans || []} action={action} learnerName={learnerName} onClose={() => setAction(null)} onDone={async () => { setAction(null); await mutate() }} /> : null}
  </SectionCard>
}

function GapAction({ orgId, userId, token, plans, action, learnerName, onClose, onDone }: { orgId: number; userId: number; token?: string; plans: any[]; action: { kind: 'makeup' | 'credit'; framework: any; node: any }; learnerName: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { data: options = [], isLoading } = useSWR(action.kind === 'makeup' && token ? ['makeup-options', orgId, userId, action.node.node_uuid] : null, () => learnerAdminApi.makeupOptions(orgId, userId, action.node.node_uuid, token))
  const activePlans = plans.filter((plan) => plan.status === 'active' || plan.status === 'pending')
  const [choice, setChoice] = React.useState<string>('')
  const [title, setTitle] = React.useState('')
  const [planUuid, setPlanUuid] = React.useState(activePlans[0]?.plan_uuid || '')
  const [dueDate, setDueDate] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const label = [action.node.code, action.node.title].filter(Boolean).join(' ')
  const submit = async () => {
    setSaving(true)
    try {
      if (action.kind === 'credit') {
        await learnerAdminApi.credit(orgId, userId, { enrollment_uuid: action.framework.enrollment_uuid, node_uuid: action.node.node_uuid, note }, token)
        toast.success(`${label} credited.`)
      } else {
        await learnerAdminApi.addMakeup(orgId, userId, { plan_uuid: planUuid, node_uuid: action.node.node_uuid, objective_uuid: choice && choice !== 'custom' ? choice : null, title: choice === 'custom' ? title : null, due_date: dueDate || null }, token)
        toast.success(`Added to ${learnerName}’s plan.`)
      }
      await onDone()
    } catch (error: any) { toast.error(error?.message || 'Could not save that.') } finally { setSaving(false) }
  }
  const ready = action.kind === 'credit' ? Boolean(note.trim()) : Boolean(planUuid) && Boolean(choice) && (choice !== 'custom' || Boolean(title.trim()))
  const content = action.kind === 'credit' ? <div className="space-y-3 p-1">
    <label className="block text-xs font-bold text-gray-700">Why does this count?
      <textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="mt-1.5 w-full rounded-lg border border-gray-200 p-3 text-sm font-normal" placeholder="e.g. Worked 10 weeks at a family business this summer; confirmed with the manager." />
    </label>
    <p className="text-xs text-gray-500">Goes on {learnerName}’s record as attested by you.</p>
  </div> : <div className="space-y-4 p-1">
    {isLoading ? <PageLoader /> : <fieldset className="space-y-2"><legend className="mb-2 text-xs font-bold text-gray-700">Steps that also meet {label}</legend>
      {options.map((option: any) => <Choice key={option.objective_uuid} on={choice === option.objective_uuid} onClick={() => setChoice(option.objective_uuid)} title={option.title} detail={option.template?.name} types={option.step_types} />)}
      <Choice on={choice === 'custom'} onClick={() => setChoice('custom')} title="Something else" detail="Name a step for this learner" />
      {choice === 'custom' ? <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Informational interview with a nurse" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /> : null}
    </fieldset>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-bold text-gray-700">Add to
        <select value={planUuid} onChange={(event) => setPlanUuid(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm font-normal">{activePlans.map((plan) => <option key={plan.plan_uuid} value={plan.plan_uuid}>{plan.name}</option>)}</select>
      </label>
      <label className="block text-xs font-bold text-gray-700">Due (optional)
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-2 text-sm font-normal" />
      </label>
    </div>
    {!activePlans.length ? <p className="text-xs text-amber-800">{learnerName} has no active plan to add it to. Assign a template first.</p> : <p className="text-xs text-gray-500">Only {learnerName} gets this step. It counts toward {label} when it’s done.</p>}
  </div>
  return <Modal isDialogOpen onOpenChange={(open) => { if (!open) onClose() }} minHeight="no-min" minWidth="md" dialogTitle={action.kind === 'credit' ? `Credit ${label}` : `Make-up step for ${label}`} dialogDescription={learnerName} dialogContent={<div>{content}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-full border border-gray-200 px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void submit()} disabled={!ready || saving} className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : null}{action.kind === 'credit' ? 'Credit it' : 'Add to plan'}</button></div></div>} />
}

function Choice({ on, onClick, title, detail, types }: { on: boolean; onClick: () => void; title: string; detail?: string; types?: string[] }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left', on ? 'border-black shadow-[inset_0_0_0_1px_#000]' : 'border-gray-200 hover:bg-gray-50')}>
    {types ? <StepTypeIcon types={types} /> : null}
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{title}</span>{detail ? <span className="block truncate text-xs text-gray-500">{detail}</span> : null}</span>
  </button>
}

/** Every requirement with where the learner stands. */
export function LearnerRequirementTree({ orgId, userId, token }: { orgId: number; userId: number; token?: string }) {
  const { data, isLoading } = useLearnerRequirements(orgId, userId, token)
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  if (isLoading) return <PageLoader />
  const frameworks: any[] = data?.frameworks || []
  if (!frameworks.length) return <SectionCard><p className="text-sm text-gray-500">No requirement framework is assigned to this learner.</p></SectionCard>
  return <div className="space-y-5">{frameworks.map((framework) => {
    const byParent = new Map<string | null, any[]>()
    framework.nodes.forEach((node: any) => { const key = node.parent_node_uuid || null; byParent.set(key, [...(byParent.get(key) || []), node]) })
    const leavesUnder = (node: any): any[] => { const kids = byParent.get(node.node_uuid) || []; return kids.length ? kids.flatMap(leavesUnder) : [node] }
    const render = (node: any, depth: number): React.ReactNode => {
      const kids = byParent.get(node.node_uuid) || []
      if (!kids.length) {
        const state = STATE[node.state] || STATE.gap
        return <div key={node.node_uuid} className="flex min-h-11 items-center gap-3 border-b border-gray-50 py-1.5 pr-4" style={{ paddingLeft: 16 + depth * 20 + 20 }}>
          <span className="w-14 shrink-0 text-xs font-bold text-gray-500">{node.code}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-gray-900">{node.title}</span><span className="block truncate text-xs text-gray-500">{stepSummary(node)}</span></span>
          <StatusPill tone={state.tone}>{state.label}</StatusPill>
        </div>
      }
      const leaves = leavesUnder(node)
      const met = leaves.filter((leaf) => leaf.state === 'met').length
      const gaps = leaves.filter((leaf) => leaf.state === 'gap').length
      const isOpen = open[node.node_uuid] ?? depth === 0
      return <React.Fragment key={node.node_uuid}>
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [node.node_uuid]: !isOpen })} className={cn('flex min-h-11 w-full items-center gap-3 border-b border-gray-50 pr-4 text-left', depth ? 'bg-white' : 'bg-gray-50/70')} style={{ paddingLeft: 16 + depth * 20 }}>
          <ChevronRight size={13} className={cn('shrink-0 text-gray-400 transition', isOpen && 'rotate-90')} />
          <span className="w-12 shrink-0 text-xs font-black text-gray-500">{node.code}</span>
          <span className={cn('min-w-0 flex-1 truncate text-sm', depth ? 'font-semibold' : 'font-black')}>{node.title}</span>
          <span className="text-xs text-gray-600">{met} / {leaves.length}</span>
          <span className="w-16 text-right text-xs font-bold text-amber-700">{gaps ? `${gaps} gap${gaps === 1 ? '' : 's'}` : ''}</span>
        </button>
        {isOpen ? kids.map((kid) => render(kid, depth + 1)) : null}
      </React.Fragment>
    }
    return <section key={framework.enrollment_uuid} className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3"><h2 className="text-sm font-black">{framework.name} <span className="font-normal text-gray-500">· version {framework.version}</span></h2><span className="text-xs text-gray-600">{framework.met} of {framework.total} met{framework.gaps ? ` · ${framework.gaps} gaps` : ''}</span></div>
      {(byParent.get(null) || []).map((node) => render(node, 0))}
    </section>
  })}</div>
}
