'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import UserDetail from '@components/Admin/Platform/UserDetail'

export default function PlatformUserDetailPage() {
  return (
    <PlatformShell title="Users" activeSection="users">
      <UserDetail />
    </PlatformShell>
  )
}
