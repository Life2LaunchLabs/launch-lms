import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { PortfolioV2 } from '@components/Pages/Portfolio/v2/PortfolioV2'
import { RememberPreviewChoice } from '@components/Pages/Portfolio/v2/PreviewSwitch'
import { PREVIEW_COOKIE, wantsPortfolioV2 } from '@components/Pages/Portfolio/v2/previewSwitch'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolio } from '@services/portfolio/portfolio'

export default async function PublicPortfolioPage({ params, searchParams }: { params: Promise<{ orgslug: string; username: string }>; searchParams: Promise<{ new?: string }> }) {
  const { orgslug, username } = await params
  let shell
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    shell = await getPublicPortfolio(org.id, username, await getServerAccessToken())
  } catch { notFound() }
  // Someone trying the new portfolio sees everyone's in it.
  const next = wantsPortfolioV2((await searchParams).new, (await cookies()).get(PREVIEW_COOKIE)?.value)
  return <>
    <RememberPreviewChoice />
    {next ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={username} /> : <PortfolioShell initialShell={shell} orgslug={orgslug} username={username} />}
  </>
}
