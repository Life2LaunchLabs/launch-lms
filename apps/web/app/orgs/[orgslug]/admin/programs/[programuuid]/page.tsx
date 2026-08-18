import ProgramsAdminPage from '@components/Admin/Programs/ProgramsAdminPage'

export default async function ProgramPage({ params }: { params: Promise<{ orgslug: string; programuuid: string }> }) {
  const { orgslug, programuuid } = await params
  return <ProgramsAdminPage orgslug={orgslug} programUuid={decodeURIComponent(programuuid)} />
}
