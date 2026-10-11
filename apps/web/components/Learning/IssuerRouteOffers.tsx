'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'

/** Which of a badge's ways to earn this issuer offers its learners. Offering none explicitly means offering all of them. */
export default function IssuerRouteOffers({ badgeUuid, issuerOrgId }: { badgeUuid?: string; issuerOrgId: number }) {
  const session = useLHSession() as any
  const token = session.data?.tokens?.access_token
  const { data, mutate } = useSWR(badgeUuid ? ['badge-routes', badgeUuid, token] : null, () => badgeRoutesApi.list(badgeUuid!, token))
  const [saving, setSaving] = React.useState(false)
  const routes: any[] = data?.routes || []
  if (!badgeUuid || !routes.length) return null
  const explicit: string[] | undefined = data?.offers?.[String(issuerOrgId)]
  const offered = new Set(explicit ?? routes.map((route) => route.route_uuid))

  const toggle = async (routeUuid: string, on: boolean) => {
    const next = routes.map((route) => route.route_uuid).filter((uuid) => (uuid === routeUuid ? on : offered.has(uuid)))
    if (!next.length) return toast.error('Offer at least one way to earn this badge.')
    setSaving(true)
    try {
      await badgeRoutesApi.setOffers(badgeUuid, issuerOrgId, next, token)
      await mutate()
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the ways you offer.')
    } finally {
      setSaving(false)
    }
  }

  return <fieldset className="mt-4" disabled={saving}>
    <legend className="text-xs font-bold uppercase text-muted-foreground">Ways you offer</legend>
    <div className="mt-2 flex flex-col gap-1.5">
      {routes.map((route) => <label key={route.route_uuid} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={offered.has(route.route_uuid)} onChange={(event) => void toggle(route.route_uuid, event.target.checked)} />
        <span className="font-semibold">{route.name}</span>
        <span className="text-xs text-muted-foreground">{route.step_count} steps{route.recommended ? ' · Recommended' : ''}</span>
      </label>)}
    </div>
  </fieldset>
}
