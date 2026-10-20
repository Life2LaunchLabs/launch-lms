'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig, type KeyedMutator } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Ban, Flag, MoreHorizontal, Users } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { Skeleton } from '@components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type Chat } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'
import { useConnectToken } from './useConnect'
import { OrgMark } from './ConnectOrgs'
import ChatWorkspace from './workspace/ChatWorkspace'

/** Where a step opens for its learner: their plan, at that step. */
export const learnerStepHref = (orgslug: string) => (goalUuid: string, stepUuid: string) => `${getUriWithOrg(orgslug, routePaths.org.plan(goalUuid))}?step=${encodeURIComponent(stepUuid)}`

/**
 * One chat beside its list. Connect and People both use it: People passes its own list to go back
 * to, where a person's profile opens, and what else to refresh when the chat changes.
 */
export default function ChatPane({ orgslug, chatUuid, listHref: list, personHref, onChanged, actions }: {
  orgslug: string
  chatUuid: string
  listHref?: string
  personHref?: (person: PersonSummary) => string // eslint-disable-line no-unused-vars
  onChanged?: () => void
  /** Extra controls in the header, such as managing a group. */
  actions?: React.ReactNode
}) {
  const token = useConnectToken()
  const router = useRouter()
  const { mutate: mutateGlobal } = useSWRConfig()
  const [sheet, setSheet] = React.useState<'block' | 'report' | null>(null)
  const [opened, setOpened] = React.useState<Chat | undefined>()
  const listHref = list || getUriWithOrg(orgslug, routePaths.org.connect())
  const refreshLists = React.useCallback(() => {
    void mutateGlobal(connectKeys.chats())
    void mutateGlobal(connectKeys.counts())
    onChanged?.()
  }, [mutateGlobal, onChanged])
  const onChat = React.useCallback((chat: Chat) => setOpened(chat), [])
  const person = opened?.people[0]

  const answer = async (choice: 'accept' | 'decline', mutate: KeyedMutator<Chat>) => {
    try {
      if (choice === 'accept') {
        await connectApi.accept(chatUuid, token)
        await mutate()
      } else {
        await connectApi.decline(chatUuid, token)
        router.push(listHref)
      }
      refreshLists()
    } catch (answerError: any) {
      toast.error(answerError?.message || 'That didn’t work')
    }
  }
  const leave = () => {
    refreshLists()
    router.push(listHref)
  }
  const blocked = (chat: Chat) => {
    if (chat.policy_block) return chat.policy_block
    if (chat.unavailable) return 'You can’t message in this chat.'
    if (chat.status === 'request') return 'Accept to reply.'
    return chat.waiting_for_them && chat.messages.some((message) => message.mine) ? `You can send more once ${chat.people[0]?.name || 'they'} accepts.` : ''
  }

  return <>
    <ChatWorkspace source={{ chatUuid }} orgslug={orgslug} token={token} onChat={onChat} blocked={blocked} stepHref={learnerStepHref(orgslug)}
      empty={opened?.kind === 'direct' ? person ? <>Say hi to {person.name}. They&rsquo;ll see your first message as a request unless you already share a goal.</> : null
        : opened ? <>Nothing here yet. Say hi to {opened.title || 'the group'}: everyone in this chat sees what you send.</> : null}
      header={(chat, mutate) => chat ? <>
        <ChatHeader chat={chat} orgslug={orgslug} listHref={listHref} onSheet={setSheet} personHref={personHref} actions={actions} />
        {chat.status === 'request' ? <div className="border-b border-border bg-background/60 px-4 py-3">
          <p className="text-sm"><b>{chat.people[0]?.name || 'Someone'}</b> wants to chat. Links stay off until you accept, and they won&rsquo;t know you&rsquo;ve seen this.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => answer('accept', mutate)}>Accept</Button>
            <Button size="sm" variant="outline" onClick={() => setSheet('block')}>Block</Button>
            <Button size="sm" variant="ghost" onClick={() => answer('decline', mutate)}>Delete</Button>
          </div>
        </div> : chat.waiting_for_them && !chat.unavailable ? <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">Waiting for {chat.people[0]?.name || 'them'} to accept your request.</p> : null}
      </> : <ChatSkeleton />} />
    <BlockSheet open={sheet === 'block'} onClose={() => setSheet(null)} chatUuid={chatUuid} name={person?.name} onDone={leave} />
    <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} chatUuid={chatUuid} name={person?.name} onDone={(blocked) => blocked ? leave() : setSheet(null)} />
  </>
}

