'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Map as MapIcon } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { lifeApi, lifeUrl } from '@services/life/life'

/** The plans other people shared with you from their My people, as links to each one. Nothing when there are none. */
export default function SharedWithYou({ token }: { token?: string }) {
  const org = useOrg() as any
  const { data } = useSWR(token ? lifeUrl('/shared') : null, () => lifeApi.sharedWithMe(token), { revalidateOnFocus: false })
  const people = data?.people || []
  if (!people.length || !org?.slug) return null
  return <nav aria-label="Plans shared with you" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
    <span className="font-bold text-muted-foreground">Shared with you:</span>
    {people.map((person) => <Link key={person.user_uuid} href={getUriWithOrg(org.slug, routePaths.org.sharedPlan(person.user_uuid || ''))} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-bold hover:bg-raised">
      <MapIcon className="h-3.5 w-3.5" />{person.name || `@${person.username}`}
    </Link>)}
  </nav>
}
