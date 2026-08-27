'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Building2, Check, Layers3, Loader2, MailOpen, X } from 'lucide-react'
import useOrganizationInvitations from '@components/Hooks/useOrganizationInvitations'
import useProgramInvitations, { ProgramInvitation } from '@components/Hooks/useProgramInvitations'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default function AccountMessages({ orgslug }: { orgslug: string }) {
  const { invitations, isLoading, error, markViewed, respond } = useOrganizationInvitations()
  const { invitations: programInvitations, isLoading: programsLoading, error: programsError, markViewed: markProgramsViewed, respond: respondToProgram } = useProgramInvitations()
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    void markViewed()
    void markProgramsViewed()
  // Mark once when the inbox is opened; the SWR function is intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleResponse(invitationUuid: string, accept: boolean) {
    setBusy(invitationUuid)
    try {
      await respond(invitationUuid, accept)
      toast.success(accept ? 'Organization joined.' : 'Invitation declined.')
    } catch (responseError: any) {
      toast.error(responseError?.message || 'Could not update the invitation.')
    } finally {
      setBusy(null)
    }
  }

  async function handleProgramResponse(invitation: ProgramInvitation, accept: boolean) {
    setBusy(invitation.participant_uuid)
    try {
      await respondToProgram(invitation, accept)
      toast.success(accept ? 'Program accepted.' : 'Program invitation declined.')
    } catch (responseError: any) {
      toast.error(responseError?.message || 'Could not update the program invitation.')
    } finally {
      setBusy(null)
    }
  }

  if (isLoading || programsLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invitations and updates that need your attention.</p>
      </div>
      {error || programsError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Some messages could not be loaded right now.</div> : null}
      {!error && !programsError && !invitations.length && !programInvitations.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <MailOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-bold text-foreground">You’re all caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">New organization and program invitations will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((invitation) => (
            <article key={invitation.invitation_uuid} className="rounded-2xl border border-border bg-card p-5 nice-shadow sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Building2 size={22} /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-blue-700">Organization invitation</p>
                    <h2 className="mt-1 text-lg font-black text-foreground">{invitation.organization?.name || 'Organization'}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You’ve been invited{invitation.role?.name ? ` as ${invitation.role.name}` : ''}{invitation.usergroup?.name ? ` to ${invitation.usergroup.name}` : ''}.
                    </p>
                    {invitation.organization?.slug ? <Link href={getUriWithOrg(orgslug, routePaths.org.organization(invitation.organization.slug))} className="mt-2 inline-block text-sm font-semibold text-foreground underline-offset-4 hover:underline">View organization</Link> : null}
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <button type="button" disabled={busy === invitation.invitation_uuid} onClick={() => void handleResponse(invitation.invitation_uuid, false)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"><X size={15} />Decline</button>
                  <button type="button" disabled={busy === invitation.invitation_uuid} onClick={() => void handleResponse(invitation.invitation_uuid, true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50">{busy === invitation.invitation_uuid ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}Accept</button>
                </div>
              </div>
            </article>
          ))}
          {programInvitations.map((invitation) => (
            <article key={invitation.participant_uuid} className="rounded-2xl border border-border bg-card p-5 nice-shadow sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-lime-800"><Layers3 size={22} /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-lime-800">Program invitation</p>
                    <h2 className="mt-1 text-lg font-black text-foreground">{invitation.program.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{invitation.organization.name}{invitation.group?.name ? ` · assigned through ${invitation.group.name}` : ' · assigned directly to you'}</p>
                    {invitation.assignment.welcome_message ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{invitation.assignment.welcome_message}</p> : null}
                    <Link href={getUriWithOrg(orgslug, routePaths.org.organization(invitation.organization.slug))} className="mt-2 inline-block text-sm font-semibold text-foreground underline-offset-4 hover:underline">View organization</Link>
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <button type="button" disabled={busy === invitation.participant_uuid} onClick={() => void handleProgramResponse(invitation, false)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"><X size={15} />Decline</button>
                  <button type="button" disabled={busy === invitation.participant_uuid} onClick={() => void handleProgramResponse(invitation, true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50">{busy === invitation.participant_uuid ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}Accept</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
