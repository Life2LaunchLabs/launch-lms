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
import { PageTitleRegistration } from '@components/Contexts/PageTitleContext'
import { ExperiencePage } from './ExperiencePage'
import { ProjectPage } from './ProjectPage'

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

/**
 * One experience or project on its own page, where the owner makes and edits it in place. No uuid is a new
 * one; `type` picks the experience type, `experience` the experience a new project came from, and `mark` is
 * the quest step that sent them, shown on the button that finishes it.
 */
export async function ownerItemPage(orgslug: string, kind: 'experience' | 'project', uuid?: string, search: Record<string, string | string[] | undefined> = {}) {
  const token = await getServerAccessToken()
  if (!token) redirect(getUriWithOrg(orgslug, '/'))
  const shell = await getMyPortfolio(token)
  const one = (key: string) => { const value = search[key]; return typeof value === 'string' ? value : undefined }
  if (kind === 'experience') {
    const entry = uuid ? shell.timeline.find((item: any) => item.timeline_uuid === uuid) : undefined
    if (uuid && !entry) notFound()
    return <><PageTitleRegistration section="Experience" detail={entry?.title || 'New experience'} /><ExperiencePage key={uuid || 'new'} entry={entry} projects={shell.projects || []} orgslug={orgslug} initialType={one('type')} mark={one('mark')} /></>
  }
  const project = uuid ? shell.projects.find((item: any) => item.project_uuid === uuid) : undefined
  if (uuid && !project) notFound()
  return <><PageTitleRegistration section="Projects" detail={project?.title || 'New project'} /><ProjectPage key={uuid || 'new'} project={project} timeline={shell.timeline || []} orgslug={orgslug} experience={one('experience')} mark={one('mark')} /></>
}
