'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachAbilities from '@components/Admin/Platform/Coach/CoachAbilities'

export default function CoachAbilitiesPage() {
  return <CoachShell active="abilities">{(policy) => <CoachAbilities policy={policy} />}</CoachShell>
}
