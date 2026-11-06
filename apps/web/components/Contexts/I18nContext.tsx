'use client'

import React, { useEffect, useState } from 'react'
import i18n, { loadLocale } from '../../lib/i18n'

const base = (lng?: string) => (lng || 'en').split('-')[0]
const loaded = (lng: string) => lng === 'en' || i18n.hasResourceBundle(lng, 'common')

/**
 * Shows the app once i18next is ready, and redraws it when a language file finishes loading or
 * the language changes. The tree is keyed by language, so text built outside React (`tr` in
 * lib/tr.ts) is rebuilt too, not only components that call `useTranslation`.
 */
export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(() => {
    const lng = base(i18n.language)
    return { ready: i18n.isInitialized, lng, loaded: i18n.isInitialized && loaded(lng) }
  })

  useEffect(() => {
    let live = true
    const show = async (code: string) => {
      const lng = base(code)
      await loadLocale(lng)
      if (live) setState({ ready: true, lng, loaded: true })
    }
    const onInitialized = () => void show(i18n.language)
    const onChange = (lng: string) => void show(lng)
    if (i18n.isInitialized) onInitialized()
    else i18n.on('initialized', onInitialized)
    i18n.on('languageChanged', onChange)
    return () => {
      live = false
      i18n.off('initialized', onInitialized)
      i18n.off('languageChanged', onChange)
    }
  }, [])

  // Show nothing while i18next starts, so the page doesn't flash in the wrong language.
  if (!state.ready) return null
  return <React.Fragment key={state.loaded ? state.lng : `${state.lng}:loading`}>{children}</React.Fragment>
}
