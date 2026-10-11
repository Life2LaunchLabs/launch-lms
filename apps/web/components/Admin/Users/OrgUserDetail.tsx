'use client'

import Link from 'next/link'
import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Award, CalendarDays, ChevronRight, ClipboardCheck, Layers3, Loader2, Mail, Plus, Shield, UserRound, Users } from 'lucide-react'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { UserAvatar } from '@components/Admin/Platform/shared'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { conferLearningBadge, getLearningBadgeCollections } from '@services/learning/learning'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { cn } from '@/lib/utils'
import { LearnerGaps, LearnerRequirementTree } from '@components/Admin/Plans/LearnerRequirements'
import ProgramAssignmentModal from '@components/Admin/Programs/ProgramAssignmentModal'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export type UserSubpage = 'overview' | 'plans' | 'requirements'

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
        { id: 'plans', label: 'Plans', icon: Layers3 },
        { id: 'requirements', label: 'Requirements', icon: ClipboardCheck },
      ].map((tab: any) => { const Icon = tab.icon; return <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(username, tab.id))} className={cn('flex items-center gap-2 border-black px-3 py-2 transition', activeSubpage === tab.id ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><Icon size={16} />{tab.label}</Link> })}</nav></div> : null}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {!user ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center nice-shadow">
            <UserRound className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-semibold text-gray-700">User not found in this organization</p>
          </div>
        ) : (
          <div className="space-y-5">
            {activeSubpage === 'overview' ? <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
              <LearnerGaps orgId={Number(org.id)} userId={user.id} token={accessToken} learnerName={[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username} />
              <div className="space-y-5">
                <UserProgramsPanel userId={user.id} orgId={Number(org.id)} orgslug={orgslug} accessToken={accessToken} compact />
                <section className="grid gap-3 rounded-xl border border-gray-100 bg-white p-5 nice-shadow sm:grid-cols-2">
                  <DetailCard icon={<Mail size={15} />} label="Email" value={user.email || '—'} />
                  <DetailCard icon={<Shield size={15} />} label="Organization role" value={membership.role?.name || '—'} />
                  <DetailCard icon={<CalendarDays size={15} />} label="Joined" value={formatDate(membership.joined_at)} />
                  <DetailCard icon={<CalendarDays size={15} />} label="Last login" value={formatDate(user.last_login_at)} />
                </section>
                <IssueBadgePanel user={user} orgId={Number(org.id)} accessToken={accessToken} />
              </div>
            </div> : null}
            {activeSubpage === 'plans' ? <UserProgramsPanel userId={user.id} orgId={Number(org.id)} orgslug={orgslug} accessToken={accessToken} /> : null}
            {activeSubpage === 'requirements' ? <LearnerRequirementTree orgId={Number(org.id)} userId={user.id} token={accessToken} /> : null}
          </div>
        )}
      </main>
    </div>
  )
}

function UserProgramsPanel({ userId, orgId, orgslug, accessToken, compact = false }: { userId: number; orgId: number; orgslug: string; accessToken?: string; compact?: boolean }) {
  const userProgramsKey = orgId && accessToken ? `${getAPIUrl()}planning/managed-users/${userId}?org_id=${orgId}` : null
  const { data, mutate: refreshUserPrograms } = useSWR(
    userProgramsKey,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const programs = data?.programs || []
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <div className="flex items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Layers3 size={17} />Plans</h2><p className="mt-1 text-xs text-gray-500">Templates handed to them directly or through a group. Personal plans stay private unless they share them.</p></div><div className="flex items-center gap-2"><ProgramAssignmentModal initialUserIds={[userId]} onAssigned={refreshUserPrograms} trigger={<button className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-white"><Plus size={14} />Assign a template</button>} /></div></div>
      {programs.length ? <div className={cn('mt-4 grid gap-3', !compact && 'md:grid-cols-2')}>{programs.map((program: any) => {
        const href = getUriWithOrg(orgslug, program.cohort ? routePaths.org.dash.users.groupPlans(program.cohort.id, program.assignment_uuid) : program.plan_uuid ? routePaths.org.dash.livePlan(program.plan_uuid) : routePaths.org.dash.planAssignment(program.assignment_uuid))
        return <Link key={program.participant_uuid} href={href} className="group rounded-lg border border-gray-200 p-4 transition hover:border-blue-300"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-gray-900 group-hover:text-blue-700">{program.program_name}</p><p className="mt-1 text-xs text-gray-500">{program.cohort?.name ? `Through ${program.cohort.name}` : 'Assigned directly'}</p></div><ChevronRight size={16} className="text-gray-300 group-hover:text-blue-600" /></div><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${program.progress_percent}%` }} /></div><span className="text-[10px] font-black text-gray-500">{program.progress_percent}%</span></div></Link>
      })}</div> : <div className="mt-4 rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs font-semibold text-gray-400">No templates handed out to them yet.</div>}
    </section>
  )
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
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{icon}{label}</div>
      <p className="truncate text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
