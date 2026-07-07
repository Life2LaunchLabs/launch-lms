'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import RequestsQueue from '@components/Admin/Platform/RequestsQueue'

export default function PlatformRequestsPage() {
  return (
    <PlatformShell title="Requests" activeSection="requests">
      <RequestsQueue />
    </PlatformShell>
  )
}
