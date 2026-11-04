import { ownerRecordsPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PortfolioResultsRoute({ params }: { params: Promise<{ orgslug: string }> }) {
  return ownerRecordsPage((await params).orgslug, 'results')
}
