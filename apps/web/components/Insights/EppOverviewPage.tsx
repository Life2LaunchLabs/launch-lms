'use client'

import SchoolRecordsGate from '@components/Epp/SchoolRecordsGate'
import EppOverview from './EppOverview'
import InsightsShell from './InsightsShell'

/** Insights › Education plans, inside the Insights rail; absent while the organization has school records off. */
export default function EppOverviewPage({ orgslug, group }: { orgslug: string; group: string | null }) {
  return <InsightsShell place="epp"><SchoolRecordsGate orgslug={orgslug}><EppOverview group={group} /></SchoolRecordsGate></InsightsShell>
}
