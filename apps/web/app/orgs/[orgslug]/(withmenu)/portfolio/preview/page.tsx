import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { PortfolioV2 } from '@components/Pages/Portfolio/v2/PortfolioV2'
import { RememberPreviewChoice } from '@components/Pages/Portfolio/v2/PreviewSwitch'
import { PREVIEW_COOKIE, wantsPortfolioV2 } from '@components/Pages/Portfolio/v2/previewSwitch'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ new?: string }> }) {
  const { orgslug } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) redirect(getUriWithOrg(orgslug, '/'))
  const shell = await getMyPortfolio(token, true)
  const next = wantsPortfolioV2((await searchParams).new, (await cookies()).get(PREVIEW_COOKIE)?.value)
  return <>
    <RememberPreviewChoice />
    {next ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={session?.user?.username} owner preview />
      : <PortfolioShell initialShell={shell} orgslug={orgslug} username={session?.user?.username} owner preview />}
  </>
}
