'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Layers3, Loader2, Mail, Plus, Send, User, Users } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { usePlan } from '@components/Hooks/usePlan'
import { getAPIUrl } from '@services/config/config'
import { isGoalsKey } from '@services/goals/goals'
import { isTemplatesKey, templateKeys, templatesApi, type GoalAssignmentRequest } from '@services/goals/templates'
import type { GoalTemplate } from '@services/goals/types'
import { planMeetsRequirement } from '@services/plans/plans'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'
import { Count, Empty, Loading, PickerRow, PickerSection, ScheduleStep, SearchInput, StepNumber, canStaff, defaultSchedule, memberOf, personName, scheduleProblem, today, type Membership, type StageDate, type StepRule } from './AssignmentParts'

type Target = { type: 'user' | 'group'; id: number }
type Props = {
  trigger: React.ReactNode
  initialTemplateUuid?: string
  initialUserIds?: number[]
  initialGroupIds?: number[]
  onAssigned?: () => void | Promise<void>
}

const targetKey = (target: Target) => `${target.type}:${target.id}`
const STEPS = ['Template & recipients', 'Schedule', 'Staff & invitation', 'Review']

/** Hands a published goal template to people, groups or email addresses, with a stage schedule and staff. */
export default function GoalAssignmentModal({ trigger, initialTemplateUuid = '', initialUserIds = [], initialGroupIds = [], onAssigned }: Props) {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string }; user?: { id?: number } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const canUseGroups = planMeetsRequirement(usePlan(), 'full')
  const currentUserId = Number(session?.data?.user?.id || 0)
  const initialTargets = React.useCallback(() => [...initialUserIds.map((id) => ({ type: 'user' as const, id })), ...(canUseGroups ? initialGroupIds.map((id) => ({ type: 'group' as const, id })) : [])], [canUseGroups, initialGroupIds, initialUserIds])
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [templateUuid, setTemplateUuid] = React.useState(initialTemplateUuid)
  const [targets, setTargets] = React.useState<Target[]>(initialTargets)
  const [stageDates, setStageDates] = React.useState<StageDate[]>([])
  const [stepRules, setStepRules] = React.useState<StepRule[]>([])
  const [scheduledFor, setScheduledFor] = React.useState('')
  const [staffIds, setStaffIds] = React.useState<number[]>([])
  const [staffRoles, setStaffRoles] = React.useState<Record<number, string>>({})
  const [ownerId, setOwnerId] = React.useState(0)
  const [emails, setEmails] = React.useState<string[]>([])
  const [email, setEmail] = React.useState('')
  const [startDate, setStartDate] = React.useState(today())
  const [welcome, setWelcome] = React.useState('')
  const [templateSearch, setTemplateSearch] = React.useState('')
  const [recipientSearch, setRecipientSearch] = React.useState('')
  const [recipientType, setRecipientType] = React.useState<'people' | 'groups' | 'external'>('people')
  const [saving, setSaving] = React.useState(false)

  const enabled = open && orgId && token
  const { data: templates, isLoading: templatesLoading } = useSWR<GoalTemplate[]>(enabled ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token), { revalidateOnFocus: false })
  const { data: template, isLoading: templateLoading } = useSWR(enabled && templateUuid ? templateKeys.one(orgId, templateUuid) : null, () => templatesApi.get(orgId, templateUuid, token), { revalidateOnFocus: false })
  const { data: people, isLoading: peopleLoading } = useSWR<{ items?: Membership[] }>(enabled ? `${getAPIUrl()}orgs/${orgId}/users?page=1&limit=100` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const { data: groups, isLoading: groupsLoading } = useSWR<Array<{ id: number; name: string; description?: string }>>(enabled && canUseGroups ? `${getAPIUrl()}usergroups/org/${orgId}?org_id=${orgId}` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const memberships = React.useMemo(() => people?.items || [], [people])
  const staff = React.useMemo(() => memberships.filter(canStaff), [memberships])
  const roles = template?.document.roles
  const staffRoleKey = roles?.staff_role_key || 'reviewer'
  const workingRoles = (roles?.definitions || []).filter((role) => !['subject', 'plan_admin'].includes(role.key))

  React.useEffect(() => {
    if (!open || staffIds.length || !currentUserId || !staff.some((membership) => Number(memberOf(membership).id) === currentUserId)) return
    setStaffIds([currentUserId]); setOwnerId(currentUserId)
  }, [open, currentUserId, staff, staffIds.length])
  React.useEffect(() => {
    if (!template || scheduledFor === template.template_uuid) return
    const schedule = defaultSchedule(template.document)
    setStageDates(schedule.stages); setStepRules(schedule.steps)
    setWelcome(template.document.template.instructions || '')
    setScheduledFor(template.template_uuid)
  }, [template, scheduledFor])
  React.useEffect(() => { if (!canUseGroups && recipientType === 'groups') setRecipientType('people') }, [canUseGroups, recipientType])

  const reset = () => {
    setStep(0); setTemplateUuid(initialTemplateUuid); setTargets(initialTargets()); setStageDates([]); setStepRules([]); setScheduledFor('')
    setStaffIds([]); setStaffRoles({}); setOwnerId(0); setEmails([]); setEmail(''); setStartDate(today()); setWelcome(''); setTemplateSearch(''); setRecipientSearch('')
  }
  const changeOpen = (next: boolean) => { setOpen(next); if (!next && !saving) reset() }
  const toggleTarget = (target: Target) => setTargets((current) => current.some((item) => targetKey(item) === targetKey(target)) ? current.filter((item) => targetKey(item) !== targetKey(target)) : [...current, target])
  const toggleStaff = (id: number) => {
    const next = staffIds.includes(id) ? staffIds.filter((item) => item !== id) : [...staffIds, id]
    setStaffIds(next)
    if (!next.includes(ownerId)) setOwnerId(next[0] || 0)
  }
  const ready = !!template && scheduledFor === templateUuid && !templateLoading
  const problem = ready ? scheduleProblem(stageDates, stepRules) : 'Loading the template.'
  const recipients = targets.length + emails.length

  const submit = async () => {
    if (!template || !recipients || !ownerId || problem || saving) return
    setSaving(true)
    const base: GoalAssignmentRequest = {
      staff_user_ids: staffIds,
      collaborators: staffIds.map((userId) => ({ user_id: userId, role_key: userId === ownerId ? 'plan_admin' : staffRoles[userId] || staffRoleKey })),
      owner_user_id: ownerId, start_date: startDate, welcome_message: welcome,
      schedule: {
        stages: stageDates.map((item) => ({ stage_key: item.stage_key, due_date: item.due_date })),
        steps: stepRules.filter((rule) => rule.custom || rule.allow_late !== rule.default_allow_late).map((rule) => ({ step_key: rule.step_key, due_date: rule.custom ? rule.due_date : null, allow_late: rule.allow_late })),
      },
    }
    const requests = [
      ...targets.map((target) => templatesApi.assign(orgId, templateUuid, { ...base, ...(target.type === 'group' ? { usergroup_id: target.id } : { user_id: target.id }) }, token)),
      ...emails.map((address) => templatesApi.assign(orgId, templateUuid, { ...base, subject_email: address }, token)),
    ]
    const results = await Promise.allSettled(requests)
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    const succeeded = results.length - failed.length
    try {
      if (succeeded) { await mutate((key) => isTemplatesKey(key) || isGoalsKey(key)); await onAssigned?.() }
      if (!failed.length) { toast.success(`${succeeded} ${succeeded === 1 ? 'assignment' : 'assignments'} created.`); setOpen(false); reset() }
      else toast.error(`${succeeded ? `${succeeded} created; ` : ''}${failed.length} failed. ${failed[0].reason?.message || 'Please try again.'}`)
    } finally { setSaving(false) }
  }

  const templateQuery = templateSearch.trim().toLowerCase()
  const visibleTemplates = (templates || []).filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(templateQuery))
  const recipientQuery = recipientSearch.trim().toLowerCase()
  const visiblePeople = memberships.filter((membership) => personName(memberOf(membership)).toLowerCase().includes(recipientQuery))
  const visibleGroups = (groups || []).filter((group) => `${group.name} ${group.description || ''}`.toLowerCase().includes(recipientQuery))
  const addEmail = () => {
    const address = email.trim().toLowerCase()
    if (!address.includes('@')) return toast.error('Enter a valid email address.')
    if (emails.includes(address)) return toast.error('That email is already included.')
    setEmails((current) => [...current, address]); setEmail('')
  }
  const descriptions = [`Choose one template and one or more ${canUseGroups ? 'people, groups or email addresses' : 'people or email addresses'}.`, `Set stage targets${template ? ` for ${template.title}` : ''}.`, 'Choose the staff, their roles and the invitation.', 'Check the assignment before creating it.']
  const tab = (key: typeof recipientType, label: string) => <button type="button" onClick={() => setRecipientType(key)} className={cn('rounded-md px-2 py-1.5 text-xs font-bold', recipientType === key && 'bg-card shadow-xs')}>{label}</button>

  return <Modal isDialogOpen={open} onOpenChange={changeOpen} minHeight="no-min" minWidth="no-min" customHeight="h-[min(820px,92dvh)]" customWidth="md:w-[min(1100px,95vw)]" dialogTitle="Assign a goal template" dialogDescription={descriptions[step]} dialogTrigger={trigger} dialogContent={<div className="flex h-full min-h-0 flex-col">
    <div className="mb-4 flex shrink-0 items-center gap-2 overflow-x-auto text-xs font-black">{STEPS.map((label, index) => <React.Fragment key={label}>{index ? <span className="mx-2 h-px w-8 bg-border" /> : null}<StepNumber active={step === index} complete={step > index}>{index + 1}</StepNumber><span className={step === index ? 'text-foreground' : 'text-muted-foreground'}>{label}</span></React.Fragment>)}</div>
    {step === 0 && <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
      <PickerSection title="Goal template" count={templateUuid ? 1 : 0} search={templateSearch} setSearch={setTemplateSearch} placeholder="Search templates">
        {templatesLoading ? <Loading /> : visibleTemplates.length ? visibleTemplates.map((item) => <PickerRow key={item.template_uuid} selected={templateUuid === item.template_uuid} disabled={!item.published_version} onClick={() => { if (item.template_uuid !== templateUuid) { setTemplateUuid(item.template_uuid); setScheduledFor('') } }} icon={<Layers3 size={16} />} title={item.title} description={item.published_version ? `Version ${item.published_version}${item.description ? ` · ${item.description}` : ''}` : 'Publish it before handing it out'} />) : <Empty>No goal templates found.</Empty>}
      </PickerSection>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
        <div className="shrink-0 border-b border-border p-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-black">Recipients</h3><Count value={recipients} /></div>
          <div className={cn('mt-3 grid rounded-lg bg-muted p-1', canUseGroups ? 'grid-cols-3' : 'grid-cols-2')}>{tab('people', 'People')}{canUseGroups ? tab('groups', 'Groups') : null}{tab('external', 'By email')}</div>
          {recipientType !== 'external' ? <SearchInput value={recipientSearch} onChange={setRecipientSearch} placeholder={`Search ${recipientType}`} /> : null}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {recipientType === 'external' ? <div className="space-y-3">
            <div className="flex gap-2"><input type="email" aria-label="Email address" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEmail() } }} placeholder="person@example.com" className="h-10 min-w-0 flex-1 rounded-lg border border-border px-3 text-sm" /><button type="button" onClick={addEmail} aria-label="Add email" className="rounded-lg bg-foreground px-3 text-background"><Plus size={14} /></button></div>
            <p className="text-xs leading-5 text-muted-foreground">People invited by email don&apos;t join the organization or use a member seat.</p>
            {emails.map((address) => <div key={address} className="flex items-center gap-2 rounded-lg border border-border p-3"><Mail size={15} className="text-blue-600" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{address}</span><button type="button" onClick={() => setEmails((current) => current.filter((item) => item !== address))} className="text-xs font-black text-red-600">Remove</button></div>)}
          </div> : recipientType === 'people' ? peopleLoading ? <Loading /> : visiblePeople.length ? visiblePeople.map((membership) => { const person = memberOf(membership); return <PickerRow key={person.id} selected={targets.some((item) => item.type === 'user' && item.id === Number(person.id))} onClick={() => toggleTarget({ type: 'user', id: Number(person.id) })} icon={<User size={16} />} title={personName(person)} description={membership.role?.name || person.email || 'Organization member'} /> }) : <Empty>No people found.</Empty>
            : groupsLoading ? <Loading /> : visibleGroups.length ? visibleGroups.map((group) => <PickerRow key={group.id} selected={targets.some((item) => item.type === 'group' && item.id === Number(group.id))} onClick={() => toggleTarget({ type: 'group', id: Number(group.id) })} icon={<Users size={16} />} title={group.name} description={group.description || 'Group'} />) : <Empty>No groups found.</Empty>}
        </div>
      </div>
    </div>}
    {step === 1 && <div className="min-h-0 flex-1 overflow-y-auto pr-1">{!ready || !template ? <Loading /> : <ScheduleStep document={template.document} stages={stageDates} steps={stepRules}
      setStage={(key, dueDate) => setStageDates((current) => current.map((item) => item.stage_key === key ? { ...item, due_date: dueDate } : item))}
      setStep={(key, patch) => setStepRules((current) => current.map((item) => item.step_key === key ? { ...item, ...patch } : item))} />}</div>}
    {step === 2 && <div className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section><div className="mb-3"><h3 className="text-sm font-black">Goal team</h3><p className="mt-1 text-xs text-muted-foreground">The owner is each goal&apos;s goal admin. Choose working roles for anyone else.</p></div>
        <div className="space-y-2">{staff.map((membership) => {
          const person = memberOf(membership); const id = Number(person.id); const selected = staffIds.includes(id)
          return <div key={id} className="flex items-center gap-2"><div className="min-w-0 flex-1"><PickerRow selected={selected} onClick={() => toggleStaff(id)} icon={<User size={16} />} title={personName(person)} description={membership.role?.name || 'Staff'} /></div>
            {selected && id === ownerId ? <span className="inline-flex h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-800">Owner</span>
              : selected ? <select aria-label={`Role for ${personName(person)}`} value={staffRoles[id] || staffRoleKey} onChange={(event) => setStaffRoles({ ...staffRoles, [id]: event.target.value })} className="h-10 rounded-lg border border-border bg-card px-2 text-xs font-bold">{workingRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select> : null}
          </div>
        })}{!staff.length ? <Empty>No staff who can manage goal templates.</Empty> : null}</div>
      </section>
      <aside className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Summary</p><p className="mt-1 text-lg font-black">{recipients} {recipients === 1 ? 'assignment' : 'assignments'}</p><p className="text-xs text-muted-foreground">{template?.title}</p></div>
        <label className="block text-xs font-bold"><span className="mb-1.5 block">Owner</span><select value={ownerId || ''} onChange={(event) => setOwnerId(Number(event.target.value))} className="h-10 w-full rounded-lg border border-border bg-card px-3"><option value="">Choose the owner</option>{staffIds.map((id) => { const membership = staff.find((item) => Number(memberOf(item).id) === id); return membership ? <option key={id} value={id}>{personName(memberOf(membership))}</option> : null })}</select><span className="mt-1.5 block font-normal text-muted-foreground">Owns each goal and has every permission on it.</span></label>
        <label className="block text-xs font-bold"><span className="mb-1.5 block">Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3" /></label>
        <label className="block text-xs font-bold"><span className="mb-1.5 block">Welcome message <span className="font-normal text-muted-foreground">(optional)</span></span><textarea value={welcome} onChange={(event) => setWelcome(event.target.value)} rows={6} className="w-full resize-none rounded-lg border border-border bg-card p-3 text-sm" placeholder="Add context for learners" /></label>
      </aside>
    </div></div>}
    {step === 3 && <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-border p-6">
      <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Ready to create</p><h3 className="mt-1 text-xl font-black">{template?.title}</h3><p className="mt-1 text-sm text-muted-foreground">{recipients} {recipients === 1 ? 'assignment' : 'assignments'} · {staffIds.length} staff · target {stageDates.at(-1)?.due_date || 'not set'}</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-muted p-4"><p className="text-xs font-black">Schedule</p><p className="mt-1 text-xs text-muted-foreground">{stageDates.length} stages. Steps are due with their stage unless overridden.</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs font-black">Version {template?.published_version}</p><p className="mt-1 text-xs text-muted-foreground">Learners get the published version; later edits don&apos;t change their goals.</p></div></div>
    </div></div>}
    <div className="mt-4 flex shrink-0 items-center justify-between border-t border-border pt-4">
      <button type="button" onClick={() => step === 0 ? changeOpen(false) : setStep((current) => current - 1)} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-xs font-black">{step === 0 ? 'Cancel' : 'Back'}</button>
      {step === 0 ? <button type="button" onClick={() => setStep(1)} disabled={!templateUuid || !recipients} className="rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Set the schedule</button>
        : step === 1 ? <button type="button" onClick={() => problem ? toast.error(problem) : setStep(2)} disabled={!ready} className="rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Continue</button>
          : step === 2 ? <button type="button" onClick={() => setStep(3)} disabled={!staffIds.length || !ownerId || !startDate} className="rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Review</button>
            : <button type="button" onClick={() => void submit()} disabled={!ownerId || saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Create {recipients === 1 ? 'assignment' : `${recipients} assignments`}</button>}
    </div>
  </div>} />
}
