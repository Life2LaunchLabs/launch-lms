'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import OrgDetail from '@components/Admin/Platform/OrgDetail'

export default function PlatformOrgDetailPage() {
  return (
    <PlatformShell title="Organizations" activeSection="organizations">
      <OrgDetail />
    </PlatformShell>
  )
}
