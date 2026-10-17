'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachMethod from '@components/Admin/Platform/Coach/CoachMethod'

export default function CoachMethodPage() {
  return <CoachShell active="method">{(policy) => <CoachMethod policy={policy} />}</CoachShell>
}
