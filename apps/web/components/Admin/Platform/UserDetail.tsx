'use client'
import React, { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useParams, useRouter } from 'next/navigation'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  deletePlatformUser,
  generatePasswordResetLink,
  removePlatformUserMembership,
  setPlatformUserMembership,
  setPlatformUserPassword,
  unlockPlatformUser,
  updatePlatformUser,
} from '@services/platform/platform'
import {
  Card,
  EmptyState,
  StatusBadge,
  UserAvatar,
  OrgLogo,
  formatDate,
  formatDateTime,
} from './shared'
import { useGlobalRoles, useOrgOptions, type GlobalUser, type OrgMembership } from './UsersTable'
import {
  ArrowLeft,
  Buildings,
  Check,
  Copy,
  Key,
  LinkSimple,
  LockSimpleOpen,
  LockSimple,
  SealCheck,
  ShieldStar,
  Trash,
  User,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import PageLoading from '@components/Objects/Loaders/PageLoading'

interface GlobalUserDetail extends GlobalUser {
  bio: string | null
  signup_method: string | null
  email_verified_at: string | null
  failed_login_attempts: number
  locked_until: string | null
  last_login_ip: string | null
}

export default function UserDetail() {
  const params = useParams()
  const router = useRouter()
  const userId = Number(params.userId)
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const sessionUserId = session?.data?.user?.id
  const isSelf = sessionUserId === userId

  const { data: user, isLoading, mutate } = useSWR<GlobalUserDetail>(
    accessToken ? `${getAPIUrl()}superadmin/users/${userId}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  if (isLoading) return <PageLoading />
  if (!user) {
    return (
      <EmptyState icon={<User size={40} weight="fill" />} message="User not found" />
    )
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
  const backHref = getUriWithOrg(org?.slug, '/admin/platform/users')

  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4"
      >
        <ArrowLeft size={14} weight="bold" />
        Back to Users
      </Link>

      {/* Identity header */}
      <div className="flex items-center gap-4 mb-6">
        <UserAvatar userUuid={user.user_uuid} avatarImage={user.avatar_image} size={56} />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{user.username}</h1>
            {user.is_superadmin && (
              <StatusBadge tone="amber">
                <ShieldStar size={11} weight="fill" />
                Superadmin
              </StatusBadge>
            )}
            {!user.email_verified && (
              <StatusBadge tone="amber">
                <WarningCircle size={11} weight="bold" />
                Email unverified
              </StatusBadge>
            )}
            {user.is_locked && (
              <StatusBadge tone="red">
                <LockSimple size={11} weight="bold" />
                Locked
              </StatusBadge>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {fullName && <span className="mr-2">{fullName}</span>}
            <span className="text-gray-400">{user.email}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left: profile + security + activity */}
        <div className="lg:col-span-2 space-y-5">
          <ProfileCard user={user} accessToken={accessToken} isSelf={isSelf} onSaved={mutate} />
          <MembershipsCard user={user} accessToken={accessToken} onChanged={mutate} />
          <ActivityCard userId={userId} accessToken={accessToken} />
        </div>

        {/* Right: security state + actions */}
        <div className="space-y-5">
          <ActionsCard
            user={user}
            accessToken={accessToken}
            isSelf={isSelf}
            onChanged={mutate}
            onDeleted={() => router.push(backHref)}
          />
          <SecurityCard user={user} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Profile
// ============================================================================

function ProfileCard({
  user,
  accessToken,
  isSelf,
  onSaved,
}: {
  user: GlobalUserDetail
  accessToken: string
  isSelf: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    username: user.username,
    email: user.email,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
  })

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async () => {
    setBusy(true)
    const changes: Record<string, string> = {}
    if (form.username !== user.username) changes.username = form.username.trim()
    if (form.email !== user.email) changes.email = form.email.trim()
    if (form.first_name !== (user.first_name || '')) changes.first_name = form.first_name.trim()
    if (form.last_name !== (user.last_name || '')) changes.last_name = form.last_name.trim()

    if (Object.keys(changes).length === 0) {
      setEditing(false)
      setBusy(false)
      return
    }
    const res = await updatePlatformUser(user.id, changes, accessToken)
    setBusy(false)
    if (res.status === 200) {
      toast.success('Profile updated')
      if (changes.email) {
        toast('Email changed — verification status was reset', { icon: '⚠️' })
      }
      setEditing(false)
      onSaved()
    } else {
      toast.error(res.data?.detail || 'Failed to update profile')
    }
  }

  const inputClass =
    'mt-1 w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400'

  return (
    <Card
      title="Profile"
      action={
        editing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(false)
                setForm({
                  username: user.username,
                  email: user.email,
                  first_name: user.first_name || '',
                  last_name: user.last_name || '',
                })
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="text-xs font-medium bg-gray-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-gray-700 disabled:opacity-40"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            Edit
          </button>
        )
      }
    >
      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-gray-600">
            Username
            <input value={form.username} onChange={set('username')} className={inputClass} />
          </label>
          <label className="block text-sm text-gray-600">
            Email
            <input type="email" value={form.email} onChange={set('email')} className={inputClass} />
            {form.email !== user.email && (
              <p className="text-[11px] text-amber-600 mt-1">
                Changing the email resets its verification status.
              </p>
            )}
          </label>
          <label className="block text-sm text-gray-600">
            First name
            <input value={form.first_name} onChange={set('first_name')} className={inputClass} />
          </label>
          <label className="block text-sm text-gray-600">
            Last name
            <input value={form.last_name} onChange={set('last_name')} className={inputClass} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <InfoRow label="Username" value={user.username} />
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="First name" value={user.first_name || '—'} />
          <InfoRow label="Last name" value={user.last_name || '—'} />
          <InfoRow label="UUID" value={user.user_uuid} mono />
          <InfoRow label="Signup method" value={user.signup_method || '—'} />
        </div>
      )}
      {isSelf && (
        <p className="text-[11px] text-gray-400 mt-3">
          This is your own account — destructive actions are disabled.
        </p>
      )}
    </Card>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-sm text-gray-800 mt-0.5 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}

// ============================================================================
// Security state
// ============================================================================

function SecurityCard({ user }: { user: GlobalUserDetail }) {
  return (
    <Card title="Security">
      <div className="space-y-3">
        <InfoRow label="Created" value={formatDateTime(user.creation_date)} />
        <InfoRow label="Updated" value={formatDateTime(user.update_date)} />
        <InfoRow label="Last login" value={formatDateTime(user.last_login_at)} />
        <InfoRow label="Last login IP" value={user.last_login_ip || '—'} mono />
        <InfoRow
          label="Failed login attempts"
          value={String(user.failed_login_attempts)}
        />
        {user.locked_until && (
          <InfoRow label="Locked until" value={formatDateTime(user.locked_until)} />
        )}
        <InfoRow
          label="Email verified"
          value={
            user.email_verified
              ? `Yes${user.email_verified_at ? ` (${formatDate(user.email_verified_at)})` : ''}`
              : 'No'
          }
        />
      </div>
    </Card>
  )
}

// ============================================================================
// Actions
// ============================================================================

function ActionsCard({
  user,
  accessToken,
  isSelf,
  onChanged,
  onDeleted,
}: {
  user: GlobalUserDetail
  accessToken: string
  isSelf: boolean
  onChanged: () => void
  onDeleted: () => void
}) {
  const [resetLink, setResetLink] = useState<{ reset_url: string; expires_at: string } | null>(null)
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<any>, successMessage: string) => {
    setBusy(key)
    const res = await fn()
    setBusy(null)
    if (res.status === 200) {
      toast.success(successMessage)
      onChanged()
      return res
    }
    const detail = res.data?.detail
    toast.error(typeof detail === 'string' ? detail : detail?.message || 'Action failed')
    return null
  }

  const generateLink = async () => {
    setBusy('reset-link')
    const res = await generatePasswordResetLink(user.id, null, accessToken)
    setBusy(null)
    if (res.status === 200) {
      setResetLink(res.data)
    } else {
      toast.error(res.data?.detail || 'Failed to generate reset link')
    }
  }

  const actionButton =
    'w-full flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'

  return (
    <Card title="Actions">
      <div className="space-y-2">
        <button onClick={generateLink} disabled={busy !== null} className={actionButton}>
          <LinkSimple size={15} className="text-gray-400 shrink-0" />
          {busy === 'reset-link' ? 'Generating...' : 'Generate password reset link'}
        </button>
        <button
          onClick={() => setShowSetPassword(true)}
          disabled={busy !== null}
          className={actionButton}
        >
          <Key size={15} className="text-gray-400 shrink-0" />
          Set password directly
        </button>
        {user.is_locked && (
          <button
            onClick={() =>
              run('unlock', () => unlockPlatformUser(user.id, accessToken), 'Account unlocked')
            }
            disabled={busy !== null}
            className={actionButton}
          >
            <LockSimpleOpen size={15} className="text-gray-400 shrink-0" />
            {busy === 'unlock' ? 'Unlocking...' : 'Unlock account'}
          </button>
        )}
        {!user.email_verified && (
          <button
            onClick={() =>
              run(
                'verify',
                () => updatePlatformUser(user.id, { email_verified: true }, accessToken),
                'Email marked as verified'
              )
            }
            disabled={busy !== null}
            className={actionButton}
          >
            <SealCheck size={15} className="text-gray-400 shrink-0" />
            {busy === 'verify' ? 'Verifying...' : 'Mark email as verified'}
          </button>
        )}
        <button
          onClick={() =>
            run(
              'superadmin',
              () =>
                updatePlatformUser(
                  user.id,
                  { is_superadmin: !user.is_superadmin },
                  accessToken
                ),
              user.is_superadmin ? 'Superadmin access removed' : 'Superadmin access granted'
            )
          }
          disabled={busy !== null || (isSelf && user.is_superadmin)}
          title={
            isSelf && user.is_superadmin
              ? 'You cannot remove your own superadmin access'
              : undefined
          }
          className={actionButton}
        >
          <ShieldStar size={15} className="text-amber-500 shrink-0" />
          {busy === 'superadmin'
            ? 'Saving...'
            : user.is_superadmin
              ? 'Remove superadmin access'
              : 'Grant superadmin access'}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={busy !== null || isSelf}
          title={isSelf ? 'You cannot delete your own account' : undefined}
          className={`${actionButton} text-red-600 hover:bg-red-50 hover:border-red-200`}
        >
          <Trash size={15} className="shrink-0" />
          Delete user
        </button>
      </div>

      {resetLink && (
        <ResetLinkModal link={resetLink} onClose={() => setResetLink(null)} />
      )}
      {showSetPassword && (
        <SetPasswordModal
          userId={user.id}
          username={user.username}
          accessToken={accessToken}
          onClose={() => setShowSetPassword(false)}
          onDone={() => {
            setShowSetPassword(false)
            onChanged()
          }}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {user.username}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the account, its org memberships, and all
              associated data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setConfirmDelete(false)
                const res = await deletePlatformUser(user.id, accessToken)
                if (res.status === 200) {
                  toast.success('User deleted')
                  onDeleted()
                } else {
                  toast.error(res.data?.detail || 'Failed to delete user')
                }
              }}
              className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-500"
            >
              Delete user
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-xs break-all select-all">
        {value}
      </code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
        aria-label="Copy"
      >
        {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

function ResetLinkModal({
  link,
  onClose,
}: {
  link: { reset_url: string; expires_at: string }
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Password reset link</DialogTitle>
          <DialogDescription>
            Share this link with the user through a channel you trust. It can be used
            once and expires {formatDateTime(link.expires_at)}.
          </DialogDescription>
        </DialogHeader>
        <CopyField value={link.reset_url} />
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-700"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)]
  let pw = pick(upper) + pick(lower) + pick(digits) + pick(special)
  for (let i = 0; i < 10; i++) pw += pick(all)
  return pw
}

function SetPasswordModal({
  userId,
  username,
  accessToken,
  onClose,
  onDone,
}: {
  userId: number
  username: string
  accessToken: string
  onClose: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState(generatePassword())
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const res = await setPlatformUserPassword(userId, password, accessToken)
    setBusy(false)
    if (res.status === 200) {
      toast.success('Password updated')
      onDone()
    } else {
      const detail = res.data?.detail
      toast.error(
        typeof detail === 'string' ? detail : detail?.message || 'Failed to set password'
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set password for {username}</DialogTitle>
          <DialogDescription>
            Copy the password before saving — it is not shown again. Also clears any
            login lockout. Prefer the reset link when possible so you never handle the
            user's credentials.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <CopyField value={password} />
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPassword(generatePassword())}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Regenerate
            </button>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-gray-400"
              aria-label="Password"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || password.length < 8}
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
          >
            {busy ? 'Saving...' : 'Set password'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Memberships
// ============================================================================

function MembershipsCard({
  user,
  accessToken,
  onChanged,
}: {
  user: GlobalUserDetail
  accessToken: string
  onChanged: () => void
}) {
  const roles = useGlobalRoles(accessToken)
  const orgs = useOrgOptions(accessToken)
  const [busyOrgId, setBusyOrgId] = useState<number | null>(null)
  const [addOrgId, setAddOrgId] = useState('')
  const [addRoleId, setAddRoleId] = useState('4')

  const memberOrgIds = new Set(user.orgs.map((m) => m.id))
  const availableOrgs = orgs.filter((o) => !memberOrgIds.has(o.id))

  const changeRole = async (membership: OrgMembership, roleId: number) => {
    setBusyOrgId(membership.id)
    const res = await setPlatformUserMembership(user.id, membership.id, roleId, accessToken)
    setBusyOrgId(null)
    if (res.status === 200) {
      toast.success(`Role updated in ${membership.name}`)
      onChanged()
    } else {
      toast.error(res.data?.detail || 'Failed to update role')
    }
  }

  const removeMembership = async (membership: OrgMembership) => {
    setBusyOrgId(membership.id)
    const res = await removePlatformUserMembership(user.id, membership.id, accessToken)
    setBusyOrgId(null)
    if (res.status === 200) {
      toast.success(`Removed from ${membership.name}`)
      onChanged()
    } else {
      toast.error(res.data?.detail || 'Failed to remove membership')
    }
  }

  const addMembership = async () => {
    const orgId = Number(addOrgId)
    setBusyOrgId(orgId)
    const res = await setPlatformUserMembership(user.id, orgId, Number(addRoleId), accessToken)
    setBusyOrgId(null)
    if (res.status === 200) {
      toast.success('Added to organization')
      setAddOrgId('')
      onChanged()
    } else {
      toast.error(res.data?.detail || 'Failed to add membership')
    }
  }

  return (
    <Card title={`Organizations (${user.orgs.length})`}>
      {user.orgs.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">Not a member of any organization.</p>
      ) : (
        <div className="divide-y divide-gray-50 -mt-1 mb-3">
          {user.orgs.map((membership) => (
            <div key={membership.id} className="flex items-center gap-3 py-2.5">
              <OrgLogo orgUuid={membership.org_uuid} logoImage={membership.logo_image} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {membership.name}
                </p>
                <p className="text-xs text-gray-400 font-mono">{membership.slug}</p>
              </div>
              <select
                value={membership.role_id}
                disabled={busyOrgId === membership.id}
                onChange={(e) => changeRole(membership, Number(e.target.value))}
                className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-gray-400 disabled:opacity-40"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeMembership(membership)}
                disabled={busyOrgId === membership.id}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                title="Remove from organization"
              >
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add to org */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <Buildings size={14} className="text-gray-300 shrink-0" />
        <select
          value={addOrgId}
          onChange={(e) => setAddOrgId(e.target.value)}
          className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-gray-400"
        >
          <option value="">Add to organization...</option>
          {availableOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.slug})
            </option>
          ))}
        </select>
        <select
          value={addRoleId}
          onChange={(e) => setAddRoleId(e.target.value)}
          disabled={!addOrgId}
          className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-gray-400 disabled:opacity-40"
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <button
          onClick={addMembership}
          disabled={!addOrgId || busyOrgId !== null}
          className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-gray-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </Card>
  )
}

// ============================================================================
// Activity (audit logs)
// ============================================================================

function ActivityCard({ userId, accessToken }: { userId: number; accessToken: string }) {
  const [offset, setOffset] = useState(0)
  const limit = 10
  const { data } = useSWR(
    accessToken
      ? `${getAPIUrl()}superadmin/users/${userId}/audit-logs?offset=${offset}&limit=${limit}`
      : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const items = data?.items || []
  const total = data?.total ?? 0

  return (
    <Card title="Recent activity">
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No recorded activity.</p>
      ) : (
        <div className="divide-y divide-gray-50 -my-1">
          {items.map((log: any) => (
            <div key={log.id} className="py-2 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-mono text-gray-600 truncate">{log.action}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {formatDateTime(log.created_at)}
                  {log.ip_address ? ` · ${log.ip_address}` : ''}
                </p>
              </div>
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  log.status_code < 400 ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {log.status_code}
              </span>
            </div>
          ))}
        </div>
      )}
      {total > limit && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30"
          >
            Newer
          </button>
          <span className="text-[11px] text-gray-400">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30"
          >
            Older
          </button>
        </div>
      )}
    </Card>
  )
}
