'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ChevronRight, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type PortfolioChats } from '@services/connect/connect'
import { ItemSection } from './inplace'

import { tr } from '@/lib/tr'
// Comments on a portfolio are conversations in Connect: the direct chat between its owner and each
// person they let see it, filtered to the portfolio or to one experience or project in it.

type Item = { uuid: string; title: string }

function usePortfolioChats(portfolioUuid?: string, item?: Item, token?: string) {
  return useSWR<PortfolioChats>(token && portfolioUuid ? connectKeys.portfolioChats(portfolioUuid, item?.uuid) : null,
    () => connectApi.portfolioChats(portfolioUuid!, item?.uuid, token), { shouldRetryOnError: false, revalidateOnFocus: false })
}

function useOpen(orgslug: string, portfolioUuid?: string, item?: Item, token?: string) {
  const router = useRouter()
  const [opening, setOpening] = useState<string | null>(null)
  async function open(userUuid?: string) {
    if (!portfolioUuid || !token) return
    setOpening(userUuid || 'owner')
    try {
      const chat = await connectApi.openPortfolioChat({ portfolio_uuid: portfolioUuid, user_uuid: userUuid, item_uuid: item?.uuid }, token)
      const filter = new URLSearchParams({ goal: chat.goal_uuid, ...(chat.step_uuid ? { step: chat.step_uuid } : {}) })
      router.push(`${getUriWithOrg(orgslug, routePaths.org.chat(chat.conversation_uuid))}?${filter}`)
    } catch (error: any) {
      toast.error(error?.message || tr('portfolio.portfolio_talk.that_chat_couldn_t_open', 'That chat couldn’t open'))
      setOpening(null)
    }
  }
  return { open, opening }
}

/** For someone the owner let see their portfolio: talk to the owner about it, or about this item. Nothing for anyone else. */
export function CommentButton({ portfolioUuid, item, orgslug, token: given }: { portfolioUuid?: string; item?: Item; orgslug: string; token?: string }) {
  const session = useLHSession() as any
  const token: string | undefined = given || session?.data?.tokens?.access_token
  const { data } = usePortfolioChats(portfolioUuid, item, token)
  const { open, opening } = useOpen(orgslug, portfolioUuid, item, token)
  const owner = data && !data.mine ? data.people[0] : undefined
  if (!owner) return null
  return <Button variant="surface" size="sm" onClick={() => void open()} disabled={Boolean(opening)} title={tr('portfolio.portfolio_talk.talk_with_name_about_value', 'Talk with {{name}} about {{value}}', { name: owner.person.name, value: item ? item.title : tr('portfolio.portfolio_talk.v_their_portfolio', 'their portfolio') })}>
    {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}{tr('portfolio.portfolio_talk.comment', 'Comment')}{owner.count ? <span className="font-medium opacity-70">· {owner.count}</span> : null}
  </Button>
}

/** For the owner, on an experience or project: the people who can see it, and what each chat says about it. */
export function ItemConversations({ portfolioUuid, item, orgslug, token }: { portfolioUuid?: string; item: Item; orgslug: string; token?: string }) {
  const { data } = usePortfolioChats(portfolioUuid, item, token)
  const { open, opening } = useOpen(orgslug, portfolioUuid, item, token)
  if (!data?.mine) return null
  return <ItemSection title={tr('portfolio.portfolio_talk.conversations', 'Conversations')}>
    {data.people.length ? <ul className="grid gap-2">{data.people.map(({ person, count }) => <li key={person.id}>
      <button type="button" onClick={() => void open(person.user_uuid)} disabled={Boolean(opening)}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-left transition hover:bg-muted/60 disabled:opacity-60">
        <PersonAvatar user={person as any} />
        <span className="min-w-0 flex-1"><b className="block truncate text-sm font-extrabold">{person.name}</b>
          <small className="block text-xs font-semibold text-muted-foreground">{count ? tr('portfolio.portfolio_talk.count_value_about_this', '{{count}} {{value}} about this', { count, value: count === 1 ? tr('portfolio.portfolio_talk.v_message', 'message') : tr('portfolio.portfolio_talk.v_messages', 'messages') }) : tr('portfolio.portfolio_talk.ask_value_what_they_think', 'Ask {{value}} what they think', { value: person.name.split(' ')[0] })}</small></span>
        {opening === person.user_uuid ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
    </li>)}</ul>
      : <p className="rounded-2xl border-2 border-dashed border-border p-4 text-sm font-semibold text-muted-foreground">
        {tr('portfolio.portfolio_talk.the_people_you_let_see', 'The people you let see your portfolio can comment here.')}{' '}<Link href={getUriWithOrg(orgslug, '/portfolio/people')} className="text-foreground underline">{tr('portfolio.portfolio_talk.choose_them_in_my_people', 'Choose them in My people')}</Link>.
      </p>}
  </ItemSection>
}
