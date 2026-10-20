'use client'
import React from 'react'
import Link from 'next/link'
import {
  PlusCircle,
  GearSix,
  Users,
} from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { routePaths } from '@services/config/config'
import { useFeatures } from '@components/Hooks/useFeatures'
import RequestAccessButton from '@components/Admin/RequestAccessButton'
import { ADMIN_HOME_WIDGETS, adminTab, type AdminTabId, type AdminWidgetId } from '@/lib/admin/registry'
import RecentCourses from './RecentCourses'
import RecentMembers from './RecentMembers'
import ContentOverview from './ContentOverview'

const WIDGETS: Record<AdminWidgetId, React.ComponentType> = {
  'content-overview': ContentOverview,
  'recent-badges': RecentCourses,
  'recent-members': RecentMembers,
}

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: 'bg-gray-100', text: 'text-gray-600' },
  standard: { bg: 'bg-blue-100', text: 'text-blue-700' },
  pro: { bg: 'bg-purple-100', text: 'text-purple-700' },
  enterprise: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

export default function DashboardHome() {
  const session = useLHSession() as any
  const org = useOrg() as any

  const username = session?.data?.user?.username || ''

  const features = useFeatures()
  const plan = features.plan
  const opens = (tab: AdminTabId) => features.visibility(adminTab(tab).requires).state === 'open'
  const planStyle = PLAN_COLORS[plan] || PLAN_COLORS.free

  return (
    <div className="h-full w-full bg-[#f8f8f8]">
      <div className="px-10 pt-8 pb-10">
        <div className="space-y-6 max-w-[1600px] mx-auto w-full">
          {/* Welcome Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back{username ? `, ${username}` : ''}
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${planStyle.bg} ${planStyle.text}`}
                >
                  {`${plan} plan`}
                </span>
                {org?.name && (
                  <span className="text-xs text-gray-400">{org.name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {opens('badges') && <Link
                href={routePaths.org.admin.badges() + '?new=true'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <PlusCircle size={14} weight="bold" />
                Create Badge
              </Link>}
              {opens('people') && <Link
                href={routePaths.org.admin.people.root()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg nice-shadow hover:bg-gray-50 transition-colors"
              >
                <Users size={14} weight="bold" />
                Members
              </Link>}
              {opens('organization') && <Link
                href={routePaths.org.admin.organization.general()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg nice-shadow hover:bg-gray-50 transition-colors"
              >
                <GearSix size={14} weight="bold" />
                Settings
              </Link>}
            </div>
          </div>

          {/* Home widgets come from the admin registry, gated like the tabs. */}
          <div className="space-y-6">
            {ADMIN_HOME_WIDGETS.map((widget) => {
              const visibility = features.visibility(widget.requires)
              if (visibility.state === 'hidden') return null
              if (visibility.state === 'locked') {
                return (
                  <div key={widget.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-5 py-4 nice-shadow">
                    <span className="text-sm font-semibold text-gray-400">{widget.label}</span>
                    <RequestAccessButton request={visibility.request} />
                  </div>
                )
              }
              const Widget = WIDGETS[widget.id]
              return <Widget key={widget.id} />
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
