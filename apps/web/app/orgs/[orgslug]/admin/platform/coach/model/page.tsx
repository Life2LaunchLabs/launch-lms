'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachModel from '@components/Admin/Platform/Coach/CoachModel'

export default function CoachModelPage() {
  return <CoachShell active="model">{(policy) => <CoachModel policy={policy} />}</CoachShell>
}
