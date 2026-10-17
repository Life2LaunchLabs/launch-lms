'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachRoutines from '@components/Admin/Platform/Coach/CoachRoutines'

export default function CoachRoutinesPage() {
  return <CoachShell active="routines">{(policy) => <CoachRoutines policy={policy} />}</CoachShell>
}
