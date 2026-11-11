'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'

type LinkableOrg = { slug?: string | null; name: string; listed?: boolean | null }

/** An organization's public page, when it's listed (open to anyone); otherwise null, so callers show plain text. */
export function orgPageHref(orgslug: string, org: LinkableOrg | null | undefined): string | null {
  return org?.listed && org.slug ? getUriWithOrg(orgslug, routePaths.org.organization(org.slug)) : null
}

/**
 * An organization's name that opens its public page. Unlisted pages are members-only,
 * so their names stay plain text rather than leading to a page the viewer can't open.
 */
export default function OrgLink({ org, orgslug, className, children }: { org: LinkableOrg; orgslug: string; className?: string; children?: React.ReactNode }) {
  const href = orgPageHref(orgslug, org)
  const label = children ?? org.name
  if (!href) return <span className={className}>{label}</span>
  return <Link href={href} className={cn('text-inherit underline-offset-2 hover:underline', className)}>{label}</Link>
}
