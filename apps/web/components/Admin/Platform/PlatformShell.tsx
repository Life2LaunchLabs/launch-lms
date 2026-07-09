'use client'
import React from 'react'
import {
  Buildings,
  ChartPie,
  Newspaper,
  Tray,
  UsersThree,
} from '@phosphor-icons/react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
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
      <AdminFeatureHeader
        feature="Platform"
        activeTab={activeSection}
        tone="platform"
        actions={actions}
        tabs={SECTIONS.map((section) => ({
          ...section,
          href: org?.slug ? getUriWithOrg(org.slug, section.href) : section.href,
        }))}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
    </div>
  )
}
