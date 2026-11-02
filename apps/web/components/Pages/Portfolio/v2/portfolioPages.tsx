import { notFound, redirect } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getMyPortfolio, getPublicPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { PortfolioV2 } from './PortfolioV2'
import { PortfolioDetail, type DetailView } from './PortfolioDetail'
import { PortfolioPeoplePage } from './PortfolioPeoplePage'
import { PortfolioDocumentsPage } from './PortfolioDocumentsPage'
import { PortfolioImportPage } from './PortfolioImportPage'
import { ResumeBuilder } from './ResumeBuilder'

// The portfolio's server pages.

type View = 'overview' | DetailView | 'resume'

/** The signed-in learner's own portfolio, or its visitor preview. */
export async function ownerPortfolioPage(orgslug: string, view: View = 'overview', preview = false) {
  const token = await getServerAccessToken()
  if (!token) redirect(view === 'overview' && !preview ? `${getUriWithOrg(orgslug, '/login')}?next=${encodeURIComponent(routePaths.org.portfolio())}` : getUriWithOrg(orgslug, '/'))
  const shell = await getMyPortfolio(token, preview)
  const username = shell.portfolio?.username
  return view === 'overview' ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={username} owner preview={preview} />
    : view === 'resume' ? <ResumeBuilder initialShell={shell} orgslug={orgslug} username={username} owner />
    : <PortfolioDetail view={view} initialShell={shell} orgslug={orgslug} username={username} owner />
}

/** Someone's portfolio as a visitor sees it. */
export async function publicPortfolioPage(orgslug: string, username: string, view: View = 'overview') {
  let shell
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    shell = await getPublicPortfolio(org.id, username, await getServerAccessToken())
  } catch { notFound() }
  return view === 'overview' ? <PortfolioV2 initialShell={shell} orgslug={orgslug} username={username} />
    : view === 'resume' ? <ResumeBuilder initialShell={shell} orgslug={orgslug} username={username} />
    : <PortfolioDetail view={view} initialShell={shell} orgslug={orgslug} username={username} />
}

/** My people, My documents and imports. */
export async function ownerRecordsPage(orgslug: string, page: 'people' | 'documents' | 'import') {
  const token = await getServerAccessToken()
  if (!token) redirect(getUriWithOrg(orgslug, '/'))
  if (page === 'import') return <PortfolioImportPage orgslug={orgslug} />
  const shell = await getMyPortfolio(token)
  return page === 'people' ? <PortfolioPeoplePage initialShell={shell} orgslug={orgslug} /> : <PortfolioDocumentsPage initialShell={shell} orgslug={orgslug} />
}
