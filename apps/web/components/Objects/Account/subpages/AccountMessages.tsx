'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Building2, Check, Loader2, Mail, MailOpen, X } from 'lucide-react'
import useInboxMessages from '@components/Hooks/useInboxMessages'
import { InboxMessage } from '@services/messages/messages'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default function AccountMessages({ orgslug }: { orgslug: string }) {
  const { messages, isLoading, error, markViewed, respond } = useInboxMessages()
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    void markViewed()
  // Mark once when the inbox is opened; the SWR function is intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleResponse(message: InboxMessage, accept: boolean) {
    setBusy(message.message_uuid)
    try {
      await respond(message.message_uuid, accept)
      toast.success(accept ? 'Invitation accepted.' : 'Invitation declined.')
    } catch (responseError: any) {
      toast.error(responseError?.message || 'Could not update the invitation.')
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages, invitations, and updates from your organizations.</p>
      </div>
      {error ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Messages could not be loaded right now.</div> : null}
      {!error && !messages.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <MailOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-bold text-foreground">You’re all caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">New messages and invitations will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => {
            const isInvitation = message.action_kind?.endsWith('_invitation')
            const planSlug = typeof message.action_data?.plan_slug === 'string' ? message.action_data.plan_slug : null
            const href = message.action_kind === 'organization_invitation' && message.sender_organization?.slug
              ? getUriWithOrg(orgslug, routePaths.org.organization(message.sender_organization.slug))
              : planSlug
                ? getUriWithOrg(orgslug, routePaths.org.plan(planSlug))
                : message.action_url
            return (
              <article key={message.message_uuid} className="rounded-2xl border border-border bg-card p-5 nice-shadow sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      {message.sender_organization ? <Building2 size={22} /> : <Mail size={22} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-wider text-blue-700">
                        {isInvitation ? 'Invitation' : message.message_type === 'welcome' ? 'Welcome' : 'Message'}
                        {message.sender_organization?.name ? ` · ${message.sender_organization.name}` : ''}
                      </p>
                      <h2 className="mt-1 text-lg font-black text-foreground">{message.subject}</h2>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.body}</p>
                      {href ? <Link href={href} className="mt-2 inline-block text-sm font-semibold text-foreground underline-offset-4 hover:underline">View details</Link> : null}
                      {isInvitation && message.action_status && message.action_status !== 'pending' ? (
                        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{message.action_status}</p>
                      ) : null}
                    </div>
                  </div>
                  {isInvitation && message.action_status === 'pending' ? (
                    <div className="grid shrink-0 grid-cols-2 gap-2">
                      <button type="button" disabled={busy === message.message_uuid} onClick={() => void handleResponse(message, false)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"><X size={15} />Decline</button>
                      <button type="button" disabled={busy === message.message_uuid} onClick={() => void handleResponse(message, true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50">{busy === message.message_uuid ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}Accept</button>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
