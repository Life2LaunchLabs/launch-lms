'use client'

import CoachShell from '@components/Admin/Platform/Coach/CoachShell'
import CoachKnowledge from '@components/Admin/Platform/Coach/CoachKnowledge'

export default function CoachKnowledgePage() {
  return <CoachShell active="knowledge">{(policy) => <CoachKnowledge policy={policy} />}</CoachShell>
}
