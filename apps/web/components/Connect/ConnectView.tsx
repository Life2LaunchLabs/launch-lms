'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, MessageCircle, Search, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import { Skeleton } from '@components/ui/skeleton'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, connectUrl, type ChatSummary, type FoundPerson } from '@services/connect/connect'
import ChatPane, { GroupMark } from './ChatPane'
import { OrganizationResults, OrgMark } from './ConnectOrgs'
import { useChatList, useConnectToken } from './useConnect'

export const CONNECT_COLOR = '#7cc4ff'

/** "9:41", "Tue" or "Mar 3": how long ago a chat last moved. */
export function chatTime(stamp?: string | null) {
  if (!stamp) return ''
  const date = new Date(stamp)
  const now = new Date()
  const days = (now.getTime() - date.getTime()) / 86_400_000
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days < 6) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function preview(chat: ChatSummary) {
  const last = chat.last_message
  if (!last) return ''
  if (chat.status === 'request') return 'Wants to chat with you'
  return `${last.mine ? 'You: ' : ''}${last.preview || last.body}`
}

/**
 * Connect: your connections, the organizations and people you talk with, in one stack. Their
 * invitations and notices are messages in those chats. Find someone by @handle or an
 * organization by name, and the open chat sits beside the list.
 */
export default function ConnectView({ orgslug, chatUuid }: { orgslug: string; chatUuid?: string }) {
  const { data, isLoading, error, mutate } = useChatList()
  const [query, setQuery] = React.useState('')
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const chats = data?.chats || []
  const searching = query.trim().replace(/^@/, '').length >= 2
  const open = Boolean(chatUuid)

  // One surface: the list and the open chat side by side, their headers on one line.
  return <div className="flex h-[calc(100dvh-var(--candidate-experience-height,0px)-var(--demo-bar-height,0px)-4rem)] w-full overflow-hidden md:h-[calc(100dvh-var(--candidate-experience-height,0px)-var(--demo-bar-height,0px))] md:border-l md:border-border" data-connect>
    <section aria-label="Chats" className={cn('flex min-h-0 w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-border', open && 'hidden md:flex')}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:border-b md:border-border md:px-5">
        <h1 className="text-2xl font-black tracking-tight md:text-xl">Connect</h1>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Connect settings" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Settings2 size={19} /></button>
      </div>
      <label className="relative mx-3 mb-2 mt-1 block md:mt-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people and organizations" aria-label="Search for someone by @handle or name, or an organization"
          className="h-11 w-full rounded-xl border border-transparent bg-muted/60 pl-10 pr-10 text-sm outline-none focus:border-border focus:ring-2 focus:ring-[var(--org-primary-color)]" />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={16} /></button> : null}
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {searching ? <><OrganizationResults orgslug={orgslug} query={query} /><PeopleResults orgslug={orgslug} query={query} onOpened={() => setQuery('')} /></>
          : isLoading ? <ListSkeleton />
          : error ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">Chats didn&rsquo;t load. <button type="button" className="font-semibold underline" onClick={() => mutate()}>Try again</button></p>
          : chats.length ? <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => <ChatRow key={chat.conversation_uuid} chat={chat} orgslug={orgslug} active={chat.conversation_uuid === chatUuid} />)}
          </ul> : <EmptyList />}
      </div>
    </section>
    <section aria-label="Chat" className={cn('min-h-0 min-w-0 flex-1 flex-col overflow-hidden', open ? 'flex' : 'hidden md:flex')}>
      {chatUuid ? <ChatPane key={chatUuid} orgslug={orgslug} chatUuid={chatUuid} />
        : <div className="m-auto max-w-xs p-8 text-center text-muted-foreground"><MessageCircle className="mx-auto mb-3" size={36} /><p className="text-sm">Pick a chat, or search for someone by their @handle or an organization by name.</p></div>}
    </section>
    <ConnectSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
  </div>
}

