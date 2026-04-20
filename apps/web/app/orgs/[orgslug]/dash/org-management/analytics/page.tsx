'use client'
import React from 'react'
import GlobalAnalytics from '@components/Admin/GlobalAnalytics'
import PlatformPageFrame from '@components/Admin/PlatformPageFrame'

export default function OrgManagementAnalyticsPage() {
  return (
    <PlatformPageFrame
      title="Platform Analytics"
      description="Review cross-organization usage and platform-wide activity trends"
      activeSection="analytics"
    >
      <GlobalAnalytics days={30} lightTheme />
    </PlatformPageFrame>
  )
}
