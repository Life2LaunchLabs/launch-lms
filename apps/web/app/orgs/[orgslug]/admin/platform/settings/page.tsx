'use client'

import React from 'react'
import PlatformSettings from '@components/Admin/Platform/PlatformSettings'
import PlatformShell from '@components/Admin/Platform/PlatformShell'

export default function PlatformSettingsPage() {
  return (
    <PlatformShell title="Settings" activeSection="settings">
      <PlatformSettings />
    </PlatformShell>
  )
}
