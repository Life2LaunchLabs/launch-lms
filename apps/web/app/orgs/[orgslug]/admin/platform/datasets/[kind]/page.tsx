'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import DatasetDetail from '@components/Admin/Platform/DatasetDetail'

export default function PlatformDatasetPage() {
  return (
    <PlatformShell title="Datasets" activeSection="datasets">
      <DatasetDetail />
    </PlatformShell>
  )
}
