'use client'

import Link from 'next/link'
import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Award, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Flag, Layers3, Loader2, Mail, Plus, Shield, UserRound, Users } from 'lucide-react'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { UserAvatar } from '@components/Admin/Platform/shared'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { conferLearningBadge, getLearningBadgeCollections, gradeLearningResponse } from '@services/learning/learning'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'
import { ActivityAggregateGradeForm } from '@components/Admin/Programs/CohortProgramAdmin'
import ProgramAssignmentModal from '@components/Admin/Programs/ProgramAssignmentModal'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

type UserSubpage = 'overview' | 'assignments' | 'review'

export default function OrgUserDetail({ username, orgslug, activeSubpage = 'overview' }: { username: string; orgslug: string; activeSubpage?: UserSubpage }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const query = new URLSearchParams({ page: '1', limit: '20', search: username }).toString()
  const { data, isLoading } = useSWR(
    org?.id && accessToken ? `${getAPIUrl()}orgs/${org.id}/users?${query}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const membership = data?.items?.find((item: any) => item.user?.username === username)
  const user = membership?.user

  if (isLoading) return <PageLoading />

  return (
    <div className="flex h-full w-full flex-col bg-[#f8f8f8]">
      {user ? <div className="relative z-10 bg-[#fcfbfc] px-10 tracking-tight nice-shadow"><div className="pb-4 pt-6"><Breadcrumbs items={[{ label: 'Users', href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()) }, { label: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username }]} /></div><div className="flex items-center gap-4 pb-5"><UserAvatar userUuid={user.user_uuid} avatarImage={user.avatar_image} size={56} /><div><h1 className="text-2xl font-black text-gray-950">{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}</h1><p className="text-sm text-gray-500">@{user.username}</p></div></div><nav className="flex space-x-1 text-sm font-black">{[
        { id: 'overview', label: 'Overview', icon: Users },
        { id: 'assignments', label: 'Assignments', icon: Layers3 },
        { id: 'review', label: 'Review', icon: ClipboardCheck },
      ].map((tab: any) => { const Icon = tab.icon; return <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(username, tab.id))} className={cn('flex items-center gap-2 border-black px-3 py-2 transition', activeSubpage === tab.id ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><Icon size={16} />{tab.label}</Link> })}</nav></div> : null}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {!user ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center nice-shadow">
            <UserRound className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-semibold text-gray-700">User not found in this organization</p>
          </div>
        ) : (
          <div className="space-y-5">
            {activeSubpage === 'overview' ? <>
            <section className="grid gap-4 md:grid-cols-2">
              <DetailCard icon={<Mail size={17} />} label="Email" value={user.email || '—'} />
              <DetailCard icon={<Shield size={17} />} label="Organization role" value={membership.role?.name || '—'} />
              <DetailCard icon={<CalendarDays size={17} />} label="Joined" value={formatDate(membership.joined_at)} />
              <DetailCard icon={<CalendarDays size={17} />} label="Last login" value={formatDate(user.last_login_at)} />
            </section>
            <IssueBadgePanel user={user} orgId={Number(org.id)} accessToken={accessToken} />
            </> : null}
            {activeSubpage === 'assignments' ? <UserProgramsPanel userId={user.id} orgId={Number(org.id)} orgslug={orgslug} accessToken={accessToken} /> : null}
            {activeSubpage === 'review' ? <UserReviewPanel user={user} orgId={Number(org.id)} accessToken={accessToken} /> : null}
          </div>
        )}
      </main>
    </div>
  )
}

function UserProgramsPanel({ userId, orgId, orgslug, accessToken }: { userId: number; orgId: number; orgslug: string; accessToken?: string }) {
  const userProgramsKey = orgId && accessToken ? `${getAPIUrl()}planning/managed-users/${userId}?org_id=${orgId}` : null
  const { data, mutate: refreshUserPrograms } = useSWR(
    userProgramsKey,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const programs = data?.programs || []
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <div className="flex items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Layers3 size={17} />Plan assignments</h2><p className="mt-1 text-xs text-gray-500">Active plans assigned directly or through a group.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-500">{programs.length} active</span><ProgramAssignmentModal initialUserIds={[userId]} onAssigned={refreshUserPrograms} trigger={<button className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-white"><Plus size={14} />Assign a plan</button>} /></div></div>
      {programs.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{programs.map((program: any) => {
        const href = getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(program.assignment_uuid)) + `?focusUser=${userId}`
        return <Link key={program.participant_uuid} href={href} className="group rounded-lg border border-gray-200 p-4 transition hover:border-blue-300"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-gray-900 group-hover:text-blue-700">{program.program_name}</p><p className="mt-1 text-xs text-gray-500">{program.cohort?.name || 'Direct invitation'} · {String(program.invitation_status).replaceAll('_', ' ')}</p></div><ChevronRight size={16} className="text-gray-300 group-hover:text-blue-600" /></div><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${program.progress_percent}%` }} /></div><span className="text-[10px] font-black text-gray-500">{program.progress_percent}%</span></div></Link>
      })}</div> : <div className="mt-4 rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs font-semibold text-gray-400">No active plan assignments yet.</div>}
    </section>
  )
}

