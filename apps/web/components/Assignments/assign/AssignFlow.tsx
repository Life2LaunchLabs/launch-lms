'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { mutate as mutateGlobal } from 'swr'
import * as Dialog from '@radix-ui/react-dialog'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Loader2, Send, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useFeatures } from '@components/Hooks/useFeatures'
import { PlanTile } from '@components/Assignments/Pair'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isGoalsKey } from '@services/goals/goals'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'
import { createUserGroup } from '@services/usergroups/usergroups'
import { assignmentKeys, type AssignmentPlan } from '@services/assignments/assignments'
import { FLOW_STEPS, alreadyOn, baseRequest, defaultSchedule, moveStart, recipientKey, recipientName, requestFor, scheduleProblem, staffProblem, type FlowSchedule, type Recipient, type StaffPick } from '@services/assignments/assignFlow'
import { useAssignData } from './useAssignData'
import { MessageStep, ReviewStep, ScheduleStep, StaffStep, WhoStep } from './FlowSteps'
import { ListPreview, MessagePreview, StaffPreview, StagesPanel } from './FlowPreviews'
import { FlowButton, FlowProgress, FlowStage, StepHead } from './flowUi'
import DonePanel, { type Made } from './DonePanel'
import PlanChooser from './PlanChooser'

type Props = {
  trigger: React.ReactNode
  initialTemplateUuid?: string
  initialUserIds?: number[]
  initialGroupIds?: number[]
  onAssigned?: () => void | Promise<void>
}

/**
 * Assigning a plan, full screen: Who, Schedule, Staff, Message and Review on the left, and on the
 * right what each choice makes (the plan's assignments list, its stages, the People tab, what
 * learners see). Each pick becomes its own assignment.
 */
