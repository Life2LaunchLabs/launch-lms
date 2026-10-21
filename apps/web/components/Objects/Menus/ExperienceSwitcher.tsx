'use client'
import React from 'react'
import Link from 'next/link'
import { CaretUpDown, Check, House } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { useAdminOrganizations, type AdminOrganization } from '@components/Hooks/useAdminOrganizations'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { authenticatedOrgHref } from '@services/auth/handoff'
import { cn } from '@/lib/utils'

export type ExperienceLocation = { side: 'user' } | { side: 'admin'; orgslug: string }

const TONES = {
  light: {
    content: 'w-72 p-1',
    label: 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
    item: 'flex items-center gap-3 rounded-md px-3 py-2',
    separator: '',
    caret: 'text-muted-foreground',
    mark: 'bg-foreground/[0.06] text-foreground',
  },
  dark: {
    content: 'w-72 border-white/10 bg-[#1a1a1b] p-1 text-white shadow-xl shadow-black/25',
    label: 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/40',
    item: 'flex items-center gap-3 rounded-md px-3 py-2 text-white/70 focus:bg-white/[0.08] focus:text-white',
    separator: 'bg-white/[0.08]',
    caret: 'text-white/30',
    mark: 'bg-white/[0.08] text-white',
  },
}

/**
 * The logo spot at the top of the user sidebar and the admin shell. For anyone who can open an org dashboard
 * it is a switcher between the user experience and each of those orgs; for everyone else it stays a home link.
 */
export default function ExperienceSwitcher({
  current,
  homeHref,
  tone,
  className,
  side = 'bottom',
  align = 'start',
  showCaret = true,
  ariaLabel,
  children,
}: {
  current: ExperienceLocation
  homeHref: string
  tone: 'light' | 'dark'
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  showCaret?: boolean
  ariaLabel?: string
  children: React.ReactNode
}) {
  const { orgs } = useAdminOrganizations()
  const styles = TONES[tone]

  // From an org dashboard the user experience is always somewhere to go; from the user side it takes an org to manage.
  if (current.side === 'user' && orgs.length === 0) {
    return <Link href={homeHref} aria-label={ariaLabel} className={className}>{children}</Link>
  }

  const userHref = authenticatedOrgHref(getUriWithOrg(getDefaultOrg(), routePaths.org.root()), true)
  const isCurrentOrg = (org: AdminOrganization) => current.side === 'admin' && current.orgslug === org.slug

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={ariaLabel ? `${ariaLabel}, switch view` : 'Switch view'} className={cn('group/switcher text-left', className)}>
          {children}
          {showCaret && <CaretUpDown aria-hidden="true" size={14} weight="bold" className={cn('ml-auto shrink-0 transition-opacity group-hover/switcher:opacity-100 opacity-60', styles.caret)} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={8} className={styles.content}>
        <DropdownMenuItem asChild className={styles.item}>
          <a href={userHref}>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', styles.mark)}>
              <House size={16} weight="fill" />
            </span>
            <span className="flex-1 truncate text-sm font-medium">User experience</span>
            {current.side === 'user' && <Check size={16} weight="bold" className="text-green-500" />}
          </a>
        </DropdownMenuItem>
        {orgs.length > 0 && (
          <>
            <DropdownMenuSeparator className={styles.separator} />
            <DropdownMenuLabel className={styles.label}>Manage</DropdownMenuLabel>
            <div className="max-h-80 overflow-y-auto [scrollbar-width:thin]">
              {orgs.map((org) => (
                <DropdownMenuItem key={org.org_uuid} asChild className={styles.item}>
                  <a
                    href={authenticatedOrgHref(getUriWithOrg(org.slug, routePaths.org.admin.root()), true)}
                    aria-current={isCurrentOrg(org) ? 'page' : undefined}
                  >
                    <OrgMark org={org} className={styles.mark} />
                    <span className="flex-1 truncate text-sm font-medium">{org.name}</span>
                    {isCurrentOrg(org) && <Check size={16} weight="bold" className="text-green-500" />}
                  </a>
                </DropdownMenuItem>
              ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function OrgMark({ org, className }: { org: AdminOrganization; className: string }) {
  if (org.logo_image) {
    return <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
  }
  return (
    <span aria-hidden="true" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold', className)}>
      {org.name?.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
