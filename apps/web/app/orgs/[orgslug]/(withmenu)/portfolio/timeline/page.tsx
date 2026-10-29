import { ownerPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export default async function PortfolioTimelinePage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ new?: string }> }) {
  return ownerPortfolioPage((await params).orgslug, searchParams, 'timeline')
}
