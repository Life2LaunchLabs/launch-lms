'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Award, Check, Info, Loader2, Printer, Search, Send, Users, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getUserGroups } from '@services/usergroups/usergroups'
import { groupReportKey, reportsApi, type GroupReport as Report, type GroupReportIncludedFramework, type GroupReportLearner, type OrgMembership } from '@services/goals/reports'
import { EmptyState, PageLoader, personName } from '../live/ui'
import GroupRequirementsGrid from './GroupRequirementsGrid'
import { insightsRoutes } from './reportRoutes'

type Group = { id: number; name: string }

export function useOrgAndToken() {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string }; user?: { id?: number; is_superadmin?: boolean } } }
  return { orgId: Number(org?.id), token: session?.data?.tokens?.access_token, userId: Number(session?.data?.user?.id || 0), superadmin: Boolean(session?.data?.user?.is_superadmin) }
}

/** Admins and maintainers send reports; other staff can read and print them. */
function useCanSend(orgId: number, superadmin: boolean) {
  const { userRoles } = useAdminStatus()
  return superadmin || userRoles.some((item) => item.org?.id === orgId && [1, 2].includes(Number(item.role?.id)))
}

export function useGroupReport(orgId: number, token: string | undefined, groupId: number | null, frameworks: string[]) {
  return useSWR<Report>(orgId && token && groupId ? groupReportKey(orgId, groupId, frameworks) : null, () => reportsApi.get(orgId, groupId!, frameworks, token), { revalidateOnFocus: false, keepPreviousData: true })
}

export const longDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : ''

const STATUS: Record<GroupReportLearner['status'], { label: string; cls: string }> = {
  behind: { label: 'Behind', cls: 'bg-amber-100 text-amber-800' },
  on_pace: { label: 'On pace', cls: 'bg-green-100 text-green-700' },
  finished: { label: 'Finished', cls: 'bg-green-100 text-green-700' },
  paused: { label: 'Paused', cls: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200' },
}

export function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', cls)}>{children}</span>
}

export function DraftTag() {
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-200 bg-amber-50">Draft</span>
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div className="min-w-0"><b className="block text-2xl font-black tabular-nums text-gray-900 sm:text-[28px]">{value}</b><span className="text-xs text-gray-500 sm:text-[13px]">{label}</span></div>
}

