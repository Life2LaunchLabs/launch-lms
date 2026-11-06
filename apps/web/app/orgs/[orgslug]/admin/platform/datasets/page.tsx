'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import Datasets from '@components/Admin/Platform/Datasets'

export default function PlatformDatasetsPage() {
  return (
    <PlatformShell title="Datasets" activeSection="datasets">
      <Datasets />
    </PlatformShell>
  )
}
