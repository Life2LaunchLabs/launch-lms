import LearnerProgramsPage from '@components/Programs/LearnerPrograms'

export default async function ProgramPage({ params }: { params: Promise<{ orgslug: string; programslug: string }> }) {
  const { orgslug, programslug } = await params
  return <LearnerProgramsPage orgslug={orgslug} programSlug={decodeURIComponent(programslug)} />
}