function Table({ head, children, empty, cols }: { head: string[]; children: React.ReactNode; empty?: string | null; cols: number }) {
  return <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white nice-shadow print:overflow-visible print:rounded-none print:border-gray-300 print:shadow-none">
    <table className="w-full min-w-[640px] border-collapse text-left text-[13px] print:min-w-0 print:text-[11px]">
      <thead><tr className="border-b border-gray-100 bg-gray-50/80 print:bg-transparent">{head.map((item) => <th key={item} scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">{item}</th>)}</tr></thead>
      <tbody>{children}{empty ? <tr><td colSpan={cols} className="px-3 py-5 text-gray-500">{empty}</td></tr> : null}</tbody>
    </table>
  </div>
}

function Section({ title, tag, children }: { title: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return <section className="mt-7 break-inside-avoid-page print:mt-5"><h2 className="mb-2.5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-gray-600">{title}{tag}</h2>{children}</section>
}

/** Requirements a learner still needs, for paper: the code when there is one, else the title. */
function FrameworkTable({ framework }: { framework: GroupReportIncludedFramework }) {
  return <Table cols={3} head={['Learner', 'Met', 'Still needs']} empty={framework.learners.length ? null : 'No one in this group is on this framework.'}>
    {framework.learners.map((learner) => <tr key={learner.id} className="border-b border-gray-50 align-top last:border-0">
      <td className="whitespace-nowrap px-3 py-2 font-bold text-gray-900">{personName(learner)}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{learner.met} of {learner.total}</td>
      <td className="px-3 py-2">{learner.still_needs.length ? <span className="flex flex-wrap gap-1">{learner.still_needs.map((item) => <Chip key={item.node_uuid} cls={item.state === 'gap' ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}>{item.code || item.title}</Chip>)}</span> : <Chip cls="bg-green-100 text-green-700">All met</Chip>}</td>
    </tr>)}
  </Table>
}

/** The report itself: headline numbers, plans and badges, who's behind and what's left, then any frameworks. Shared by the Reports page and the print page. */
export function ReportBody({ report, orgslug, variant, orgId, token }: { report: Report; orgslug: string; variant: 'screen' | 'print'; orgId?: number; token?: string }) {
  const { summary } = report
  const screen = variant === 'screen'
  const learnerCell = (learner: GroupReportLearner) => screen && learner.username
    ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.user(learner.username))} className="font-bold text-gray-900 underline-offset-2 hover:text-blue-700 hover:underline">{personName(learner)}</Link>
    : <span className="font-bold text-gray-900">{personName(learner)}</span>
  return <>
    <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-white p-5 nice-shadow print:border-gray-300 print:p-3 print:shadow-none">
        <Stat value={`${summary.progress_percent}%`} label="of plan steps done" />
        <Stat value={`${summary.behind_count} of ${summary.learners_on_plans}`} label="learners behind pace" />
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-white p-5 nice-shadow print:border-gray-300 print:p-3 print:shadow-none">
        <Stat value={summary.plan_count} label={`plan${summary.plan_count === 1 ? '' : 's'} in progress`} />
        <Stat value={summary.badges_earned} label={`badge${summary.badges_earned === 1 ? '' : 's'} earned`} />
      </div>
    </div>

    <Section title="Plans and badges">
      <Table cols={6} head={['Plan', 'Learners', 'Average progress', 'Finished', 'Pace', 'Badge']} empty={report.plans.length ? null : 'This group has no plans in progress.'}>
        {report.plans.map((plan) => <tr key={plan.assignment_uuid} className="border-b border-gray-50 last:border-0">
          <td className="px-3 py-2.5">{screen ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(plan.assignment_uuid, 'learners'))} className="font-bold text-gray-900 underline-offset-2 hover:text-blue-700 hover:underline">{plan.template_title}</Link> : <b>{plan.template_title}</b>}
            <span className="ml-1.5 text-[11px] text-gray-500">{plan.version ? `v${plan.version}` : ''}{plan.status === 'paused' ? ' · paused' : ''}</span></td>
          <td className="px-3 py-2.5 tabular-nums">{plan.learner_count}</td>
          <td className="min-w-[150px] px-3 py-2.5"><span className="flex items-center gap-2 tabular-nums"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 print:border print:border-gray-300"><span className="block h-full rounded-full bg-gray-900" style={{ width: `${plan.progress_percent}%` }} /></span>{plan.progress_percent}%</span></td>
          <td className="px-3 py-2.5 tabular-nums">{plan.finished_count}</td>
          <td className="px-3 py-2.5">{plan.behind_count ? <Chip cls="bg-amber-100 text-amber-800">{plan.behind_count} behind</Chip> : <Chip cls="bg-green-100 text-green-700">On pace</Chip>}</td>
          <td className="px-3 py-2.5">{plan.badge ? <Chip cls="bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200"><Award size={13} aria-hidden="true" />{plan.badge.name} · {plan.badge.earned_count} earned</Chip> : <span className="text-gray-400">–</span>}</td>
        </tr>)}
      </Table>
    </Section>

    <Section title="Who's behind and what's left">
      <Table cols={5} head={['Learner', 'Plan', 'Steps done', 'Status', "What's left next"]} empty={report.learners.length ? null : 'Nobody here is on a plan yet.'}>
        {report.learners.map((learner) => <tr key={`${learner.goal_uuid}`} className="border-b border-gray-50 align-top last:border-0">
          <td className="whitespace-nowrap px-3 py-2.5">{learnerCell(learner)}</td>
          <td className="px-3 py-2.5 text-gray-700">{learner.template_title}</td>
          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{learner.done} of {learner.total}</td>
          <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1"><Chip cls={STATUS[learner.status].cls}>{STATUS[learner.status].label}</Chip>{learner.handed_in ? <Chip cls="bg-blue-50 text-blue-700">Handed in</Chip> : null}</span></td>
          <td className="min-w-[200px] px-3 py-2.5 text-[12.5px] text-gray-500">{learner.next_steps.length ? learner.next_steps.join(' → ') : 'Nothing left'}</td>
        </tr>)}
      </Table>
    </Section>

    {report.included_frameworks.length ? <>
      <p className="mt-8 flex items-start gap-2 rounded-xl bg-blue-50/70 p-3 text-[13px] text-blue-900 print:border print:border-gray-300 print:bg-transparent print:text-gray-700"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Requirements reporting is still being worked out. These sections show which mapped requirements each learner has met through their plan steps.</p>
      {report.included_frameworks.map((framework) => <Section key={framework.framework_uuid} title={framework.name} tag={<DraftTag />}>
        <p className="mb-2.5 text-xs text-gray-500">{framework.met_percent}% of this group&rsquo;s {framework.requirement_count} requirements are met. Met means the learner finished a step mapped to it, or staff credited it.{framework.not_enrolled ? ` ${framework.not_enrolled} member${framework.not_enrolled === 1 ? ' isn’t' : 's aren’t'} on any framework yet.` : ''}</p>
        {screen && orgId ? <GroupRequirementsGrid orgslug={orgslug} orgId={orgId} token={token} groupId={report.group.id} framework={framework.framework_uuid} /> : <FrameworkTable framework={framework} />}
      </Section>)}
    </> : null}
  </>
}

