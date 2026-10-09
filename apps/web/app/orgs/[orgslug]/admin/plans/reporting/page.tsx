import ProgramsAdminPage from '@components/Admin/Programs/ProgramsAdminPage'

export default async function PlanReportingPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <ProgramsAdminPage orgslug={orgslug} rootTab="reporting" />
}