export default function AssignFlow({ trigger, initialTemplateUuid = '', initialUserIds = [], initialGroupIds = [], onAssigned }: Props) {
  const org = useOrg() as { id?: number; name?: string; slug?: string } | null
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const me = session?.data?.user
  const orgId = Number(org?.id)
  const canGroups = useFeatures().has('groups')
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [templateUuid, setTemplateUuid] = React.useState(initialTemplateUuid)
  const [step, setStep] = React.useState(0)
  const [picks, setPicks] = React.useState<Recipient[]>([])
  const [query, setQuery] = React.useState('')
  const [staffQuery, setStaffQuery] = React.useState('')
  const [schedule, setSchedule] = React.useState<FlowSchedule | null>(null)
  const [staff, setStaff] = React.useState<StaffPick[]>([])
  const [welcome, setWelcome] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [made, setMade] = React.useState<Made[] | null>(null)

  const data = useAssignData({ orgId, token, open, templateUuid, query, staffQuery, groups: canGroups })
  const template = data.template
  const document = template ? template.live_document || template.document : null
  const plan: AssignmentPlan | null = template ? { template_uuid: template.template_uuid, title: template.title, thumbnail_image: template.thumbnail_image, icon: template.icon, color: template.color, version: template.published_version } : null

  // Who it starts with: the people and groups the flow was opened for, once their names are known.
  React.useEffect(() => {
    if (!open || picks.length || (!initialGroupIds.length && !initialUserIds.length)) return
    const groups = data.groups.filter((group) => initialGroupIds.includes(group.id)).map((group): Recipient => ({ kind: 'group', id: group.id, name: group.name, count: group.member_count }))
    const people = data.people.filter((item) => initialUserIds.includes(item.user.id)).map((item): Recipient => ({ kind: 'member', id: item.user.id, name: item.user.name, username: item.user.username, avatar_image: item.user.avatar_image, user_uuid: item.user.user_uuid }))
    if (groups.length || people.length) setPicks([...groups, ...people])
  }, [open, data.groups, data.people, initialGroupIds, initialUserIds, picks.length])
  React.useEffect(() => {
    if (!document || schedule) return
    setSchedule(defaultSchedule(document))
    setWelcome(document.template.instructions || '')
  }, [document, schedule])
  React.useEffect(() => {
    if (!open || staff.length || !me?.id) return
    const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || me.username
    setStaff([{ id: Number(me.id), name, username: me.username, avatar_image: me.avatar_image, user_uuid: me.user_uuid, role: 'lead', you: true }])
  }, [open, me, staff.length])

  const reset = () => {
    setTemplateUuid(initialTemplateUuid); setStep(0); setPicks([]); setQuery(''); setStaffQuery(''); setSchedule(null); setStaff([]); setWelcome(''); setMade(null)
  }
  const change = (next: boolean) => { if (saving) return; setOpen(next); if (!next) reset() }

  const taken = React.useMemo(() => alreadyOn(data.assignments, templateUuid), [data.assignments, templateUuid])
  const running = data.assignments.filter((item) => item.plan.template_uuid === templateUuid && item.status !== 'ended')
  const blocked = step === 0 ? (picks.length ? null : 'Add someone') : step === 1 && schedule ? scheduleProblem(schedule) : step === 2 ? staffProblem(staff) : null

  const assign = async () => {
    if (!template || !document || !schedule || saving) return
    setSaving(true)
    const base = baseRequest(document, schedule, staff, welcome)
    const done: Made[] = []
    const failed: string[] = []
    for (const pick of picks) {
      try {
        const newGroups: Record<string, number> = {}
        if (pick.kind === 'newgroup') {
          const created = await createUserGroup({ name: pick.name, description: '', org_id: orgId }, token || '')
          if (!created?.success || !created.data?.id) throw new Error(created?.data?.detail || 'Could not create the group')
          newGroups[recipientKey(pick)] = Number(created.data.id)
        }
        const result = await templatesApi.assign(orgId, template.template_uuid, requestFor(pick, base, newGroups), token)
        done.push({ assignment_uuid: result.assignment_uuid, name: recipientName(pick), group: pick.kind === 'group' || pick.kind === 'newgroup' })
      } catch (error: any) {
        failed.push(`${recipientName(pick)}: ${error?.message || 'failed'}`)
      }
    }
    setSaving(false)
    if (done.length) {
      await mutateGlobal((key) => isTemplatesKey(key) || isGoalsKey(key) || (typeof key === 'string' && key.startsWith(assignmentKeys.list(orgId).split('?')[0])))
      await onAssigned?.()
      setMade(done)
    }
    if (failed.length) toast.error(`${done.length ? `${done.length} created; ` : ''}${failed.length} failed. ${failed[0]}`)
  }

  const href = (uuid: string) => getUriWithOrg(String(org?.slug || ''), routePaths.org.admin.planAssignment(uuid))
  const go = (uuid: string, query = '') => { change(false); router.push(`${href(uuid)}${query}`) }
  const slug = String(org?.slug || 'your-org')
  const orgName = String(org?.name || 'your organization')
  const from = staff.find((item) => item.you)?.name || staff[0]?.name || 'Staff'
  const steps = document ? document.stages.reduce((sum, stage) => sum + stage.steps.length, 0) : 0
  const solo = step === 4 || Boolean(made)
  const eyebrow = template ? `Assign ${template.title} · ${step + 1} of ${FLOW_STEPS.length}` : ''

  const left = !template || !document || !schedule ? null : step === 0 ? <>
    <StepHead eyebrow={eyebrow} title="Who is it for?" lede={`Add people${canGroups ? ' and groups' : ''}. Type an email to invite someone new${canGroups ? ', or a new name to create a group' : ''}. Each one gets its own assignment.`} />
    <WhoStep picks={picks} setPicks={setPicks} query={query} setQuery={setQuery} groups={data.groups} people={data.people} canGroups={canGroups} taken={taken} />
  </> : step === 1 ? <>
    <StepHead eyebrow={eyebrow} title="Schedule" lede={schedule.mode === 'sched' ? 'Set when each stage starts. Steps follow their stage unless you give them dates.' : 'Learners go through the steps in order, at their own pace.'} />
    <ScheduleStep schedule={schedule} setSchedule={setSchedule} onStart={(start) => setSchedule(moveStart(schedule, start))} />
  </> : step === 2 ? <>
    <StepHead eyebrow={eyebrow} title="Staff" lede="Who answers questions and reviews work day to day. Admins can always open it." />
    <StaffStep staff={staff} setStaff={setStaff} query={staffQuery} setQuery={setStaffQuery} options={data.staff} />
  </> : step === 3 ? <>
    <StepHead eyebrow={eyebrow} title="Message" lede="Sent to everyone you assigned, with the plan attached." />
    <MessageStep welcome={welcome} setWelcome={setWelcome} picks={picks} orgName={orgName} />
  </> : <>
    <StepHead eyebrow={eyebrow} title="Review" lede={`${picks.length > 1 ? `Creates ${picks.length} assignments.` : 'Creates one assignment.'} Nothing is sent until you assign.`} />
    <ReviewStep template={template} document={document} picks={picks} schedule={schedule} staff={staff} welcome={welcome} goTo={setStep} />
  </>

  const right = !plan || !document || !schedule ? null : step === 0 ? <ListPreview plan={plan} picks={picks} running={running} slug={slug} />
    : step === 1 ? <StagesPanel document={document} schedule={schedule} setSchedule={setSchedule} />
      : step === 2 ? <StaffPreview plan={plan} picks={picks} staff={staff} slug={slug} />
        : <MessagePreview plan={plan} picks={picks} welcome={welcome} orgName={orgName} from={from} steps={steps} scheduled={schedule.mode === 'sched'} start={schedule.mode === 'sched' ? schedule.starts[0] : schedule.start} />

  return <Dialog.Root open={open} onOpenChange={change}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 flex flex-col overflow-auto bg-background pt-[env(safe-area-inset-top,0px)]" style={{ zIndex: 'var(--z-modal)' }}>
        <div className="flex items-center gap-3.5 px-6 py-3.5">
          {plan ? <PlanTile plan={plan} size="md" /> : null}
          <Dialog.Title className="min-w-0 flex-1 truncate text-base font-bold">{template ? `Assign ${template.title}` : 'Assign a plan'}</Dialog.Title>
          <Dialog.Close className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card" aria-label="Close"><X size={18} /></Dialog.Close>
        </div>
        {template && !made ? <FlowProgress step={step} /> : null}
        {!templateUuid ? <PlanChooser orgId={orgId} token={token} onPick={setTemplateUuid} />
          : made ? <DonePanel made={made} scheduled={schedule?.mode === 'sched'} onOpen={(uuid, query) => go(uuid, query)} onClose={() => change(false)} />
          : !left ? <div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : <FlowStage solo={solo} step={step} left={left} right={right} nav={<>
            {step ? <FlowButton onClick={() => setStep(step - 1)}><ArrowLeft />Back</FlowButton> : <FlowButton tone="ghost" onClick={() => change(false)}>Cancel</FlowButton>}
            {step < 4 ? <FlowButton tone="primary" disabled={Boolean(blocked)} title={blocked || undefined} onClick={() => setStep(step + 1)}>
              {step === 0 && picks.length > 1 ? `Next: ${picks.length} assignments` : 'Next'}<ArrowRight /></FlowButton>
              : <FlowButton tone="brand" size="lg" disabled={saving} onClick={() => void assign()}>{saving ? <Loader2 className="animate-spin" /> : <Send />}Assign{picks.length > 1 ? ` to ${picks.length}` : ''}</FlowButton>}
          </>} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

