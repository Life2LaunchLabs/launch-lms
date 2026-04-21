'use client'
import React from 'react'
import { Buildings } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import OrganizationDetail from '@components/Admin/OrganizationDetail'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function OrgManagementDetailPage() {
  const org = useOrg() as any
  const isOwnerOrg = org?.slug === getDefaultOrg()

  if (!isOwnerOrg) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <Buildings size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Platform management is only available from the owner organization.</p>
        </div>
      </div>
    )
  }

  return <OrganizationDetail backHref={getUriWithOrg(org.slug, '/dash/org-management')} lightTheme />
}
