'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import EstimateSources from '@components/Admin/Platform/EstimateSources'

export default function PlatformEstimatesPage() {
  return (
    <PlatformShell title="Estimates" activeSection="estimates">
      <EstimateSources />
    </PlatformShell>
  )
}
