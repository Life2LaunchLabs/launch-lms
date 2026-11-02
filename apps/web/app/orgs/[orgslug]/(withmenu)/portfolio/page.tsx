import { ownerPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ new?: string }> }) {
  return ownerPortfolioPage((await params).orgslug, searchParams)
}
