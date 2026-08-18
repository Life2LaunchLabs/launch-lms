'use client'

import Link from 'next/link'
import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Award, CalendarDays, ClipboardCheck, Loader2, Mail, Shield, UserRound, Users } from 'lucide-react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { UserAvatar } from '@components/Admin/Platform/shared'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { conferLearningBadge, getLearningBadgeCollections } from '@services/learning/learning'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export default function OrgUserDetail({ username, orgslug }: { username: string; orgslug: string }) {
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
      <AdminFeatureHeader
        feature="Users"
        activeTab="users"
        tabs={[
          { id: 'users', label: 'Users', icon: <Users size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()) },
          { id: 'grading', label: 'Grading', icon: <ClipboardCheck size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.grading()) },
          { id: 'groups', label: 'Groups', href: getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups()) },
          { id: 'roles', label: 'Roles', href: getUriWithOrg(orgslug, routePaths.org.dash.users.roles()) },
          { id: 'signups', label: 'Sign-ups', href: getUriWithOrg(orgslug, routePaths.org.dash.users.signups()) },
          { id: 'new', label: 'Add user', href: getUriWithOrg(orgslug, routePaths.org.dash.users.add()) },
          { id: 'audit-logs', label: 'Audit logs', href: getUriWithOrg(orgslug, routePaths.org.dash.users.auditLogs()) },
        ]}
      />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.users())} className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black">
          <ArrowLeft size={14} />
          Back to users
        </Link>
        {!user ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center nice-shadow">
            <UserRound className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-semibold text-gray-700">User not found in this organization</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
              <UserAvatar userUuid={user.user_uuid} avatarImage={user.avatar_image} size={56} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}</h1>
                <p className="text-sm text-gray-500">@{user.username}</p>
              </div>
            </section>
            <section className="grid gap-4 md:grid-cols-2">
              <DetailCard icon={<Mail size={17} />} label="Email" value={user.email || '—'} />
              <DetailCard icon={<Shield size={17} />} label="Organization role" value={membership.role?.name || '—'} />
              <DetailCard icon={<CalendarDays size={17} />} label="Joined" value={formatDate(membership.joined_at)} />
              <DetailCard icon={<CalendarDays size={17} />} label="Last login" value={formatDate(user.last_login_at)} />
            </section>
            <IssueBadgePanel user={user} orgId={Number(org.id)} accessToken={accessToken} />
          </div>
        )}
      </main>
    </div>
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
    <div className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{icon}{label}</div>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
