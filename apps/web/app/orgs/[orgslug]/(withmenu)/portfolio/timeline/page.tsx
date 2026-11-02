import { ownerPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PortfolioTimelinePage({ params }: { params: Promise<{ orgslug: string }> }) {
  return ownerPortfolioPage((await params).orgslug, 'timeline')
}
