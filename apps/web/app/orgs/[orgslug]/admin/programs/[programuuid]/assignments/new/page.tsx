import ProgramAssignmentWizard from '@components/Admin/Programs/ProgramAssignmentWizard'

export default async function NewProgramAssignmentPage({ params, searchParams }: { params: Promise<{ orgslug: string; programuuid: string }>; searchParams: Promise<{ groupId?: string }> }) {
  const { orgslug, programuuid } = await params
  const { groupId } = await searchParams
  return <ProgramAssignmentWizard orgslug={orgslug} programUuid={decodeURIComponent(programuuid)} initialGroupId={groupId} />
}
