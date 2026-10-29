import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { PortfolioShell } from '../PortfolioShell'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getMyPortfolio, getPublicPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { PortfolioV2 } from './PortfolioV2'
import { PortfolioDetail, type DetailView } from './PortfolioDetail'
import { PortfolioPeoplePage } from './PortfolioPeoplePage'
import { PortfolioDocumentsPage } from './PortfolioDocumentsPage'
import { RememberPreviewChoice, TryNewPortfolio } from './PreviewSwitch'
import { PREVIEW_COOKIE, wantsPortfolioV2 } from './previewSwitch'

// The portfolio's server pages, each picking the current or the new design from the preview switch.

type View = 'overview' | DetailView
type Query = Promise<{ new?: string }>

async function wantsNew(searchParams: Query) {
  return wantsPortfolioV2((await searchParams).new, (await cookies()).get(PREVIEW_COOKIE)?.value)
}

/** The signed-in learner's own portfolio, or its visitor preview. */
export async function ownerPortfolioPage(orgslug: string, searchParams: Query, view: View = 'overview', preview = false) {
  const token = await getServerAccessToken()
  if (!token) redirect(view === 'overview' && !preview ? `${getUriWithOrg(orgslug, '/login')}?next=${encodeURIComponent(routePaths.org.portfolio())}` : getUriWithOrg(orgslug, '/'))
  const shell = await getMyPortfolio(token, preview)
  const username = shell.portfolio?.username
  const next = await wantsNew(searchParams)
  return <>
    <RememberPreviewChoice />
    {next ? view === 'overview' ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={username} owner preview={preview} /> : <PortfolioDetail view={view} initialShell={shell} orgslug={orgslug} username={username} owner />
      : <>{view === 'overview' && !preview ? <TryNewPortfolio /> : null}<PortfolioShell initialShell={shell} orgslug={orgslug} username={username} owner preview={preview} active={view} /></>}
  </>
}

/** Someone's portfolio as a visitor sees it. Someone trying the new portfolio sees everyone's in it. */
export async function publicPortfolioPage(orgslug: string, username: string, searchParams: Query, view: View = 'overview') {
  let shell
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    shell = await getPublicPortfolio(org.id, username, await getServerAccessToken())
  } catch { notFound() }
  const next = await wantsNew(searchParams)
  return <>
    <RememberPreviewChoice />
    {next ? view === 'overview' ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={username} /> : <PortfolioDetail view={view} initialShell={shell} orgslug={orgslug} username={username} />
      : <PortfolioShell initialShell={shell} orgslug={orgslug} username={username} active={view} />}
  </>
}

/** My people and My documents have no page in the current design, so they're always the new one. */
export async function ownerRecordsPage(orgslug: string, page: 'people' | 'documents') {
  const token = await getServerAccessToken()
  if (!token) redirect(getUriWithOrg(orgslug, '/'))
  const shell = await getMyPortfolio(token)
  return page === 'people' ? <PortfolioPeoplePage initialShell={shell} orgslug={orgslug} /> : <PortfolioDocumentsPage initialShell={shell} orgslug={orgslug} />
}
