import { Suspense } from 'react'
import { PhaseSuggestionsPage } from '@components/Goals/phases/PhaseSuggestions'

type Props = { params: Promise<{ orgslug: string; phaseId: string }> }

/** See more for a phase: shelves of resources picked for it, each with its reason, and what's saved to it. */
export default async function PlanPhaseSuggestionsPage({ params }: Props) {
  const { orgslug, phaseId } = await params
  return <Suspense><PhaseSuggestionsPage orgslug={orgslug} phaseId={decodeURIComponent(phaseId)} /></Suspense>
}
