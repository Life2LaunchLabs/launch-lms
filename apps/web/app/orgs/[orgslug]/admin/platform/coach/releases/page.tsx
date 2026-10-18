'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachReleases from '@components/Admin/Platform/Coach/CoachReleases'

export default function CoachReleasesPage() {
  return <CoachShell active="releases">{() => <CoachReleases />}</CoachShell>
}
