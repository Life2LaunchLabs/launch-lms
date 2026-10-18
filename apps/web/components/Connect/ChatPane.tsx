'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Ban, Flag, Loader2, MessageCircle, MoreHorizontal, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { Skeleton } from '@components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type Chat, type ChatMessage } from '@services/connect/connect'
import { useConnectToken } from './useConnect'

const CHAT_REFRESH_MS = 5_000
const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

/** Text with its links live, once both people have said yes to the chat. Until then links stay plain text. */
function MessageText({ body, links }: { body: string; links: boolean }) {
  if (!links) return <>{body}</>
  return <>{body.split(URL_PATTERN).map((part, index) => index % 2
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-2">{part}</a>
    : <React.Fragment key={index}>{part}</React.Fragment>)}</>
}

export default function ChatPane({ orgslug, chatUuid }: { orgslug: string; chatUuid: string }) {
  const token = useConnectToken()
  const router = useRouter()
  const { mutate: mutateGlobal } = useSWRConfig()
  const { data: chat, error, mutate } = useSWR<Chat>(token ? connectKeys.chat(chatUuid) : null, () => connectApi.chat(chatUuid, token), { refreshInterval: CHAT_REFRESH_MS, revalidateOnFocus: true })
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [sheet, setSheet] = React.useState<'block' | 'report' | null>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const listHref = getUriWithOrg(orgslug, routePaths.org.connect())
  const refreshLists = React.useCallback(() => {
    void mutateGlobal(connectKeys.chats())
    void mutateGlobal(connectKeys.counts())
  }, [mutateGlobal])

  const lastStamp = chat?.messages.at(-1)?.update_date
  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [lastStamp])
  // Reading the chat clears its unread count, but a request stays unanswered until accepted.
  const unread = chat?.unread || 0
  React.useEffect(() => {
    if (!token || !unread || chat?.status !== 'active') return
    void connectApi.read(chatUuid, token).then(refreshLists)
  }, [token, chatUuid, unread, chat?.status, refreshLists])

  if (error) return <div className="m-auto p-8 text-center text-sm text-muted-foreground">This chat isn&rsquo;t available. <Link className="font-semibold underline" href={listHref}>Back to Connect</Link></div>
  if (!chat) return <ChatSkeleton />

  const person = chat.people[0]
  const isRequest = chat.status === 'request'
  const sentOne = chat.messages.some((message) => message.mine)
  const blockedReason = chat.unavailable ? 'You can’t message in this chat.'
    : isRequest ? 'Accept to reply.'
    : chat.waiting_for_them && sentOne ? `You can send more once ${person?.name || 'they'} accepts.` : ''

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await connectApi.send(chatUuid, body, token)
      setDraft('')
      await mutate()
      refreshLists()
    } catch (sendError: any) {
      toast.error(sendError?.message || 'That message didn’t send')
    } finally {
      setSending(false)
    }
  }
  const answer = async (choice: 'accept' | 'decline') => {
    try {
      if (choice === 'accept') {
        await mutate(connectApi.accept(chatUuid, token), { revalidate: false })
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

  return <>
    <header className="flex items-center gap-3 border-b border-border px-3 py-2.5 md:px-4">
      <Link href={listHref} aria-label="Back to Connect" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[0.06] md:hidden"><ArrowLeft size={18} /></Link>
      <PersonAvatar user={person as any} size="md" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-black leading-tight">{chat.title}</h2>
        {person ? <p className="truncate text-xs text-muted-foreground">@{person.username}</p> : null}
      </div>
      {chat.kind === 'direct' ? <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Chat options" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[0.06]"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setSheet('report')}><Flag size={14} className="mr-2" />Report</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSheet('block')}><Ban size={14} className="mr-2" />Block</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </header>
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
      {chat.messages.length ? <ol className="flex flex-col gap-1.5">
        {chat.messages.map((message, index) => <Bubble key={message.message_uuid} message={message} orgslug={orgslug} links={chat.accepted}
          first={index === 0 || chat.messages[index - 1].mine !== message.mine} />)}
      </ol> : <p className="m-auto max-w-xs pt-16 text-center text-sm text-muted-foreground">Say hi to {person?.name || 'them'}. They&rsquo;ll see your first message as a request unless you already share a goal.</p>}
    </div>
    {isRequest ? <div className="border-t border-border bg-background/60 px-4 py-3">
      <p className="text-sm"><b>{person?.name || 'Someone'}</b> wants to chat. Links stay off until you accept, and they won&rsquo;t know you&rsquo;ve seen this.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => answer('accept')}>Accept</Button>
        <Button size="sm" variant="outline" onClick={() => setSheet('block')}>Block</Button>
        <Button size="sm" variant="ghost" onClick={() => answer('decline')}>Delete</Button>
      </div>
    </div> : chat.waiting_for_them && !chat.unavailable ? <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Waiting for {person?.name || 'them'} to accept your request.</p> : null}
    <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={4000} disabled={Boolean(blockedReason)}
        placeholder={blockedReason || 'Message'} aria-label="Message"
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
        className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--org-primary-color)] disabled:opacity-60" />
      <button type="submit" disabled={!draft.trim() || sending || Boolean(blockedReason)} aria-label="Send"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-white transition-opacity disabled:opacity-40">
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
      </button>
    </form>
    <BlockSheet open={sheet === 'block'} onClose={() => setSheet(null)} chatUuid={chatUuid} name={person?.name} onDone={leave} />
    <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} chatUuid={chatUuid} name={person?.name} onDone={(blocked) => blocked ? leave() : setSheet(null)} />
  </>
}

function Bubble({ message, orgslug, links, first }: { message: ChatMessage; orgslug: string; links: boolean; first: boolean }) {
  const time = new Date(message.update_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (message.kind === 'card' && message.card?.type === 'goal_comments') {
    const card = message.card
    const href = `${getUriWithOrg(orgslug, routePaths.org.plan(card.goal_uuid))}?comment=${encodeURIComponent(card.comment_uuid)}`
    return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', first && 'mt-2')}>
      <Link href={href} className="block w-full max-w-[340px] rounded-3xl border border-border bg-background p-3.5 transition-transform hover:-translate-y-0.5 hover:shadow-md">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--org-primary-color)]"><MessageCircle size={14} />{card.mentioned ? 'Mention' : 'Comments'}</span>
        <span className="mt-1 block font-black leading-snug">{message.body}</span>
        {card.excerpt ? <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">&ldquo;{card.excerpt}&rdquo;</span> : null}
        <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span className="font-semibold text-foreground">Open goal &rarr;</span>{time}</span>
      </Link>
    </li>
  }
  return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', first && 'mt-2')}>
    <div className={cn('max-w-[78%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2 text-[15px] leading-snug',
      message.mine ? 'rounded-br-lg bg-[var(--org-primary-color)] text-white' : 'rounded-bl-lg bg-foreground/[0.07] text-foreground')}>
      <MessageText body={message.body} links={links} />
      <span className={cn('ml-2 inline-block align-bottom text-[10px]', message.mine ? 'text-white/70' : 'text-muted-foreground')}>{time}</span>
    </div>
  </li>
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
