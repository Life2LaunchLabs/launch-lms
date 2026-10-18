'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachTests from '@components/Admin/Platform/Coach/CoachTests'

export default function CoachTestsPage() {
  return <CoachShell active="tests">{(policy) => <CoachTests policy={policy} />}</CoachShell>
}
