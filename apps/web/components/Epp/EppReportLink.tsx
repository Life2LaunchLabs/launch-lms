'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { FileText } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { routePaths } from '@services/routing/paths'
import { supportApi, supportKey } from '@services/school/support'

/**
 * Staff's one step to a learner's EPP report, from their profile header or their thread (FEED-212). Shows only
 * while the school supports them, since the report needs that; it shares the support status with the profile.
 */
export default function EppReportLink({ orgId, orgslug, userId, username, name, token, icon = false }: {
  orgId: number; orgslug: string; userId: number; username: string; name: string; token?: string; icon?: boolean
}) {
  const ready = Boolean(orgId && userId && token)
  const { data } = useSWR(ready ? supportKey(orgId, userId) : null, () => supportApi.status(orgId, userId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  if (data?.status !== 'active') return null
  const href = getUriWithOrg(orgslug, routePaths.org.admin.people.epp(username))
  if (icon) return <Link href={href} aria-label={`${name}'s EPP report`} title="EPP report"
    className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><FileText size={16} aria-hidden="true" /></Link>
  return <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted">
    <FileText size={16} aria-hidden="true" />EPP report
  </Link>
}
