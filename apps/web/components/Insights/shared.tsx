'use client'

import React from 'react'
import useSWR from 'swr'
import { Building2, Route, User, Users } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { insightKeys, insightsApi, type DashboardSummary, type Scope } from '@services/insights/insights'
import { cn } from '@/lib/utils'

export function useInsightsContext() {
  const org = useOrg() as { id?: number; slug?: string } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string }; user?: { user_uuid?: string } } }
  const orgId = Number(org?.id)
  const token = session?.data?.tokens?.access_token
  return { orgId, orgslug: org?.slug || '', token, userUuid: session?.data?.user?.user_uuid || null, ready: Boolean(orgId && token) }
}

/** Every dashboard the viewer can open (the API makes the starters the first time). */
export function useDashboards() {
  const { orgId, token, ready } = useInsightsContext()
  return useSWR<DashboardSummary[]>(ready ? insightKeys.dashboards(orgId) : null, () => insightsApi.dashboards(orgId, token), { revalidateOnFocus: false })
}

const SCOPE_ICONS = { org: Building2, plan: Route, group: Users, learner: User } as const
const scopeTint: Record<Scope, string> = { org: 'bg-[#0B8077]', plan: 'bg-[#2F66D6]', group: 'bg-[#C77A0E]', learner: 'bg-[#6B3FE0]' }

export function ScopeGlyph({ scope, size = 'sm' }: { scope: Scope; size?: 'sm' | 'lg' }) {
  const Icon = SCOPE_ICONS[scope]
  return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-lg text-white', scopeTint[scope], size === 'lg' ? 'h-10 w-10 rounded-xl' : 'h-7 w-7')} aria-hidden="true">
    <Icon size={size === 'lg' ? 20 : 15} />
  </span>
}
