'use client'
import React from 'react'
import UserList from '@components/Admin/UserList'
import PlatformPageFrame from '@components/Admin/PlatformPageFrame'

export default function OrgManagementUsersPage() {
  return (
    <PlatformPageFrame
      title="Platform Users"
      description="Manage users with cross-organization access and platform-level permissions"
      activeSection="users"
    >
      <UserList lightTheme />
    </PlatformPageFrame>
  )
}
