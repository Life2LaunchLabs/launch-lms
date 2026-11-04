import { getAPIUrl } from '@services/config/config'
import { RequestBodyFormWithAuthHeader, RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// The portfolio's own records: who you are, the highlights band and layout, credentials, people and quotes,
// résumé versions and documents. Each save returns the saved item; the page refetches the shell when it needs more.

/** A number people notice first, and what it means. */
export type Highlight = { value: string; label: string }
export type LookId = 'playful' | 'professional' | 'gallery' | 'volt' | 'arcade'
export type LookMode = 'light' | 'dark' | 'system'
export type SectionType = 'highlights' | 'feature' | 'about' | 'experience' | 'projects' | 'credentials' | 'results' | 'headed' | 'people'
/** One section in a row of the stack: its width in sixths (2, 3, 4 or 6). */
export type StackItem = { type: SectionType; u: number }
export type FeatureKind = 'project' | 'experience' | 'quote' | 'badge' | 'credential' | 'link'
export type FeatureItem = { kind: FeatureKind; ref: string }
/** The front page's layout and the learner's look (null until they pick one), light or dark, accent and banner. */
export type PortfolioLayout = {
  header: 'left' | 'center'; sections: 'grid' | 'list'; look?: LookId | null
  mode?: LookMode | null; accent?: string | null; banner?: string; banner_image?: { asset_uuid: string; url: string } | null
  /** Rows of up to three sections; null while the learner is on the look's suggested layout. */
  stack?: StackItem[][] | null
  /** The learner's own section titles, which follow them to every look. */
  names?: Partial<Record<SectionType, string>>
  /** Heights in px per look ("volt") and per look on phones ("volt:phone"); 0 fits the content. */
  heights?: Record<string, Partial<Record<SectionType, number>>>
  features?: FeatureItem[]
  feature_autoplay?: boolean
}
/** What a layout save takes: the accent as "" clears it, and a photo is sent by its asset. */
export type LayoutChange = Partial<Omit<PortfolioLayout, 'banner_image'>> & { banner_image_uuid?: string }

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
export const updateMyLayout = (layout: LayoutChange, token: string): Promise<{ highlights: Highlight[]; layout: PortfolioLayout }> => send('layout', 'PUT', layout, token)
export const markProgressSeen = (quest: number, token: string): Promise<{ seen: number[] }> => send('progress', 'PUT', { quest }, token)
export const credentials = crud('credentials')
export const contacts = crud('contacts')
export const quotes = crud('quotes')

// My people access: add or link someone by their account, then the two switches for what they may see.
const q = encodeURIComponent
export const peopleAccess = {
  add: (handle: string, token: string) => send('contacts/account', 'POST', { handle }, token),
  link: (contactUuid: string, handle: string, token: string) => send(`contacts/${q(contactUuid)}/account`, 'PUT', { handle }, token),
  set: (contactUuid: string, access: { portfolio: boolean; plans: boolean }, token: string) => send(`contacts/${q(contactUuid)}/access`, 'PUT', access, token),
}

export const results = crud('results')
export const resumeVersions = crud('resume-versions')
export const documents = crud('documents')

// Imports from other apps: a preview to pick from, then a one-time copy. The file is sent again with the picks.
export type ImportSource = 'cis' | 'linkedin' | 'resume'
export type ImportItem = { key: string; group: string; kind: string; title: string; detail: string; already: boolean }
export type ImportPreview = { source: ImportSource; label: string; items: ImportItem[]; kept: Record<string, number>; skipped: string[] }
export type ImportResult = { import_uuid: string; added: Record<string, number>; kept: Record<string, number> }
export type PastImport = { import_uuid: string; source: ImportSource; label: string; filename: string; added: Record<string, number>; kept: Record<string, number>; creation_date: string }

async function sendForm(path: string, form: FormData, token: string) {
  return errorHandling(await fetch(`${getAPIUrl()}portfolio/me/${path}`, RequestBodyFormWithAuthHeader('POST', form, null, token)))
}

function importForm(source: ImportSource, file: File, keys?: string[]) {
  const form = new FormData()
  form.append('source', source)
  form.append('file', file)
  if (keys) form.append('keys', JSON.stringify(keys))
  return form
}

export const previewImport = (source: ImportSource, file: File, token: string): Promise<ImportPreview> => sendForm('imports/preview', importForm(source, file), token)
export const runImport = (source: ImportSource, file: File, keys: string[], token: string): Promise<ImportResult> => sendForm('imports', importForm(source, file, keys), token)
export const listImports = (token: string): Promise<PastImport[]> => send('imports', 'GET', null, token)

// Asked-for quotes: the learner asks someone about one experience or project; they answer from the emailed link.
export type QuoteAskPayload = { contact_uuid?: string; name?: string; role_label?: string; email?: string; timeline_uuid?: string; project_uuid?: string; note: string }
export type QuoteRequestView = { learner: { name: string; first_name: string }; item: { kind: 'experience' | 'project'; title: string; detail: string }; note: string; name: string; role_label: string }
export const askForQuote = (payload: QuoteAskPayload, token: string) => send('quotes/ask', 'POST', payload, token)
export const takeBackAsk = (quoteUuid: string, token: string) => send(`quotes/${quoteUuid}/ask`, 'DELETE', null, token)

async function quoteRequest(token: string, method: string, payload?: unknown) {
  const response = await fetch(`${getAPIUrl()}portfolio/quote-requests/${encodeURIComponent(token)}`, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: payload ? JSON.stringify(payload) : undefined })
  return errorHandling(response)
}
export const getQuoteRequest = (token: string): Promise<QuoteRequestView> => quoteRequest(token, 'GET')
export const answerQuoteRequest = (token: string, payload: { name: string; role_label: string; body: string; reference: boolean }) => quoteRequest(token, 'POST', payload)
