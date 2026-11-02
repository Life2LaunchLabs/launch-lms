import { publicPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PublicBadgesPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) {
  const { orgslug, username } = await params
  return publicPortfolioPage(orgslug, username, 'badges')
}