/** Who the chat is with, on the same line as Connect's own header: a person, or an organization and its people. */
/* eslint-disable no-unused-vars */
function ChatHeader({ chat, orgslug, listHref, onSheet, personHref, actions }: {
  chat: Chat; orgslug: string; listHref: string; onSheet: (sheet: 'block' | 'report') => void
  personHref?: (person: PersonSummary) => string; actions?: React.ReactNode
}) {
/* eslint-enable no-unused-vars */
  const person = chat.people[0]
  const group = chat.kind === 'school' || chat.kind === 'goal' || chat.kind === 'group'
  const profile = person && chat.kind === 'direct' ? { href: personHref ? personHref(person) : getUriWithOrg(orgslug, `/user/${encodeURIComponent(person.username)}`), label: 'View profile' }
    : chat.kind === 'school' && chat.org ? { href: getUriWithOrg(orgslug, routePaths.org.organization(chat.org.slug)), label: 'View organization' } : null
  const mark = chat.kind === 'school' ? <OrgMark org={chat.org} />
    : chat.kind === 'goal' ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--org-primary-color)] text-white"><Flag size={18} /></span>
    : chat.kind === 'group' ? <GroupMark />
    : <PersonAvatar user={person as any} size="md" />
  const who = <span className="min-w-0 flex-1">
    <span className="block truncate font-black leading-tight">{chat.title}</span>
    {group ? <span className="block truncate text-xs text-muted-foreground">{chat.people.map((item) => item.name).join(', ')}</span> : person ? <span className="block truncate text-xs text-muted-foreground">@{person.username}</span> : null}
  </span>
  return <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-2 md:gap-3 md:px-6">
    <Link href={listHref} aria-label="Back to Connect" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-foreground/[0.06] md:hidden"><ArrowLeft size={20} /></Link>
    {profile ? <Link href={profile.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:opacity-90">{mark}{who}</Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{mark}{who}</div>}
    {profile ? <Link href={profile.href} className="hidden h-9 shrink-0 items-center rounded-xl bg-muted/70 px-3.5 text-sm font-semibold hover:bg-muted md:flex">{profile.label}</Link> : null}
    {actions}
    {chat.kind === 'direct' ? <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Chat options" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-foreground/[0.06]"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onSheet('report')}><Flag size={14} className="mr-2" />Report</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSheet('block')}><Ban size={14} className="mr-2" />Block</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : null}
  </header>
}

/** A group chat's mark: its people, not one face. */
export function GroupMark() {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"><Users size={18} /></span>
}

function ChatSkeleton() {
  return <div className="flex flex-1 flex-col gap-3 p-5">
    <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-40" /></div>
    <Skeleton className="mt-6 h-9 w-2/3 rounded-3xl" />
    <Skeleton className="ml-auto h-9 w-1/2 rounded-3xl" />
  </div>
}

function BlockSheet({ open, onClose, chatUuid, name, onDone }: { open: boolean; onClose: () => void; chatUuid: string; name?: string; onDone: () => void }) {
  const token = useConnectToken()
  const [busy, setBusy] = React.useState(false)
  const block = async () => {
    setBusy(true)
    try {
      await connectApi.block(chatUuid, token)
      toast.success(`${name || 'They'} can't message you now`)
      onDone()
    } catch (blockError: any) {
      toast.error(blockError?.message || 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }
  return <EditSheet open={open} onOpenChange={(next) => !next && onClose()} color="#7cc4ff" title={`Block ${name || 'them'}?`}
    description="Neither of you will be able to message the other, and they won’t find you in search. They aren’t told. You can unblock them in Connect settings."
    footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={block}>Block</Button></>} />
}

function ReportSheet({ open, onClose, chatUuid, name, onDone }: { open: boolean; onClose: () => void; chatUuid: string; name?: string; onDone: (blocked: boolean) => void }) { // eslint-disable-line no-unused-vars
  const token = useConnectToken()
  const [reason, setReason] = React.useState('')
  const [alsoBlock, setAlsoBlock] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const report = async () => {
    setBusy(true)
    try {
      const result = await connectApi.report(chatUuid, { reason: reason.trim(), block: alsoBlock }, token)
      toast.success('Thanks for telling us. We’ll look into it.')
      setReason('')
      onDone(result.blocked)
    } catch (reportError: any) {
      toast.error(reportError?.message || 'That report didn’t send')
    } finally {
      setBusy(false)
    }
  }
  return <EditSheet open={open} onOpenChange={(next) => !next && onClose()} color="#7cc4ff" title={`Report ${name || 'this chat'}`}
    description="Tell us what happened. If you feel unsafe, also talk to a trusted adult."
    footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || !reason.trim()} onClick={report}>Send report</Button></>}>
    <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={2000} placeholder="What’s going on?" aria-label="What happened"
      className="w-full rounded-2xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={alsoBlock} onCheckedChange={(value) => setAlsoBlock(value === true)} />Also block {name || 'them'}</label>
  </EditSheet>
}
