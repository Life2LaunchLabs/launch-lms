import ProgramAssignmentWizard from '@components/Admin/Programs/ProgramAssignmentWizard'

export default async function NewProgramAssignmentPage({ params }: { params: Promise<{ orgslug: string; programuuid: string }> }) {
  const { orgslug, programuuid } = await params
  return <ProgramAssignmentWizard orgslug={orgslug} programUuid={decodeURIComponent(programuuid)} />
}
