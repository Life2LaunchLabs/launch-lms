'use client'

import useSWR from 'swr'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { MARKETPLACE_KEY, templateMarketplaceApi } from '@services/learning/marketplace'

/** How many requests wait on an admin under a sidebar entry: other organizations asking to run your plans, on Plans. */
export default function NavCount({ id }: { id: string }) {
  const { orgId, token, admin } = useStaff()
  const ready = id === 'plans' && admin && Boolean(orgId && token)
  // Same key as the Plans tabs' count, so answering a request clears both.
  const { data } = useSWR(ready ? [MARKETPLACE_KEY, 'summary', orgId, token] : null, () => templateMarketplaceApi.summary(orgId, token), { revalidateOnFocus: true })
  const count = data?.incoming_requested || 0
  if (!count) return null
  return <span aria-label={`${count} ${count === 1 ? 'request' : 'requests'} waiting`} className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-black">{count}</span>
}
