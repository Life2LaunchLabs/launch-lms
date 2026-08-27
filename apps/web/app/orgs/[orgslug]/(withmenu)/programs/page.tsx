import BadgesHubPage from '@components/Badges/BadgesHubPage'

export default async function ProgramsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <BadgesHubPage orgslug={orgslug} initialTab="programs" />
}