function UserReviewPanel({ user, orgId, accessToken }: { user: any; orgId: number; accessToken?: string }) {
  const queueKey = orgId && accessToken ? `user-review:${orgId}:${user.id}` : null
  const { data: reviewData, isLoading } = useSWR(queueKey, async () => {
    const overview = await programsApi.user(orgId, user.id, accessToken)
    const assignments = overview?.programs || []
    const results = await Promise.allSettled(assignments.map(async (assignment: any) => {
      const queue = await programsApi.reviews(orgId, assignment.assignment_uuid, accessToken)
      return {
        objectives: (queue.objective_reviews || []).filter((item: any) => Number(item.user?.id) === Number(user.id)).map((item: any) => ({ ...item, assignment })),
        activities: (queue.activity_reviews || []).filter((item: any) => Number(item.user?.id) === Number(user.id)).map((item: any) => ({ ...item, assignment })),
      }
    }))
    return results.reduce((output: any, result: any) => {
      if (result.status === 'fulfilled') {
        output.objectives.push(...result.value.objectives)
        output.activities.push(...result.value.activities)
      }
      return output
    }, { objectives: [], activities: [] })
  }, { revalidateOnFocus: false })
  const reviews = reviewData?.objectives || []
  const activityReviews = reviewData?.activities || []
  const [active, setActive] = React.useState<any>(null)
  const [message, setMessage] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [questionScores, setQuestionScores] = React.useState<Record<string, string>>({})
  const decide = async (action: 'confirm' | 'flag') => {
    if (!active || saving || (action === 'flag' && !message.trim())) return
    setSaving(true)
    try {
      await programsApi.reviewObjective(orgId, active.assignment.assignment_uuid, { objective_uuid: active.objective.objective_uuid, user_id: user.id, action, message }, accessToken)
      if (queueKey) await mutate(queueKey)
      setActive(null); setMessage('')
      toast.success(action === 'confirm' ? 'Objective confirmed.' : 'Feedback sent to learner.')
    } catch (error: any) { toast.error(error?.message || 'Could not review this submission.') } finally { setSaving(false) }
  }
  const openActivity = (item: any) => {
    const scores: Record<string, string> = {}
    ;(item.attempts || []).forEach((attempt: any) => Object.entries(attempt.result?.questions || {}).forEach(([id, result]: any) => { if (result?.grading_status === 'pending') scores[`${attempt.attempt_uuid}:${id}`] = '' }))
    setQuestionScores(scores); setMessage(''); setActive({ ...item, review_type: 'activity' })
  }
  const gradeActivity = async (questionFeedback: Record<string, string>) => {
    if (!active || active.review_type !== 'activity' || saving) return
    if (Object.values(questionScores).some((value) => value === '')) return toast.error('Enter every manual score.')
    setSaving(true)
    try {
      await Promise.all((active.attempts || []).filter((attempt: any) => attempt.result?.grading_status === 'pending').map((attempt: any) => {
        const scores = Object.fromEntries(Object.entries(questionScores).filter(([key]) => key.startsWith(`${attempt.attempt_uuid}:`)).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), Number(value)]))
        const total = Object.entries(attempt.result?.questions || {}).reduce((sum: number, [id, result]: any) => sum + (result.grading_status === 'pending' ? Number(scores[id] || 0) : Number(result.score || 0)), 0)
        const notes = Object.fromEntries(Object.entries(questionFeedback).filter(([key, value]) => key.startsWith(`${attempt.attempt_uuid}:`) && value.trim()).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), value.trim()]))
        return gradeLearningResponse(attempt.attempt_uuid, { score: total, question_scores: scores, question_feedback: notes, feedback: message }, accessToken)
      }))
      if (queueKey) await mutate(queueKey)
      setActive(null); setMessage(''); setQuestionScores({})
      toast.success('Activity response graded.')
    } catch (error: any) { toast.error(error?.message || 'Could not save these grades.') } finally { setSaving(false) }
  }
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-400" /></div>
  return <section><div className="mb-5"><h2 className="text-lg font-black text-gray-950">Review actions</h2><p className="mt-1 text-sm text-gray-500">Outstanding submissions for this learner across assignments you can review.</p></div>{reviews.length || activityReviews.length ? <div className="space-y-3">{reviews.map((item: any) => <button key={item.progress_uuid} onClick={() => { setActive(item); setMessage('') }} className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 text-left nice-shadow transition hover:border-blue-300"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ClipboardCheck size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-gray-900">{item.objective.title}</span><span className="mt-1 block text-xs text-gray-500">{item.assignment.program_name}{item.assignment.cohort?.name ? ` · ${item.assignment.cohort.name}` : ''}</span></span><ChevronRight size={17} className="text-gray-300" /></button>)}{activityReviews.map((item: any) => <button key={item.review_id} onClick={() => openActivity(item)} className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 text-left nice-shadow transition hover:border-blue-300"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ClipboardCheck size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-gray-900">{item.badge?.name || 'Badge learning path'}</span><span className="mt-1 block text-xs text-gray-500">{item.activity?.title || 'Learning activity'} · {item.assignment?.program_name}</span></span><ChevronRight size={17} className="text-gray-300" /></button>)}</div> : <div className="rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center"><CheckCircle2 className="mx-auto text-green-500" size={36} /><p className="mt-3 font-black text-gray-800">No reviews waiting</p></div>}<Modal isDialogOpen={Boolean(active)} onOpenChange={(open) => !open && setActive(null)} minHeight="no-min" minWidth="lg" dialogTitle={active?.review_type === 'activity' ? active.activity?.title || 'Grade activity' : active?.objective?.title || 'Review objective'} dialogDescription={active?.review_type === 'activity' ? active.badge?.name || '' : active?.assignment?.program_name || ''} dialogContent={active?.review_type === 'activity' ? <ActivityAggregateGradeForm review={active} scores={questionScores} setScores={setQuestionScores} feedback={message} setFeedback={setMessage} saving={saving} onConfirm={(notes: Record<string, string>) => void gradeActivity(notes)} /> : active ? <div className="space-y-5 p-2">{active.learner_note ? <div className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-800">{active.learner_note}</div> : null}{active.feedback_history?.length ? <div><p className="text-xs font-black uppercase tracking-wide text-gray-400">Previous feedback</p><div className="mt-2 space-y-2">{active.feedback_history.map((entry: any, index: number) => <div key={index} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{entry.message}</div>)}</div></div> : null}<label className="block text-xs font-bold text-gray-600">Note or revision request<textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm" /></label><div className="flex justify-end gap-2"><button onClick={() => void decide('flag')} disabled={saving || !message.trim()} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 disabled:opacity-40"><Flag size={15} />Flag</button><button onClick={() => void decide('confirm')} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-black text-white">{saving ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}Confirm</button></div></div> : <div />} /></section>
}

