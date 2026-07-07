'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import OrgsTable from '@components/Admin/Platform/OrgsTable'

export default function PlatformOrgsPage() {
  return (
    <PlatformShell title="Organizations" activeSection="organizations">
      <OrgsTable />
    </PlatformShell>
  )
}
