'use client'
import React from 'react'
import { LockSimple } from '@phosphor-icons/react'
import AdminFeatureHeader, { type AdminFeatureTab } from '@components/Admin/AdminFeatureHeader'
import RequestAccessButton, { accessRequestLabel } from '@components/Admin/RequestAccessButton'
import { useFeatures } from '@components/Hooks/useFeatures'
import { adminLabel, adminTab, type AdminTabId } from '@/lib/admin/registry'
import { useTranslation } from 'react-i18next'

/** A registry tab's page: its header, then its content, or the request to unlock it when the org's plan or packages lack it. */
export default function AdminTabPage({ tab, tabs = [], activeTab, actions, variant, children }: {
  tab: AdminTabId
  tabs?: AdminFeatureTab[]
  activeTab?: string
  actions?: React.ReactNode
  /** The header's tab style; see AdminFeatureHeader. */
  variant?: 'pills' | 'underline'
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const features = useFeatures()
  const entry = adminTab(tab)
  const label = adminLabel(t, entry)
  const visibility = features.visibility(entry.requires)
  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <AdminFeatureHeader feature={label} tabs={tabs} activeTab={activeTab || tab} actions={actions} variant={variant} />
      {visibility.state === 'locked' ? (
        <div className="mx-auto mt-16 max-w-md rounded-xl bg-white p-8 text-center nice-shadow">
          <LockSimple size={28} weight="fill" className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm font-black text-gray-900">{label} needs the {accessRequestLabel(visibility.request)}</p>
          <p className="mt-1 text-xs text-gray-500">Ask for it here and we will follow up.</p>
          <RequestAccessButton request={visibility.request} className="mt-4 px-3 py-1.5 text-xs" />
        </div>
      ) : children}
    </div>
  )
}
