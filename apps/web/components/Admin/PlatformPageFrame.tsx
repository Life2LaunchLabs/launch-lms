'use client'
import React from 'react'
import Link from 'next/link'
import { Buildings, ChartBar, Users } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

type PlatformSection = 'organizations' | 'users' | 'analytics'

const SECTIONS: {
  id: PlatformSection
  label: string
  icon: React.ReactNode
  href: string
}[] = [
  {
    id: 'organizations',
    label: 'Organizations',
    icon: <Buildings size={14} />,
    href: '/dash/org-management',
  },
  {
    id: 'users',
    label: 'Users',
    icon: <Users size={14} />,
    href: '/dash/org-management/users',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: <ChartBar size={14} />,
    href: '/dash/org-management/analytics',
  },
]

export default function PlatformPageFrame({
  title,
  description,
  activeSection,
  children,
}: {
  title: string
  description: string
  activeSection: PlatformSection
  children: React.ReactNode
}) {
  const org = useOrg() as any
  const isOwnerOrg = org?.slug === getDefaultOrg()

  if (!isOwnerOrg) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
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
      <div className="pl-10 pr-10 tracking-tight bg-[#fcfbfc] z-10 nice-shadow flex-shrink-0 relative">
        <div className="pt-6 pb-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Buildings size={14} />
            <span>Platform</span>
            <span>/</span>
            <span className="font-semibold text-gray-700">{title}</span>
          </div>
        </div>
        <div className="my-2 py-2">
          <div className="w-100 flex flex-col space-y-1">
            <div className="pt-3 flex font-bold text-4xl tracking-tighter">
              {title}
            </div>
            <div className="flex font-medium text-gray-400 text-md">
              {description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pb-5 pt-2">
          {SECTIONS.map((section) => {
            const isActive = section.id === activeSection
            return (
              <Link
                key={section.id}
                href={getUriWithOrg(org.slug, section.href)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {section.icon}
                <span className="font-medium">{section.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
      <div className="h-6 flex-shrink-0" />
      <div className="flex-1 overflow-y-auto px-10 py-4">{children}</div>
    </div>
  )
}
