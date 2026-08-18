import LearnerProgramsPage from '@components/Programs/LearnerPrograms'

export default async function ProgramsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <LearnerProgramsPage orgslug={orgslug} />
}
