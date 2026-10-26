'use client'
import React, { useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Clock, Mail } from 'lucide-react'
import { getInvitePreview, InvitePreview } from '@services/organizations/invites'
import { getUserAvatarMediaDirectory } from '@services/media/media'

const ROLE = { learner: 'a learner', staff: 'staff', admin: 'an admin' }
const CLOSED: Record<string, string> = {
  accepted: 'This invitation has already been used.',
  declined: 'This invitation was declined.',
  revoked: 'This invitation was withdrawn.',
  expired: 'This invitation has expired.',
  used_up: 'This join link has been used as many times as it allows.',
}

/** The invitation someone followed: who sent it, to what, as what; and, once it's spent, what to do instead. */
export function useInvitePreview(orgId: number | undefined, invitation: string, inviteCode: string) {
  const token = invitation || inviteCode
  const { data } = useSWR(orgId && token ? ['invite-preview', orgId, token] : null, () => getInvitePreview(orgId as number, { invitation, inviteCode }))
  return data ?? null
}

/** Puts the invited address in the signup form, which reads it from the URL. */
export function usePrefillInvitedEmail(preview: InvitePreview | null) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    if (!preview?.email || preview.status !== 'pending' || searchParams.get('email')) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('email', preview.email)
    router.replace(`${pathname}?${params.toString()}`)
  }, [preview, pathname, router, searchParams])
}

export default function InviteCard({ preview, signedInEmail }: { preview: InvitePreview; signedInEmail?: string }) {
  const { inviter, org } = preview
  const avatar = inviter?.avatar_image
    ? inviter.avatar_image.startsWith('http') ? inviter.avatar_image : getUserAvatarMediaDirectory(inviter.user_uuid, inviter.avatar_image)
    : null
  if (preview.status !== 'pending') {
    return (
      <div className="mb-8 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 ring-1 ring-amber-100">
        <Clock size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{CLOSED[preview.status] ?? CLOSED.expired}</p>
          <p className="mt-0.5 text-amber-800">
            {preview.status === 'accepted'
              ? <>Already have an account? <Link href="/login" className="font-semibold underline">Log in</Link>.</>
              : `Ask ${inviter?.name ?? `an admin of ${org.name}`} to send you a new one.`}
          </p>
        </div>
      </div>
    )
  }
  const mismatch = preview.email && signedInEmail && preview.email.toLowerCase() !== signedInEmail.toLowerCase()
  return (
    <div className="mb-8 rounded-2xl bg-gray-50 px-4 py-4 text-left ring-1 ring-gray-100">
      <div className="flex items-center gap-3">
        {avatar
          ? <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-gray-200"><Mail size={18} /></div>}
        <p className="text-[15px] leading-snug text-gray-700">
          {inviter ? <><b className="text-gray-950">{inviter.name}</b> invited you to join </> : 'You’re invited to join '}<b className="text-gray-950">{org.name}</b>
          {` as ${ROLE[preview.role]}`}{preview.group ? <>, in <b className="text-gray-950">{preview.group}</b></> : null}.
        </p>
      </div>
      {preview.email && (!signedInEmail || mismatch) && (
        <p className={`mt-3 text-sm ${mismatch ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
          {mismatch
            ? `This invitation is for ${preview.email}, but you're signed in as ${signedInEmail}. Sign in with ${preview.email} to accept it.`
            : `Sent to ${preview.email}. Sign up with this address to accept it.`}
        </p>
      )}
    </div>
  )
}
