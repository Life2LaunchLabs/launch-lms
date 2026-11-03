import { ownerPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage({ params }: { params: Promise<{ orgslug: string }> }) {
  return ownerPortfolioPage((await params).orgslug)
}
