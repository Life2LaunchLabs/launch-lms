'use client'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import React, { useState } from 'react'
import { AlertTriangle, CheckCircle, Loader2, Mail, UserPlus, X } from 'lucide-react'
import { useOrg, useOrgMembership } from '@components/Contexts/OrgContext'
import UserAvatar from '@components/Objects/UserAvatar'
import OpenSignUpComponent from './OpenSignup'
import InviteOnlySignUpComponent from './InviteOnlySignUp'
import { useRouter, useSearchParams } from 'next/navigation'
import { joinOrg } from '@services/organizations/orgs'
import { getUriWithOrg } from '@services/config/config'
import { useTranslation } from 'react-i18next'
import AuthLayout from '@components/Auth/AuthLayout'
import AskToJoin from './AskToJoin'
import InviteCard, { usePrefillInvitedEmail, useInvitePreview } from './InviteCard'
import type { InvitePreview } from '@services/organizations/invites'

interface SignUpClientProps {
  org: any
}

function SignUpClient(props: SignUpClientProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const searchParams = useSearchParams()
  const inviteCodeParam = searchParams.get('inviteCode')
  const invitationParam = searchParams.get('invitation')
  const config = props.org?.config?.config
  const joinMethod = config?.signup_mode || 'open'
  const inviteCode = inviteCodeParam || ''
  const invitationToken = invitationParam || ''
  const preview = useInvitePreview(props.org?.id, invitationToken, inviteCode)
  usePrefillInvitedEmail(preview)
  const card = preview ? <InviteCard preview={preview} /> : null

  return (
    <AuthLayout org={props.org} welcomeText={t('auth.invited_to_join')}>
      <>
          {joinMethod == 'open' &&
            (session.status == 'authenticated' ? (
              <LoggedInJoinScreen inviteCode={inviteCode} invitationToken={invitationToken} org={props.org} preview={preview} />
            ) : (
              <div className="flex-1 flex flex-row">
                <OpenSignUpComponent header={card} />
              </div>
            ))}
          {joinMethod == 'inviteOnly' &&
            (inviteCode || invitationToken ? (
              session.status == 'authenticated' ? (
                <LoggedInJoinScreen inviteCode={inviteCode} invitationToken={invitationToken} org={props.org} preview={preview} />
              ) : (
                <div className="flex-1 flex flex-row">
                  <InviteOnlySignUpComponent inviteCode={inviteCode} invitationToken={invitationToken} header={card} />
                </div>
              )
            ) : (
              <NoTokenScreen org={props.org} />
            ))}
      </>
    </AuthLayout>
  )
}

interface JoinScreenProps {
  inviteCode: string
  invitationToken: string
  org: any
  preview: InvitePreview | null
}

