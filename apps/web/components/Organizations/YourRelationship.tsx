'use client'

import useSWR from 'swr'
import { ArrowRight } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { Button } from '@components/ui/button'
import { swrFetcher } from '@services/utils/ts/requests'
import { membershipKeys, statusLine, type Relationship } from '@services/organizations/membership'

const MAX_FACES = 6

/**
 * A member's relationship with an organization: whether it counts them active or alumni, since when, and (unless ``showStaff`` is off) the staff they work with.
 * Given ``staffHref``, staff also get a button to the organization's staff pages, so a teacher who
 * found their school here isn't left with only Edit page and Message (DEV-42, FEED-287).
 */
export default function YourRelationship({ orgId, token, showStaff = true, staffHref }: { orgId: number; token?: string; showStaff?: boolean; staffHref?: string }) {
  const { data } = useSWR<Relationship>(orgId && token ? membershipKeys.relationship(orgId) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  if (!data) return <p className="mb-4 text-sm text-muted-foreground">You are a member of this organization.</p>
  const since = data.member_since ? new Date(data.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null
  const shown = showStaff ? data.staff.slice(0, MAX_FACES) : []
  return <div className="mb-4 space-y-2 text-sm">
    <p className="font-semibold text-foreground">
      {data.role === 'staff' ? 'Staff' : `Member · ${statusLine(data.status, data.status_since)}`}
    </p>
    {since ? <p className="text-muted-foreground">Member since {since}{data.plans.length ? ` · ${data.plans.length} ${data.plans.length === 1 ? 'plan' : 'plans'} from them` : ''}</p> : null}
    {data.role === 'staff' && staffHref ? <Button asChild variant="brand" size="sm" className="mt-1"><a href={staffHref}>Go to your staff pages<ArrowRight size={16} aria-hidden="true" /></a></Button> : null}
    {data.status === 'alumni' ? <p className="text-muted-foreground">You keep your plans and records. Ask the organization if you&rsquo;d like to be active again.</p> : null}
    {shown.length ? <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Staff you work with</p>
      <ul className="flex flex-wrap gap-2">{shown.map((person) => <li key={person.id} className="inline-flex items-center gap-1.5">
        <PersonAvatar user={person as any} size="xs" /><span className="text-foreground">{person.name}</span>
      </li>)}</ul>
      {shown.length && data.staff.length > shown.length ? <p className="mt-1 text-xs text-muted-foreground">and {data.staff.length - shown.length} more</p> : null}
    </div> : null}
  </div>
}
