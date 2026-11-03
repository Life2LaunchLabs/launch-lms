import { ownerPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PreviewPage({ params }: { params: Promise<{ orgslug: string }> }) {
  return ownerPortfolioPage((await params).orgslug, 'overview', true)
}
