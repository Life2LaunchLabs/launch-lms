'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Bell, Building2, Check, Flag, Loader2, MailOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import useInboxMessages from '@components/Hooks/useInboxMessages'
import useGoalInvitations, { type OrgGoalInvitation } from '@components/Hooks/useGoalInvitations'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import type { InboxMessage } from '@services/messages/messages'
import { getDiscoverOrganizations, type DiscoverOrganization } from '@services/organizations/orgs'
import { swrFetcher } from '@services/utils/ts/requests'
import { useConnectToken } from './useConnect'
import { chatTime } from './ConnectView'

type OrgLike = { org_uuid: string; name: string; slug: string; logo_image?: string | null }

/** An organization's mark: its logo, or a building on its own square. */
export function OrgMark({ org, size = 'md' }: { org?: OrgLike | null; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9 rounded-xl' : 'h-7 w-7 rounded-lg'
  if (org?.logo_image) return <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" className={cn(box, 'shrink-0 object-cover')} />
  return <span className={cn(box, 'flex shrink-0 items-center justify-center bg-emerald-600 text-white')}><Building2 size={size === 'md' ? 18 : 14} /></span>
}

const isInvitation = (message: InboxMessage) => Boolean(message.action_kind?.endsWith('_invitation'))

function where(orgslug: string, message: InboxMessage) {
  const goalUuid = message.action_kind === 'goal_invitation' && typeof message.action_data?.goal_uuid === 'string' ? message.action_data.goal_uuid : null
  if (message.action_kind === 'organization_invitation' && message.sender_organization?.slug) return getUriWithOrg(orgslug, routePaths.org.organization(message.sender_organization.slug))
  if (goalUuid) return getUriWithOrg(orgslug, routePaths.org.plan(goalUuid))
  // Older plan invitations only carry a slug, which goal pages no longer use.
  if (message.action_kind === 'plan_invitation') return getUriWithOrg(orgslug, routePaths.org.plans())
  return message.action_url || null
}

function Answer({ busy, onAnswer }: { busy: boolean; onAnswer: (accept: boolean) => void }) { // eslint-disable-line no-unused-vars
  return <span className="flex shrink-0 gap-1.5">
    <button type="button" disabled={busy} onClick={() => onAnswer(false)} aria-label="Decline" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground disabled:opacity-50"><X size={16} /></button>
    <button type="button" disabled={busy} onClick={() => onAnswer(true)} className="flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-bold text-background disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Accept</button>
  </span>
}

/**
 * Invitations waiting on you, pinned above your chats: joining an organization, starting a
 * plan it assigned you, or helping on someone's plan. Answer them right from the row.
 */
export function InvitationRows({ orgslug }: { orgslug: string }) {
  const inbox = useInboxMessages()
  const plans = useGoalInvitations()
  const [busy, setBusy] = React.useState('')
  const answer = async (key: string, run: () => Promise<void>, accept: boolean) => {
    setBusy(key)
    try {
      await run()
      toast.success(accept ? 'Accepted' : 'Declined')
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t go through')
    } finally {
      setBusy('')
    }
  }
  const messages = inbox.messages.filter((message) => isInvitation(message) && message.action_status === 'pending')
  if (!messages.length && !plans.invitations.length) return null
  return <section aria-label="Invitations" className="mb-2">
    <h2 className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Invitations</h2>
    <ul className="flex flex-col gap-0.5">
      {plans.invitations.map((item: OrgGoalInvitation) => <li key={item.goal_uuid} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5">
        <OrgMark org={item.organization} />
        <Link href={getUriWithOrg(orgslug, routePaths.org.organization(item.organization.slug))} className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-black">{item.title}</span>
          <span className="flex items-center gap-1 truncate text-sm text-muted-foreground"><Flag size={12} className="shrink-0" />{item.organization.name} assigned you a plan</span>
        </Link>
        <Answer busy={busy === item.goal_uuid} onAnswer={(accept) => answer(item.goal_uuid, () => plans.respond(item, accept), accept)} />
      </li>)}
      {messages.map((message) => {
        const href = where(orgslug, message)
        const text = <><span className="block truncate text-[15px] font-black">{message.subject}</span><span className="block truncate text-sm text-muted-foreground">{message.sender_organization?.name || message.body}</span></>
        return <li key={message.message_uuid} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5">
          <OrgMark org={message.sender_organization} />
          {href ? <Link href={href} className="min-w-0 flex-1">{text}</Link> : <span className="min-w-0 flex-1">{text}</span>}
          <Answer busy={busy === message.message_uuid} onAnswer={(accept) => answer(message.message_uuid, () => inbox.respond(message.message_uuid, accept), accept)} />
        </li>
      })}
    </ul>
  </section>
}

/** Every notice organizations sent you, as one row that opens like a chat. */
export function UpdatesRow({ orgslug, active }: { orgslug: string; active: boolean }) {
  const { messages, unreadCount } = useInboxMessages()
  const latest = messages[0]
  if (!latest) return null
  return <li>
    <Link href={getUriWithOrg(orgslug, routePaths.org.connectUpdates())} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.05]', active && 'bg-foreground/[0.07]')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08]"><Bell size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[15px]', unreadCount ? 'font-black' : 'font-semibold')}>Updates</span>
          <span className={cn('ml-auto shrink-0 text-xs', unreadCount ? 'font-bold text-foreground' : 'text-muted-foreground')}>{chatTime(latest.created_at)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', unreadCount ? 'text-foreground' : 'text-muted-foreground')}>{latest.subject}</span>
          {unreadCount ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-black text-white">{unreadCount}</span> : null}
        </span>
      </span>
    </Link>
  </li>
}

/** The notices themselves, open beside the list where a chat would be. */
export function UpdatesPane({ orgslug }: { orgslug: string }) {
  const { messages, isLoading, error, markViewed, respond } = useInboxMessages()
  const [busy, setBusy] = React.useState('')
  // Opening the updates reads them.
  React.useEffect(() => { void markViewed() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const answer = async (message: InboxMessage, accept: boolean) => {
    setBusy(message.message_uuid)
    try {
      await respond(message.message_uuid, accept)
    } catch (answerError: any) {
      toast.error(answerError?.message || 'That didn’t go through')
    } finally {
      setBusy('')
    }
  }
  return <>
    <header className="flex shrink-0 items-center gap-3 px-3 py-2.5 md:px-4">
      <Link href={getUriWithOrg(orgslug, routePaths.org.connect())} aria-label="Back to Connect" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[0.06] md:hidden"><ArrowLeft size={18} /></Link>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08]"><Bell size={17} /></span>
      <div className="min-w-0 flex-1"><h2 className="truncate font-black leading-tight">Updates</h2><p className="truncate text-xs text-muted-foreground">Invitations and notices from organizations</p></div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
      {isLoading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
        : error ? <p className="py-16 text-center text-sm text-muted-foreground">Updates didn&rsquo;t load.</p>
        : !messages.length ? <div className="py-16 text-center text-muted-foreground"><MailOpen className="mx-auto mb-3" size={32} /><p className="text-sm">You&rsquo;re all caught up.</p></div>
        : <ol className="mx-auto flex max-w-[50rem] flex-col gap-2">{messages.map((message) => {
          const href = where(orgslug, message)
          const pending = isInvitation(message) && message.action_status === 'pending'
          return <li key={message.message_uuid} className="rounded-2xl bg-[hsl(var(--raised)/0.55)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <OrgMark org={message.sender_organization} size="sm" />
              <span className="truncate font-semibold">{message.sender_organization?.name || 'Launch LMS'}</span>
              <span className="ml-auto shrink-0">{chatTime(message.created_at)}</span>
            </div>
            <p className="mt-2 font-bold leading-snug">{message.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.body}</p>
            <div className="mt-2 flex items-center gap-3">
              {href ? <Link href={href} className="text-sm font-semibold underline-offset-4 hover:underline">View details</Link> : null}
              {isInvitation(message) && !pending && message.action_status ? <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{message.action_status}</span> : null}
              {pending ? <span className="ml-auto"><Answer busy={busy === message.message_uuid} onAnswer={(accept) => answer(message, accept)} /></span> : null}
            </div>
          </li>
        })}</ol>}
    </div>
  </>
}

type MyOrganization = OrgLike & { id: number }

/** The organizations you belong to, each opening its profile. */
export function OrganizationRows({ orgslug }: { orgslug: string }) {
  const token = useConnectToken()
  const { data } = useSWR<MyOrganization[]>(token ? `${getAPIUrl()}orgs/user/page/1/limit/100` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  if (!data?.length) return null
  return <section aria-label="Your organizations" className="mt-4">
    <h2 className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Organizations</h2>
    <ul className="flex flex-col gap-0.5">{data.map((org) => <li key={org.org_uuid}>
      <Link href={getUriWithOrg(orgslug, routePaths.org.organization(org.slug))} className="flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]">
        <OrgMark org={org} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{org.name}</span>
      </Link>
    </li>)}</ul>
  </section>
}

/** Organizations matching a search, above the people it finds. */
export function OrganizationResults({ orgslug, query }: { orgslug: string; query: string }) {
  const token = useConnectToken()
  const needle = query.trim().replace(/^@/, '')
  const { data } = useSWR<DiscoverOrganization[]>(['connect-org-search', needle, token], () => getDiscoverOrganizations({ page: 1, limit: 5, query: needle }, null, token || undefined), { keepPreviousData: true })
  if (!data?.length) return null
  return <ul className="mb-1 flex flex-col gap-0.5 border-b border-border pb-1">{data.map((org) => <li key={org.org_uuid}>
    <Link href={getUriWithOrg(orgslug, routePaths.org.organization(org.slug))} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-foreground/[0.05]">
      <OrgMark org={org} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{org.name}</span>
        <span className="block truncate text-sm text-muted-foreground">Organization{org.is_member ? ' · You’re a member' : ` · ${org.member_count} members`}</span>
      </span>
    </Link>
  </li>)}</ul>
}
