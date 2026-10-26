'use client'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import InsightCard from '@components/Insights/InsightCard'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { AdminHome, GlanceCard } from '@services/goals/adminHome'
import type { ResultRow } from '@services/insights/insights'

const admin = routePaths.org.admin

/** Where a Home card opens: its dashboard in Insights, on the plan or group it shows. */
function cardHref(orgslug: string, card: GlanceCard) {
  if (card.scope.kind === 'org') return getUriWithOrg(orgslug, admin.insights(card.dashboard_uuid))
  return getUriWithOrg(orgslug, admin.insightsScope(card.scope.kind, card.scope.key, card.dashboard_uuid))
}

/**
 * At a glance: the insight cards this member pinned, or starter cards picked from what they do until they
 * pin their own. Each card opens its dashboard; pin and unpin from any dashboard card in Insights.
 */
export default function Glance({ data, orgslug, onUnpin }: { data: NonNullable<AdminHome['glance']>; orgslug: string; onUnpin: (card: GlanceCard) => void }) { // eslint-disable-line no-unused-vars
  const router = useRouter()
  const linkFor = React.useCallback((row: ResultRow) => row.link && (row.link.scope === 'plan' || row.link.scope === 'group' || row.link.scope === 'framework')
    ? getUriWithOrg(orgslug, admin.insightsScope(row.link.scope, row.link.key)) : null, [orgslug])
  if (!data.cards.length) return null
  return (
    <section aria-labelledby="glance-title">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id="glance-title" className="text-[15px] font-semibold text-gray-900">At a glance</h2>
        <Link href={getUriWithOrg(orgslug, admin.insights())} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Insights</Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.cards.map((card) => <div key={card.key} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
            <Link href={cardHref(orgslug, card)} className="truncate font-semibold text-gray-700 hover:underline">{card.scope.kind === 'org' ? card.dashboard_title || 'Organization' : card.scope.name}</Link>
            <span className="flex-1" />
            {card.source === 'pin' ? <button type="button" onClick={() => onUnpin(card)} className="shrink-0 font-semibold hover:text-gray-900">Unpin</button> : <span className="shrink-0">Starter card</span>}
          </div>
          <div className="grid grid-cols-12">
            <InsightCard card={{ ...card.card, span: 12 }} outcome={card.result} linkFor={linkFor} drill={() => router.push(cardHref(orgslug, card))} />
          </div>
        </div>)}
      </div>
      <p className="mt-2 text-xs text-gray-500">{data.starter ? 'Picked for you from your assignments and permissions. Pin your own from any dashboard and these step aside.' : 'Pin or unpin from any dashboard card in Insights.'}</p>
    </section>
  )
}
