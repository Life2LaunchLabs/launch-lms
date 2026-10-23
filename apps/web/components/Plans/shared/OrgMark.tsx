'use client'

import React from 'react'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { cn } from '@/lib/utils'

export type OrgMarkSource = { name?: string | null; org_uuid?: string | null; logo_image?: string | null }

const TINTS = ['#0B8077', '#2F66D6', '#6B3FE0', '#C8327D', '#C9501E', '#1A86AE']

/** An organization's logo in a small rounded square, else its initials on a color picked from its name. */
export function OrgMark({ org, className }: { org: OrgMarkSource; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  const name = org.name || '?'
  if (org.logo_image && org.org_uuid && !failed) {
    return <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted', className)}>
      <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain p-0.5" />
    </span>
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  const tint = TINTS[[...name].reduce((total, char) => total + char.charCodeAt(0), 0) % TINTS.length]
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-md text-[8.5px] font-extrabold text-white', className)} style={{ background: tint }}>{initials}</span>
}
