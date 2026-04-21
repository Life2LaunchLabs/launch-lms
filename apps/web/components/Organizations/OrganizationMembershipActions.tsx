'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowUpRight, Loader2, LogIn, LogOut, Lock } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getDefaultOrg, getUriWithOrg } from '@services/config/config'
import {
  DiscoverOrganization,
  joinOrg,
  leaveOrg,
} from '@services/organizations/orgs'

interface OrganizationMembershipActionsProps {
  organization: DiscoverOrganization
  currentOrgslug: string
  compact?: boolean
  showOpen?: boolean
}

export default function OrganizationMembershipActions({
  organization,
  currentOrgslug,
  compact = false,
  showOpen = true,
}: OrganizationMembershipActionsProps) {
  const session = useLHSession() as any
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const isAuthenticated = session?.status === 'authenticated'
  const accessToken = session?.data?.tokens?.access_token
  const userId = session?.data?.user?.id
  const canJoin = organization.signup_mode === 'open'
  const isOwnerOrg = organization.slug === getDefaultOrg()

  async function refreshOrganizationState() {
    await Promise.all([
      mutate((key) => typeof key === 'string' && key.includes('/orgs/discover')),
      mutate(`${getAPIUrl()}orgs/user/page/1/limit/10`),
      router.refresh(),
    ])
  }

  async function handleJoin() {
    if (!accessToken || !userId) return

    setIsLoading(true)
    try {
      const res = await joinOrg(
        {
          org_id: organization.id,
          user_id: userId,
        },
        null,
        accessToken
      )

      if (res.status >= 400) {
        toast.error(res.data?.detail || 'Failed to join organization')
        return
      }

      toast.success('Joined organization')
      await refreshOrganizationState()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to join organization')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLeave() {
    if (!accessToken) return

    setIsLoading(true)
    try {
      const res = await leaveOrg(organization.id, accessToken)

      if (res.status >= 400) {
        toast.error(res.data?.detail || 'Failed to leave organization')
        return
      }

      toast.success('Left organization')
      await refreshOrganizationState()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to leave organization')
    } finally {
      setIsLoading(false)
    }
  }

  const buttonClass = compact
    ? 'inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors'
    : 'inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors'

  return (
    <div className={`flex ${compact ? 'flex-wrap gap-2' : 'flex-wrap gap-3'}`}>
      {showOpen && (
        <Link
          href={getUriWithOrg(organization.slug, '/')}
          className={`${buttonClass} border border-black/10 bg-white text-black/70 hover:bg-black/[0.03]`}
        >
          <ArrowUpRight className="mr-2 h-4 w-4" />
          Open
        </Link>
      )}

      {!isAuthenticated && (
        <Link
          href={getUriWithOrg(currentOrgslug, '/login')}
          className={`${buttonClass} bg-black text-white hover:bg-black/85`}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign in to join
        </Link>
      )}

      {isAuthenticated && organization.is_member && !isOwnerOrg && (
        <button
          type="button"
          onClick={handleLeave}
          disabled={isLoading}
          className={`${buttonClass} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-70`}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          Leave
        </button>
      )}

      {isAuthenticated && !organization.is_member && canJoin && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={isLoading}
          className={`${buttonClass} bg-black text-white hover:bg-black/85 disabled:opacity-70`}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="mr-2 h-4 w-4" />
          )}
          Join
        </button>
      )}

      {isAuthenticated && !organization.is_member && !canJoin && (
        <div
          className={`${buttonClass} border border-amber-200 bg-amber-50 text-amber-700`}
        >
          <Lock className="mr-2 h-4 w-4" />
          Invite only
        </div>
      )}
    </div>
  )
}
