import EppReportPrint from '@components/Epp/EppReportPrint'

/** A supported learner's Education Plan and Profile report, to read or print. */
export default async function EppReportPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) {
  const { orgslug, username } = await params
  return <EppReportPrint orgslug={orgslug} username={decodeURIComponent(username)} />
}
