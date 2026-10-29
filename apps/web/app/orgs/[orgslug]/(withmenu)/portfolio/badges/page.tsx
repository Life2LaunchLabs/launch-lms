import { ownerPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PortfolioBadgesPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ new?: string }> }) {
  return ownerPortfolioPage((await params).orgslug, searchParams, 'badges')
}
