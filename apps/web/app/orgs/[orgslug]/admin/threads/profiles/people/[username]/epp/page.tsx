import SchoolRecordsGate from '@components/Epp/SchoolRecordsGate'
import EppReportPrint from '@components/Epp/EppReportPrint'

/** A supported learner's Education Plan and Profile report, to read or print. */
export default async function EppReportPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) {
  const { orgslug, username } = await params
  return <SchoolRecordsGate orgslug={orgslug}><EppReportPrint orgslug={orgslug} username={decodeURIComponent(username)} /></SchoolRecordsGate>
}
