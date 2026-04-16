'use client'
import React from 'react'
import { use } from 'react'
import { usePlan } from '@components/Hooks/usePlan'
import OrganizationList from '@components/Admin/OrganizationList'
import { Buildings } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'

export default function OrgManagementPage(props: { params: Promise<{ orgslug: string }> }) {
  const params = use(props.params)
  const plan = usePlan()
  const org = useOrg() as any

  if (plan !== 'master') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <Buildings size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Platform management is only available for the Master org.</p>
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
            <span className="font-semibold text-gray-700">Org Management</span>
          </div>
        </div>
        <div className="my-2 py-2">
          <div className="w-100 flex flex-col space-y-1">
            <div className="pt-3 flex font-bold text-4xl tracking-tighter">
              Org Management
            </div>
            <div className="flex font-medium text-gray-400 text-md">
              Create and manage all organizations on this platform
            </div>
          </div>
        </div>
      </div>
      <div className="h-6 flex-shrink-0" />
      <div className="flex-1 overflow-y-auto px-10 py-4">
        <OrganizationList />
      </div>
    </div>
  )
}