const LoggedInJoinScreen = ({ inviteCode, invitationToken, org, preview }: JoinScreenProps) => {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const contextOrg = useOrg() as any
  const { isUserPartOfTheOrg } = useOrgMembership()
  const activeOrg = contextOrg || org
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showMessage, setShowMessage] = useState(false)
  const router = useRouter()

  const join = async () => {
    setIsSubmitting(true)
    setError('')
    setSuccess('')
    setShowMessage(false)

    const res = await joinOrg(
      {
        org_id: activeOrg.id,
        user_id: session?.data?.user?.user_uuid,
        ...(inviteCode ? { invite_code: inviteCode } : {}),
        ...(invitationToken ? { invitation_token: invitationToken } : {}),
      },
      null,
      session.data?.tokens?.access_token
    )

    if (res.success) {
      await session?.update?.(true)
      setSuccess(typeof res.data === 'string' ? res.data : t('auth.join_organization_success'))
      setShowMessage(true)
      setTimeout(() => {
        router.push(getUriWithOrg(activeOrg.slug, '/'))
      }, 2000)
    } else {
      const detail = res.data?.detail
      if (typeof detail === 'string' && detail === 'User is already part of that organization') {
        await session?.update?.(true)
        setSuccess(t('auth.join_organization_success'))
        setShowMessage(true)
        setTimeout(() => {
          router.push(getUriWithOrg(activeOrg.slug, '/'))
        }, 1500)
        setIsSubmitting(false)
        return
      }

      let errorMsg = t('common.something_went_wrong')
      if (typeof detail === 'string') {
        errorMsg = detail
      } else if (Array.isArray(detail) && detail.length > 0) {
        errorMsg = detail[0]?.msg || t('common.something_went_wrong')
      }
      setError(errorMsg)
      setShowMessage(true)
    }
    setIsSubmitting(false)
  }

  if (isUserPartOfTheOrg) {
    return (
      <div className="flex-1 flex flex-row">
        <div className="m-auto w-full max-w-sm px-6 py-8 sm:py-0">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t('auth.join_organization')}</h1>
            <p className="text-gray-500 mt-1">{t('auth.join_organization_desc')}</p>
          </div>

          <div className="bg-white rounded-xl p-6 nice-shadow">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                <CheckCircle size={28} />
              </div>

              <div>
                <p className="font-semibold text-gray-900">{t('auth.join_organization_success')}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {t('auth.joining')} {activeOrg?.name}
                </p>
              </div>

              <button
                onClick={() => router.push(getUriWithOrg(activeOrg.slug, '/'))}
                className="w-full bg-black text-white font-semibold text-center py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                {t('common.home')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Message Top Bar */}
      {showMessage && (error || success) && (
        <div className={`
          w-full px-4 py-3 flex items-center justify-between gap-3 animate-in slide-in-from-top duration-200
          ${error ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}
        `}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {error ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle size={18} className="shrink-0" />}
            <span className="text-sm font-medium">{error || success}</span>
          </div>
          <button
            onClick={() => setShowMessage(false)}
            className="p-1 hover:bg-white/20 rounded transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-row">
        <div className="m-auto w-full max-w-sm px-6 py-8 sm:py-0">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t('auth.join_organization')}</h1>
            <p className="text-gray-500 mt-1">{t('auth.join_organization_desc')}</p>
          </div>

          {preview && <InviteCard preview={preview} signedInEmail={session.data?.user?.email} />}
          {/* Join Card */}
          <div className="bg-white rounded-xl p-6 nice-shadow">
            <div className="flex flex-col items-center gap-6">
              {/* User Info */}
              <div className="flex items-center gap-3">
                <UserAvatar rounded="rounded-xl" border="border-2" width={48} />
                <div>
                  <p className="font-medium text-gray-900">{session.data?.user?.first_name} {session.data?.user?.last_name}</p>
                  <p className="text-sm text-gray-500">@{session.data?.user?.username}</p>
                </div>
              </div>

              {/* Organization Info */}
              <div className="w-full text-center py-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('auth.joining')}</p>
                <p className="font-semibold text-gray-900 text-lg">{activeOrg?.name}</p>
              </div>

              <button
                onClick={join}
                disabled={isSubmitting}
                className="w-full bg-black text-white font-semibold text-center py-2.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <UserPlus size={18} />
                    {t('auth.join_organization')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

interface NoTokenScreenProps {
  org: any
}

const NoTokenScreen = ({ org }: NoTokenScreenProps) => {
  const { t } = useTranslation()
  const contextOrg = useOrg() as any
  const activeOrg = contextOrg || org

  return (
    <div className="flex-1 flex flex-row">
      <div className="m-auto w-full max-w-sm px-6 py-8 text-center sm:py-0">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Mail size={22} /></div>
        <h1 className="mt-5 text-2xl font-bold text-gray-900">{t('auth.invite_required')}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">Ask an administrator of {activeOrg?.name} to send an invitation to your email address, then use the link in that message.</p>
        {activeOrg?.id ? <AskToJoin org={activeOrg} /> : null}
      </div>
    </div>
  )
}

export default SignUpClient
