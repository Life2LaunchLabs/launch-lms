'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Shield } from 'lucide-react'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import VersionReviewModal from '@components/Goals/admin/versions/VersionReviewModal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalAdminApi } from '@services/goals/admin'
import { assignmentApi, assignmentKeys, type AssignmentPerson } from '@services/assignments/assignments'
import { draftToSave, type ScheduleDraft } from '@services/assignments/page'
import Header, { type AssignmentTab } from './Header'
import Sidebar from './Sidebar'
import StepsTab from './StepsTab'
import PeopleTab from './PeopleTab'
import type { PeopleFilter } from '@services/assignments/people'
import MessagesDrawer, { type MessagesTarget } from './MessagesDrawer'

/**
 * One assignment: a plan handed to a group or a person. Steps shows where learners are on each
 * step, with the schedule; People shows each person. Messages open in a drawer on either.
 * The URL carries the tab (?tab=people, with ?filter=), the schedule editor (?schedule=1) and an
 * open thread (?messages=group).
 */
export default function AssignmentPage({ orgslug, assignmentUuid, initialTab = 'steps' }: { orgslug: string; assignmentUuid: string; initialTab?: AssignmentTab }) {
  const { orgId, token } = useStaff()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const ready = Boolean(orgId && token)
  const { data: detail, error, mutate } = useSWR(ready ? assignmentKeys.detail(orgId, assignmentUuid) : null, () => assignmentApi.detail(orgId, assignmentUuid, token))
  const { data: people, mutate: mutatePeople } = useSWR(ready ? assignmentKeys.people(orgId, assignmentUuid) : null, () => assignmentApi.people(orgId, assignmentUuid, token))
  const group = detail?.target.type === 'group'
  const { data: thread } = useSWR(ready && group ? assignmentKeys.thread(orgId, assignmentUuid) : null, () => assignmentApi.thread(orgId, assignmentUuid, token))
  const [versioning, setVersioning] = React.useState(false)

  const tab: AssignmentTab = params.get('tab') === 'people' ? 'people' : params.get('tab') === 'steps' ? 'steps' : initialTab
  const scheduling = params.get('schedule') === '1'
  const messagesParam = params.get('messages')
  const [messages, setMessages] = React.useState<MessagesTarget | null>(null)
  React.useEffect(() => { if (messagesParam === 'group' && group) setMessages({ kind: 'group' }) }, [messagesParam, group])

  const base = getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(assignmentUuid))
  const href = (query: Record<string, string>) => `${base}${Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : ''}`
  const setQuery = (query: Record<string, string>) => router.replace(href(query), { scroll: false })
  const refresh = () => Promise.all([mutate(), mutatePeople()])

  if (error) return <Unavailable message={error.message} back={getUriWithOrg(orgslug, routePaths.org.admin.assignments())} />
  if (!detail) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const run = async (change: () => Promise<unknown>, done: string) => {
    try { await change(); toast.success(done); await refresh(); return true } catch (failure: any) { toast.error(failure?.message || 'That didn’t go through'); return false }
  }
  const learnerOf = (person?: AssignmentPerson | null) => person ? setMessages({ kind: 'learner', person }) : undefined
  const message = () => group ? setMessages({ kind: 'group' }) : detail.target.type === 'person' ? learnerOf(detail.target.person) : undefined
  const ctx = {
    detail, orgId, orgslug, token,
    reviewHref: (stepKey: string) => getUriWithOrg(orgslug, routePaths.org.admin.planReview({ assignment: assignmentUuid, planObjective: stepKey, from: 'assignment' })),
    onMessageStep: (stepKey: string) => group ? setMessages({ kind: 'group', step: stepKey }) : detail.target.type === 'person' && detail.target.person ? setMessages({ kind: 'learner', person: detail.target.person, step: stepKey }) : undefined,
    onMessageLearner: (person: AssignmentPerson) => learnerOf(person),
  }
  const canVersion = detail.can_change_version && detail.status !== 'ended' && Boolean(detail.plan.live_version && detail.plan.live_version !== detail.plan.version)
  const invited = people?.learners.filter((row) => !row.person).length || 0
  const filter = (params.get('filter') || (params.get('needs') ? 'needs' : '')) as PeopleFilter | ''

  return <main className="min-h-full w-full bg-background">
    <Header detail={detail} tab={tab} invited={invited} unread={thread?.unread || 0}
      people={detail.staff.length + (people?.learners.length ?? detail.learner_count)}
      links={{ list: getUriWithOrg(orgslug, routePaths.org.admin.assignments()), plan: getUriWithOrg(orgslug, routePaths.org.admin.template(detail.plan.template_uuid)), tab: (id) => href(id === 'steps' ? {} : { tab: id }) }}
      actions={{
        onMessage: detail.learner_count || group ? message : undefined,
        onSchedule: () => setQuery({ schedule: '1' }),
        onVersion: canVersion ? () => setVersioning(true) : undefined,
        onPause: () => void run(() => goalAdminApi.pause(orgId, assignmentUuid, token), 'Paused. Learners keep their plans and can keep working.'),
        onResume: () => void run(() => goalAdminApi.resume(orgId, assignmentUuid, token), 'Resumed.'),
        onEnd: () => {
          if (!window.confirm(`End ${detail.plan.title} for ${detail.target.name}? Learners keep their plans as they are, and it can’t be resumed.`)) return
          void run(() => goalAdminApi.end(orgId, assignmentUuid, token), 'Ended. It moves to Ended on the list.')
        },
      }} />
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8">
      {tab === 'people' ? <PeopleTab detail={detail} people={people} filter={filter || 'all'} setFilter={(next) => setQuery(next === 'all' ? { tab: 'people' } : { tab: 'people', filter: next })}
        orgId={orgId} token={token} onChanged={refresh} onMessage={learnerOf} />
        : <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <StepsTab ctx={ctx} scheduling={scheduling} setScheduling={(on) => setQuery(on ? { schedule: '1' } : {})}
            onSave={(draft: ScheduleDraft) => run(() => assignmentApi.saveSchedule(orgId, assignmentUuid, draftToSave(draft), token), 'Schedule saved. Learners’ plans moved with it.')} />
          <Sidebar detail={detail} thread={thread} onMessage={message}
            needsHref={(kind) => href({ tab: 'people', filter: kind })}
            otherHref={(uuid) => getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(uuid))} />
        </div>}
    </div>
    {messages ? <MessagesDrawer detail={detail} target={messages} setTarget={setMessages} orgId={orgId} token={token} orgslug={orgslug}
      onClose={() => { setMessages(null); if (messagesParam) router.replace(pathname + (tab === 'people' ? '?tab=people' : ''), { scroll: false }) }} /> : null}
    {versioning ? <VersionReviewModal orgId={orgId} token={token} assignmentUuid={assignmentUuid} open={versioning} onOpenChange={setVersioning} onApplied={async () => { await refresh() }} /> : null}
  </main>
}

function Unavailable({ message, back }: { message?: string; back: string }) {
  return <main className="flex min-h-[70vh] items-center justify-center px-4">
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <Shield className="mx-auto text-muted-foreground" size={38} aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold">Assignment unavailable</h1>
      <p className="mt-1 text-sm text-muted-foreground">{message || 'You need to be staff on this assignment to open it.'}</p>
      <Link href={back} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"><ArrowLeft size={14} />Assignments</Link>
    </div>
  </main>
}
