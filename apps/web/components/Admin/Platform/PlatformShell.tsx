'use client'
import React from 'react'
import {
  Buildings,
  ChartPie,
  Gear,
  Flag,
  Flask,
  Newspaper,
  Tray,
  UsersThree,
} from '@phosphor-icons/react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import { useOrg } from '@components/Contexts/OrgContext'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'
import { platformSections, type PlatformSection } from './platformSections'

export type { PlatformSection }

const ICONS: Record<PlatformSection, React.ReactNode> = {
  overview: <ChartPie size={14} />,
  organizations: <Buildings size={14} />,
  users: <UsersThree size={14} />,
  requests: <Tray size={14} />,
  feedback: <Flag size={14} />,
  demo: <Flask size={14} />,
  settings: <Gear size={14} />,
  news: <Newspaper size={14} />,
}

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
        tabs={platformSections().map((section) => ({
          id: section.id,
          label: section.label,
          icon: ICONS[section.id],
          href: org?.slug ? getUriWithOrg(org.slug, section.href) : section.href,
        }))}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
    </div>
  )
}
