import i18n from 'i18next'

import { inOrgWords } from './people'

/**
 * Translate outside React (module-level lists, helpers that build text). Give the English with the
 * key: it is used before i18next starts (tests, the server) and as the fallback. Components that show
 * the result use `useTranslation`, so they re-render, and re-run this, when the language changes.
 */
export function tr(key: string, en: string, values?: Record<string, unknown>): string {
  if (i18n.isInitialized) return i18n.t(key, { defaultValue: en, ...values }) as string
  return inOrgWords(en.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(values?.[name] ?? '')))
}

/** The language dates and numbers are written in: the current one, else English. */
export function trLocale(): string {
  return (i18n.isInitialized && (i18n.language)) || 'en'
}
