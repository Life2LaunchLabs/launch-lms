'use client'

import React from 'react'
import Link from 'next/link'
import { Storefront } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { MarketplaceType } from '@services/routing/paths'
import { cn } from '@/lib/utils'

/** The tab's main button (Create template, Create badge). */
export const primaryActionClass = 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-50'
/** A tab's other buttons (Add from marketplace). */
export const secondaryActionClass = 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 transition-colors hover:border-gray-300 hover:bg-gray-50'

/** "Add from marketplace": Plans › Marketplace, showing only this tab's kind of item. */
export function AddFromMarketplace({ type, className }: { type: MarketplaceType; className?: string }) {
  const org = useOrg() as { slug?: string } | null
  return <Link href={getUriWithOrg(org?.slug || '', routePaths.org.admin.marketplace({ type }))} className={cn(secondaryActionClass, className)}>
    <Storefront size={16} aria-hidden="true" />Add from marketplace
  </Link>
}
