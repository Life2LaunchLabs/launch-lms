import BadgesHubPage from '@components/Badges/BadgesHubPage'

export default async function MyBadgesPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <BadgesHubPage orgslug={orgslug} initialTab="my-badges" />
}
