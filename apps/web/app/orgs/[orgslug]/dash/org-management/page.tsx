'use client'
import React from 'react'
import OrganizationList from '@components/Admin/OrganizationList'
import PlatformPageFrame from '@components/Admin/PlatformPageFrame'

export default function OrgManagementPage() {
  return (
    <PlatformPageFrame
      title="Org Management"
      description="Create and manage all organizations on this platform"
      activeSection="organizations"
    >
      <OrganizationList basePath="/dash/org-management" lightTheme />
    </PlatformPageFrame>
  )
}
