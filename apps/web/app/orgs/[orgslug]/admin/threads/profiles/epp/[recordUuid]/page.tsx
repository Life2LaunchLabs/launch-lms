import EppRecordView from '@components/Epp/EppRecords'

/** A frozen Education Plan and Profile record the school keeps. */
export default async function EppRecordPage({ params }: { params: Promise<{ orgslug: string; recordUuid: string }> }) {
  const { orgslug, recordUuid } = await params
  return <EppRecordView orgslug={orgslug} recordUuid={decodeURIComponent(recordUuid)} />
}
