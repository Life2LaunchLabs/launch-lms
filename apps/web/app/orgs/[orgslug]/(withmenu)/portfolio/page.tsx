import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { PortfolioV2 } from '@components/Pages/Portfolio/v2/PortfolioV2'
import { RememberPreviewChoice, TryNewPortfolio } from '@components/Pages/Portfolio/v2/PreviewSwitch'
import { PREVIEW_COOKIE, wantsPortfolioV2 } from '@components/Pages/Portfolio/v2/previewSwitch'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg, routePaths } from '@services/config/config'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ new?: string }> }) {
  const { orgslug } = await params
  const token = await getServerAccessToken()
  if (!token) redirect(`${getUriWithOrg(orgslug, '/login')}?next=${encodeURIComponent(routePaths.org.portfolio())}`)
  const shell = await getMyPortfolio(token)
  const next = wantsPortfolioV2((await searchParams).new, (await cookies()).get(PREVIEW_COOKIE)?.value)
  return <>
    <RememberPreviewChoice />
    {next ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={shell.portfolio?.username} owner />
      : <><TryNewPortfolio /><PortfolioShell initialShell={shell} orgslug={orgslug} username={shell.portfolio?.username} owner /></>}
  </>
}
