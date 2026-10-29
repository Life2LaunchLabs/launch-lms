import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// The portfolio's own records: who you are, the highlights band and layout, credentials, people and quotes,
// résumé versions and documents. Each save returns the saved item; the page refetches the shell when it needs more.

/** A number people notice first, and what it means. */
export type Highlight = { value: string; label: string }
export type PortfolioLayout = { header: 'left' | 'center'; sections: 'grid' | 'list' }

async function send(path: string, method: string, payload: unknown, token: string) {
  const response = await fetch(`${getAPIUrl()}portfolio/me/${path}`, RequestBodyWithAuthHeader(method, payload, null, token))
  return errorHandling(response)
}

const crud = (path: string) => ({
  create: (payload: unknown, token: string) => send(path, 'POST', payload, token),
  update: (uuid: string, payload: unknown, token: string) => send(`${path}/${uuid}`, 'PATCH', payload, token),
  remove: (uuid: string, token: string) => send(`${path}/${uuid}`, 'DELETE', null, token),
})

export const updateMyIdentity = (payload: { first_name?: string; last_name?: string; preferred_name?: string }, token: string) => send('identity', 'PATCH', payload, token)
export const updateMyHighlights = (highlights: Highlight[], token: string): Promise<{ highlights: Highlight[]; layout: PortfolioLayout }> => send('highlights', 'PUT', { highlights }, token)
export const updateMyLayout = (layout: Partial<PortfolioLayout>, token: string): Promise<{ highlights: Highlight[]; layout: PortfolioLayout }> => send('layout', 'PUT', layout, token)
export const credentials = crud('credentials')
export const contacts = crud('contacts')
export const quotes = crud('quotes')
export const resumeVersions = crud('resume-versions')
export const documents = crud('documents')