function ChatRow({ chat, orgslug, active }: { chat: ChatSummary; orgslug: string; active: boolean }) {
  const unread = chat.unread > 0 || chat.status === 'request'
  return <li>
    <Link href={getUriWithOrg(orgslug, routePaths.org.chat(chat.conversation_uuid))} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      {chat.kind === 'school' ? <OrgMark org={chat.org} /> : chat.kind === 'group' ? <GroupMark /> : <PersonAvatar user={chat.people[0] as any} size="md" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[15px]', unread ? 'font-black' : 'font-semibold')}>{chat.title}</span>
          <span className={cn('ml-auto shrink-0 text-xs', unread ? 'font-bold text-foreground' : 'text-muted-foreground')}>{chatTime(chat.last_message_at)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>{preview(chat)}</span>
          {chat.status === 'request' ? <span className="ml-auto shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-background">Request</span>
            : chat.unread ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-black text-white">{chat.unread}</span> : null}
        </span>
      </span>
    </Link>
  </li>
}

function PeopleResults({ orgslug, query, onOpened }: { orgslug: string; query: string; onOpened: () => void }) {
  const token = useConnectToken()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const needle = query.trim()
  const { data, isLoading } = useSWR<FoundPerson[]>(token ? connectUrl(`/search?q=${encodeURIComponent(needle)}`) : null, () => connectApi.search(needle, token), { keepPreviousData: true })
  const [opening, setOpening] = React.useState('')
  const open = async (person: FoundPerson) => {
    setOpening(person.user_uuid || person.username)
    try {
      const chat = await connectApi.openDirect({ user_uuid: person.user_uuid }, token)
      onOpened()
      void mutate(connectKeys.chats())
      router.push(getUriWithOrg(orgslug, routePaths.org.chat(chat.conversation_uuid)))
    } catch (error: any) {
      toast.error(error?.message || 'That chat couldn’t open')
    } finally {
      setOpening('')
    }
  }
  if (isLoading && !data) return <ListSkeleton />
  if (!data?.length) return <p className="px-3 py-8 text-center text-sm leading-6 text-muted-foreground">No people found. People show up here when you share a goal with them, or when they&rsquo;ve chosen to be findable by their @handle.</p>
  return <ul className="flex flex-col gap-0.5">{data.map((person) => <li key={person.id}>
    <button type="button" onClick={() => open(person)} disabled={Boolean(opening)} className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left hover:bg-foreground/[0.05]">
      <PersonAvatar user={person as any} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{person.name}</span>
        <span className="block truncate text-sm text-muted-foreground">@{person.username}{person.known ? ' · On a goal with you' : ''}</span>
      </span>
      {opening === (person.user_uuid || person.username) ? <Loader2 size={16} className="animate-spin" /> : null}
    </button>
  </li>)}</ul>
}

function ListSkeleton() {
  return <div className="flex flex-col gap-3 px-2.5 py-2">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>)}</div>
}

function EmptyList() {
  return <div className="px-4 py-10 text-center">
    <MessageCircle className="mx-auto mb-3 text-muted-foreground" size={32} />
    <p className="font-bold">No chats yet</p>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Organizations and people you work with show up here, along with their invitations. Search for someone you share a goal with.</p>
  </div>
}

function ConnectSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) { // eslint-disable-line no-unused-vars
  const token = useConnectToken()
  const { data: settings, mutate } = useSWR(open && token ? connectKeys.settings() : null, () => connectApi.settings(token))
  const { data: blocked = [], mutate: refreshBlocked } = useSWR(open && token ? connectKeys.blocked() : null, () => connectApi.blocked(token))
  const setFindable = async (discoverable: boolean) => {
    try {
      await mutate(connectApi.updateSettings(discoverable, token), { optimisticData: { discoverable }, rollbackOnError: true })
    } catch {
      toast.error('That setting didn’t save')
    }
  }
  const unblock = async (userUuid?: string) => {
    if (!userUuid) return
    await connectApi.unblock(userUuid, token)
    await refreshBlocked()
  }
  return <EditSheet open={open} onOpenChange={onOpenChange} color={CONNECT_COLOR} title="Connect settings">
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
      <span>
        <span className="block font-bold">Let people find me by @handle</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">Off means only people you share a goal with can find you. Messages from people you don&rsquo;t know always arrive as requests.</span>
      </span>
      <Switch checked={Boolean(settings?.discoverable)} disabled={!settings} onCheckedChange={setFindable} aria-label="Let people find me by @handle" />
    </label>
    <div>
      <h3 className="mb-2 text-sm font-bold">Blocked</h3>
      {blocked.length ? <ul className="flex flex-col gap-2">{blocked.map((person) => <li key={person.id} className="flex items-center gap-3">
        <PersonAvatar user={person as any} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.name} <span className="font-normal text-muted-foreground">@{person.username}</span></span>
        <Button size="sm" variant="outline" onClick={() => unblock(person.user_uuid)}>Unblock</Button>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">You haven&rsquo;t blocked anyone.</p>}
    </div>
  </EditSheet>
}
