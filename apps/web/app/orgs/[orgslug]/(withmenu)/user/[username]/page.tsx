import { publicPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PublicPortfolioPage({ params, searchParams }: { params: Promise<{ orgslug: string; username: string }>; searchParams: Promise<{ new?: string }> }) {
  const { orgslug, username } = await params
  return publicPortfolioPage(orgslug, username, searchParams)
}
