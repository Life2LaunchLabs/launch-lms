'use client'
import React from 'react'
import Link from 'next/link'
import {
  Buildings,
  ChartPie,
  Newspaper,
  Tray,
  UsersThree,
} from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export type PlatformSection =
  | 'overview'
  | 'organizations'
  | 'users'
  | 'requests'
  | 'news'

const SECTIONS: {
  id: PlatformSection
  label: string
  icon: React.ReactNode
  href: string
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: <ChartPie size={14} />,
    href: '/admin/platform',
  },
  {
    id: 'organizations',
    label: 'Organizations',
    icon: <Buildings size={14} />,
    href: '/admin/platform/orgs',
  },
  {
    id: 'users',
    label: 'Users',
    icon: <UsersThree size={14} />,
    href: '/admin/platform/users',
  },
  {
    id: 'requests',
    label: 'Requests',
    icon: <Tray size={14} />,
    href: '/admin/platform/requests',
  },
  {
    id: 'news',
    label: 'News',
    icon: <Newspaper size={14} />,
    href: '/admin/news',
  },
]

export default function PlatformShell({
  title,
  activeSection,
  actions,
  children,
}: {
  title: string
  activeSection: PlatformSection
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const org = useOrg() as any
  const isOwnerOrg = org?.slug === getDefaultOrg()

  if (org && !isOwnerOrg) {
    return (
      <div className="flex items-center justify-center h-full w-full text-gray-500">
        <div className="text-center">
          <Buildings size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">
            Platform management is only available from the owner organization.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      {/* Compact header: breadcrumb + title + section tabs on one bar */}
      <div className="bg-white nice-shadow z-10 flex-shrink-0">
        <div className="px-8 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-600 bg-amber-50 rounded-md px-2 py-1">
              <Buildings size={12} weight="fill" />
              Platform
            </span>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight truncate">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1">
              {SECTIONS.map((section) => {
                const isActive = section.id === activeSection
                return (
                  <Link
                    key={section.id}
                    href={org?.slug ? getUriWithOrg(org.slug, section.href) : section.href}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {section.icon}
                    <span>{section.label}</span>
                  </Link>
                )
              })}
            </nav>
            {actions}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
    </div>
  )
}