function IssueBadgePanel({ user, orgId, accessToken }: { user: any; orgId: number; accessToken?: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)
  const [badges, setBadges] = React.useState<any[]>([])
  const [badgeUuid, setBadgeUuid] = React.useState('')

  const loadBadges = React.useCallback(async () => {
    if (!open || !accessToken) return
    setLoading(true)
    try {
      const response = await getLearningBadgeCollections(orgId, accessToken, true)
      const collections = response?.success ? response.data : response
      const available = (Array.isArray(collections) ? collections : [])
        .flatMap((collection: any) => collection.badges || [])
        .filter((badge: any) => badge.status === 'published' && badge.direct_conferral_enabled === true)
      setBadges(available)
      setBadgeUuid((current) => current || available[0]?.badge_uuid || '')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load badges available for issuing.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, open, orgId])

  React.useEffect(() => {
    void loadBadges()
  }, [loadBadges])

  const issueBadge = async () => {
    if (!badgeUuid || issuing) return
    setIssuing(true)
    try {
      await conferLearningBadge({ badge_uuid: badgeUuid, user_id: user.id, issuing_org_id: orgId }, accessToken)
      toast.success(`Badge issued to ${user.username}.`)
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to issue badge.')
    } finally {
      setIssuing(false)
    }
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Badges</h2>
          <p className="mt-1 text-xs text-gray-500">Issue an eligible badge from this organization’s authorized collections.</p>
        </div>
        <Modal
          isDialogOpen={open}
          onOpenChange={setOpen}
          minHeight="no-min"
          minWidth="md"
          dialogTitle={`Issue a badge to ${user.username}`}
          dialogDescription="Only published badges with direct issuance enabled are shown."
          dialogContent={
            <div className="space-y-4 p-2">
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : badges.length ? (
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Badge
                  <select value={badgeUuid} onChange={(event) => setBadgeUuid(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium normal-case text-gray-900">
                    {badges.map((badge) => <option key={badge.badge_uuid} value={badge.badge_uuid}>{badge.name}</option>)}
                  </select>
                </label>
              ) : <p className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">No badges are currently available for direct issuance.</p>}
              <button type="button" onClick={() => void issueBadge()} disabled={!badgeUuid || issuing || loading} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
                {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                Issue badge
              </button>
            </div>
          }
          dialogTrigger={<button type="button" className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white"><Award className="h-4 w-4" />Issue badge</button>}
        />
      </div>
    </section>
  )
}

function DetailCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{icon}{label}</div>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