function staffOf(memberships: OrgMembership[], userId: number) {
  return memberships.filter((item) => {
    const role = item.role
    if (!item.user || Number(item.user.id) === userId || !role) return false
    return [1, 2].includes(Number(role.id)) || Boolean(role.rights?.dashboard?.action_access)
  }).map((item) => ({ ...item.user!, role: item.role?.name || 'Staff' }))
}

/** Send the report as a card in colleagues' chats. Only people in the organization; the card links to the live report. */
function SendPanel({ report, frameworks, orgId, token, userId, onClose }: { report: Report; frameworks: string[]; orgId: number; token?: string; userId: number; onClose: () => void }) {
  const { data, isLoading } = useSWR(orgId && token ? ['report-recipients', orgId] : null, () => reportsApi.members(orgId, token), { revalidateOnFocus: false })
  const people = React.useMemo(() => staffOf(data?.items || [], userId), [data, userId])
  const { summary } = report
  const [chosen, setChosen] = React.useState<number[]>([])
  const [query, setQuery] = React.useState('')
  const [message, setMessage] = React.useState(`Here is where ${report.group.name} stands this week.${summary.behind_count ? ` ${summary.behind_count} learner${summary.behind_count > 1 ? 's are' : ' is'} behind; the report lists what's left for each.` : ''}`)
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState<string | null>(null)
  const shown = people.filter((person) => personName(person).toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = (id: number) => setChosen(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id])
  const send = async () => {
    setSending(true)
    try {
      const result = await reportsApi.send(orgId, report.group.id, { recipient_user_ids: chosen, message, frameworks }, token)
      const names = result.sent.map((item) => personName(people.find((person) => Number(person.id) === item.user_id)))
      if (!names.length) throw new Error('Their chats aren’t available, so the report wasn’t sent')
      setSent(names.join(', '))
      if (result.skipped.length) toast(`${result.skipped.length} ${result.skipped.length === 1 ? 'person' : 'people'} couldn’t get it in chat`)
    } catch (error: any) {
      toast.error(error?.message || 'The report wasn’t sent')
    } finally {
      setSending(false)
    }
  }
  if (sent) return <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
    <Check size={18} aria-hidden="true" /><span className="min-w-0 flex-1"><b>Report sent</b> to {sent}. They get a card in chat with a link that stays current.</span>
    <button type="button" onClick={onClose} className="h-8 rounded-full bg-white px-3 text-xs font-bold text-gray-900 ring-1 ring-gray-200">Done</button>
  </div>
  return <section aria-label="Send report" className="mb-5 rounded-xl border border-gray-100 bg-white nice-shadow">
    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5"><h2 className="text-base font-black text-gray-900">Send report · preview</h2><button type="button" aria-label="Close preview" onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
    <div className="space-y-4 p-5">
      <div className="rounded-xl bg-gray-100/80 p-4 text-sm">
        <b className="text-gray-900">{report.org.name} · {report.group.name}</b>
        <span className="block text-xs text-gray-500">Progress report · {longDate(report.generated_on)}</span>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-gray-800">
          <li>{summary.learners_on_plans} learner{summary.learners_on_plans === 1 ? '' : 's'} on {summary.plan_count} plan{summary.plan_count === 1 ? '' : 's'}{report.plans.length ? `: ${report.plans.map((plan) => plan.template_title).join(', ')}` : ''}.</li>
          <li>{summary.progress_percent}% of plan steps done. {summary.badges_earned} badge{summary.badges_earned === 1 ? '' : 's'} earned.</li>
          <li>{summary.behind_count ? `${summary.behind_count} behind pace: ${summary.behind_names.join(', ')}.` : 'Nobody is behind pace.'}</li>
          <li>Who&rsquo;s behind and what&rsquo;s left, by learner.</li>
          {report.included_frameworks.map((framework) => <li key={framework.framework_uuid}>Requirements: {framework.name} (draft section)</li>)}
        </ul>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-bold text-gray-900">To <span className="font-normal text-gray-500">(staff in your organization)</span></legend>
        {chosen.length ? <div className="mb-2 flex flex-wrap gap-1.5">{chosen.map((id) => { const person = people.find((item) => Number(item.id) === id); return <button key={id} type="button" onClick={() => toggle(id)} aria-label={`Remove ${personName(person)}`} className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-1 text-xs font-bold text-white">{personName(person)}<X size={12} aria-hidden="true" /></button> })}</div> : null}
        <label className="relative flex items-center"><span className="sr-only">Search staff</span><Search size={14} className="absolute left-2.5 text-gray-400" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff" className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[13px]" /></label>
        <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 p-1">
          {isLoading ? <p className="p-3 text-xs text-gray-500">Loading staff…</p> : shown.length ? shown.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-gray-50">
            <input type="checkbox" checked={chosen.includes(Number(person.id))} onChange={() => toggle(Number(person.id))} />
            <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{personName(person)}</span><span className="shrink-0 text-xs text-gray-500">{person.role}</span>
          </label>) : <p className="p-3 text-xs text-gray-500">No staff match.</p>}
        </div>
      </fieldset>
      <label className="block text-xs font-bold text-gray-900">Message
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm font-normal" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void send()} disabled={!chosen.length || sending} className="inline-flex h-10 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-40">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Send{chosen.length ? ` to ${chosen.length}` : ''}</button>
        <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-sm font-bold text-gray-700 ring-1 ring-gray-200">Cancel</button>
      </div>
    </div>
  </section>
}

/** Insights → Reports: pick a group, optionally include frameworks, see where it stands, then print or send it. */
export default function GroupReport({ orgslug, groupId, frameworks: fromUrl }: { orgslug: string; groupId: number | null; frameworks: string[] }) {
  const { orgId, token, userId, superadmin } = useOrgAndToken()
  // Ticked frameworks show at once; the URL follows so the report can be shared and reloaded.
  const urlKey = fromUrl.join(',')
  const [frameworks, setFrameworks] = React.useState(fromUrl)
  React.useEffect(() => { setFrameworks(urlKey ? urlKey.split(',') : []) }, [urlKey])
  const router = useRouter()
  const canSend = useCanSend(orgId, superadmin)
  const [sending, setSending] = React.useState(false)
  const { data: groups, isLoading: groupsLoading } = useSWR<Group[]>(orgId && token ? ['insights-groups', orgId] : null, async () => {
    const response = await getUserGroups(orgId, token!)
    return Array.isArray(response?.data) ? response.data : []
  }, { revalidateOnFocus: false })
  const selected = groups?.find((group) => group.id === groupId) || groups?.[0]
  const { data: report, error, isLoading } = useGroupReport(orgId, token, selected?.id ?? null, frameworks)
  const go = (id: number, next: string[]) => {
    setFrameworks(next)
    router.replace(getUriWithOrg(orgslug, insightsRoutes.report(id, next)), { scroll: false })
  }
  const toggleFramework = (uuid: string) => selected && go(selected.id, frameworks.includes(uuid) ? frameworks.filter((item) => item !== uuid) : [...frameworks, uuid])

  if (groupsLoading || !groups) return <PageLoader />
  if (!selected) return <div className="px-4 pb-10 pt-6 sm:px-10"><EmptyState icon={<Users size={36} />} title="No groups yet" detail="Reports are by group. Make a group in Threads and assign it a plan to report on it here." /></div>
  const available = report?.frameworks || []
  return <div className="mx-auto max-w-[1300px] px-4 pb-12 pt-6 sm:px-10">
    <p className="mb-4 max-w-[66ch] text-sm text-gray-600">Reports are by group. Pick a group to see where it stands on its plans and badges, who&rsquo;s behind and what&rsquo;s left. Then print it or send it.</p>
    <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-4">
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-gray-900">Group
        <select aria-label="Group" value={selected.id} onChange={(event) => { setSending(false); go(Number(event.target.value), []) }} className="h-10 max-w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold sm:max-w-[320px]">
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      {/* Only a group with frameworks gets the choice; without any it would just say there's nothing to pick. */}
      {available.length ? <fieldset className="min-w-0">
        <legend className="mb-1.5 flex items-center gap-2 text-xs font-bold text-gray-900">Include requirements <DraftTag /></legend>
        <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2">{available.map((framework) => <label key={framework.framework_uuid} className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-700">
          <input type="checkbox" checked={frameworks.includes(framework.framework_uuid)} onChange={() => toggleFramework(framework.framework_uuid)} />{framework.name}
        </label>)}</div>
      </fieldset> : null}
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        <Link href={getUriWithOrg(orgslug, insightsRoutes.reportPrint(selected.id, frameworks))} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50"><Printer size={16} aria-hidden="true" />Print report</Link>
        {canSend ? <button type="button" onClick={() => setSending(true)} disabled={!report} aria-expanded={sending} className="inline-flex h-10 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-40"><Send size={16} aria-hidden="true" />Send report</button> : null}
      </div>
    </div>
    {sending && report ? <SendPanel key={`${report.group.id}:${frameworks.join(',')}`} report={report} frameworks={frameworks} orgId={orgId} token={token} userId={userId} onClose={() => setSending(false)} /> : null}
    {error && !report ? <EmptyState title="This report isn’t available" detail={error?.message || 'You may not staff any of this group’s plans.'} />
      : isLoading && !report ? <PageLoader />
      : report ? <ReportBody report={report} orgslug={orgslug} variant="screen" orgId={orgId} token={token} /> : null}
  </div>
}
