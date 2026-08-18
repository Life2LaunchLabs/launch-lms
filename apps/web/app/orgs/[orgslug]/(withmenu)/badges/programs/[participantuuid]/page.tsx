import LearnerProgramsPage from '@components/Programs/LearnerPrograms'

export default async function ProgramPage({ params }: { params: Promise<{ orgslug: string; participantuuid: string }> }) {
  const { orgslug, participantuuid } = await params
  return <LearnerProgramsPage orgslug={orgslug} participantUuid={decodeURIComponent(participantuuid)} />
}
