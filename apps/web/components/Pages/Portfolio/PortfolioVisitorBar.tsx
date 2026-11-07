'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Lock, Map, Send, Target } from 'lucide-react'
import { Button } from '@components/ui/button'
import EditSheet from '@components/Goals/edit/EditSheet'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi } from '@services/connect/connect'
import { portfolioPeopleApi, profileKey, type PortfolioAccess, type Profile } from '@services/portfolio/people'
import { CommentButton } from './v2/PortfolioTalk'
import { ConnectRequestButton, SignInToConnect, useConnectRequest } from './ConnectRequest'
import type { Shell } from './portfolioTypes'

import { tr } from '@/lib/tr'
const SHEET_COLOR = '#7cc4ff'

/**
 * A signed-in visitor's view of someone's portfolio, which is their profile: message them,
 * see the goals they share with you, and talk about their portfolio if they let you see it (a chat in Connect).
 */
export function PortfolioVisitorBar({ orgslug, username, token, shell }: { orgslug: string; username: string; token?: string; shell: Shell }) {
  const router = useRouter()
  const { data: profile } = useSWR<Profile>(token ? profileKey(username) : null, () => portfolioPeopleApi.profile(username, token))
  const [sheet, setSheet] = React.useState<'goals' | null>(null)
  const [opening, setOpening] = React.useState(false)
  const access: PortfolioAccess | undefined = shell.access
  const onPortfolio = access && access.role !== 'public' && access.role !== 'owner'
  const portfolioUuid = shell.portfolio?.portfolio_uuid
  const { data: request, mutate: setRequest } = useConnectRequest(portfolioUuid, token, Boolean(shell.connect_requests) && access?.role !== 'owner')
  // Asking to connect needs an account: signed out, the button goes through sign-in first.
  if (!token) return shell.connect_requests && access?.role !== 'owner' ? <div className="flex flex-wrap items-center gap-2 sm:ml-auto"><SignInToConnect /></div> : null
  if (!profile || access?.role === 'owner') return null
  // While a request is on offer or waiting, it stands in for Message.
  const requesting = request && (request.status === 'asked' || (request.status === 'none' && request.open))

  const message = async () => {
    if (profile.chat_uuid) return router.push(getUriWithOrg(orgslug, routePaths.org.chat(profile.chat_uuid)))
    setOpening(true)
    try {
      const chat = await connectApi.openDirect({ handle: username }, token)
      router.push(getUriWithOrg(orgslug, routePaths.org.chat(chat.conversation_uuid)))
    } catch (error: any) {
      toast.error(error?.message || tr('portfolio.portfolio_talk.that_chat_couldn_t_open', 'That chat couldn’t open'))
    } finally {
      setOpening(false)
    }
  }

  return <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
    {access?.shared_privately ? <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-raised px-3 text-xs font-bold text-muted-foreground"><Lock className="h-3.5 w-3.5" />{tr('portfolio.portfolio_visitor_bar.shared_with_you', 'Shared with you')}</span> : null}
    {requesting && portfolioUuid ? <ConnectRequestButton portfolioUuid={portfolioUuid} name={profile.person.name} token={token} state={request} onSent={(next) => setRequest(next, { revalidate: false })} /> : null}
    {profile.can_message && !requesting ? <Button variant="brand" size="sm" onClick={message} disabled={opening}>{opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tr('portfolio.portfolio_visitor_bar.message', 'Message')}</Button> : null}
    {profile.goals.length ? <Button variant="surface" size="sm" onClick={() => setSheet('goals')}><Target className="h-4 w-4" />{tr('portfolio.portfolio_visitor_bar.goals_length', 'Goals · {{length}}', { length: profile.goals.length })}</Button> : null}
    {access?.plans && profile.person.user_uuid ? <Button variant="surface" size="sm" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.sharedPlan(profile.person.user_uuid))}><Map className="h-4 w-4" />{tr('portfolio.portfolio_visitor_bar.plans', 'Plans')}</Link></Button> : null}
    {onPortfolio ? <CommentButton portfolioUuid={shell.portfolio?.portfolio_uuid} orgslug={orgslug} token={token} /> : null}
    <EditSheet open={sheet === 'goals'} onOpenChange={(open) => setSheet(open ? 'goals' : null)} color={SHEET_COLOR} title={tr('portfolio.portfolio_visitor_bar.goals_name_shares_with_you', 'Goals {{name}} shares with you', { name: profile.person.name })}>
      <ul className="flex flex-col gap-2">{profile.goals.map((goal) => <li key={goal.goal_uuid}>
        <Link href={getUriWithOrg(orgslug, routePaths.org.plan(goal.goal_uuid))} className="flex items-center gap-3 rounded-2xl border border-border p-3 hover:bg-raised">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-lg" aria-hidden="true">{goal.icon || '🎯'}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-bold">{goal.title}</span><span className="block text-xs capitalize text-muted-foreground">{goal.status}{goal.can_comment ? tr('portfolio.portfolio_visitor_bar.you_can_comment', ' · You can comment') : ''}</span></span>
        </Link>
      </li>)}</ul>
    </EditSheet>
  </div>
}
