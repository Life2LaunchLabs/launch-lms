'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig, type KeyedMutator } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Ban, Flag, MoreHorizontal } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { Skeleton } from '@components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type Chat } from '@services/connect/connect'
import { useConnectToken } from './useConnect'
import { OrgMark } from './ConnectOrgs'
import ChatWorkspace from './workspace/ChatWorkspace'

/** Where a step opens for its learner: their plan, at that step. */
export const learnerStepHref = (orgslug: string) => (goalUuid: string, stepUuid: string) => `${getUriWithOrg(orgslug, routePaths.org.plan(goalUuid))}?step=${encodeURIComponent(stepUuid)}`

export default function ChatPane({ orgslug, chatUuid }: { orgslug: string; chatUuid: string }) {
  const token = useConnectToken()
  const router = useRouter()
  const { mutate: mutateGlobal } = useSWRConfig()
  const [sheet, setSheet] = React.useState<'block' | 'report' | null>(null)
  const [person, setPerson] = React.useState<Chat['people'][number] | undefined>()
  const listHref = getUriWithOrg(orgslug, routePaths.org.connect())
  const refreshLists = React.useCallback(() => {
    void mutateGlobal(connectKeys.chats())
    void mutateGlobal(connectKeys.counts())
  }, [mutateGlobal])
  const onChat = React.useCallback((chat: Chat) => setPerson(chat.people[0]), [])

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
    if (chat.unavailable) return 'You can’t message in this chat.'
    if (chat.status === 'request') return 'Accept to reply.'
    return chat.waiting_for_them && chat.messages.some((message) => message.mine) ? `You can send more once ${chat.people[0]?.name || 'they'} accepts.` : ''
  }

  return <>
    <ChatWorkspace source={{ chatUuid }} orgslug={orgslug} token={token} onChat={onChat} blocked={blocked} stepHref={learnerStepHref(orgslug)}
      empty={person ? <>Say hi to {person.name}. They&rsquo;ll see your first message as a request unless you already share a goal.</> : null}
      header={(chat, mutate) => chat ? <>
        <ChatHeader chat={chat} orgslug={orgslug} listHref={listHref} onSheet={setSheet} />
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

/** Who the chat is with: a person, an organization and the people on your plans with it, or a plan's people. */
// eslint-disable-next-line no-unused-vars
function ChatHeader({ chat, orgslug, listHref, onSheet }: { chat: Chat; orgslug: string; listHref: string; onSheet: (sheet: 'block' | 'report') => void }) {
  const person = chat.people[0]
  const group = chat.kind === 'school' || chat.kind === 'goal'
  return <header className="flex shrink-0 items-center gap-3 px-3 py-2.5 md:px-4">
    <Link href={listHref} aria-label="Back to Connect" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[0.06] md:hidden"><ArrowLeft size={18} /></Link>
    {chat.kind === 'school' ? <OrgMark org={chat.org} />
      : chat.kind === 'goal' ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--org-primary-color)] text-white"><Flag size={18} /></span>
      : <PersonAvatar user={person as any} size="md" />}
    <div className="min-w-0 flex-1">
      {person && chat.kind === 'direct' ? <Link href={getUriWithOrg(orgslug, `/user/${encodeURIComponent(person.username)}`)} className="block truncate font-black leading-tight hover:underline">{chat.title}</Link>
        : chat.kind === 'school' && chat.org ? <Link href={getUriWithOrg(orgslug, routePaths.org.organization(chat.org.slug))} className="block truncate font-black leading-tight hover:underline">{chat.title}</Link> : <h2 className="truncate font-black leading-tight">{chat.title}</h2>}
      {group ? <p className="truncate text-xs text-muted-foreground">{chat.people.map((item) => item.name).join(', ')}</p> : person ? <p className="truncate text-xs text-muted-foreground">@{person.username}</p> : null}
    </div>
    {chat.kind === 'direct' ? <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Chat options" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[0.06]"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onSheet('report')}><Flag size={14} className="mr-2" />Report</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSheet('block')}><Ban size={14} className="mr-2" />Block</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : null}
  </header>
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
