'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import UsersTable from '@components/Admin/Platform/UsersTable'

export default function PlatformUsersPage() {
  return (
    <PlatformShell title="Users" activeSection="users">
      <UsersTable />
    </PlatformShell>
  )
}
