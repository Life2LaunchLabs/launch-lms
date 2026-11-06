'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { readyLanguage } from '@/lib/languages'
import { saveMyLanguage } from '@services/users/language'

/** The current language and a setter that also saves it on the account when someone is signed in. */
export function useLanguage() {
  const { i18n } = useTranslation()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const language = readyLanguage(i18n.language)

  const setLanguage = useCallback(async (code: string) => {
    const next = readyLanguage(code)
    // Save first: changing the language redraws the page, and the save must not wait on that.
    // If it fails, the choice still applies on this device.
    const saved = token ? saveMyLanguage(next, token).catch(() => undefined) : undefined
    await i18n.changeLanguage(next)
    await saved
  }, [i18n, token])

  return { language, setLanguage }
}

/**
 * Applies the language saved on the account when someone signs in, so it follows them to any
 * device. If nothing is saved yet but they picked a language before signing in, that is saved.
 */
export function LanguageSync() {
  const { i18n } = useTranslation()
  const session = useLHSession() as any
  const user = session?.data?.user
  const token: string | undefined = session?.data?.tokens?.access_token
  const saved: string | null = user?.details?.language || null
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (!user?.id || !token) return
    const key = `${user.id}:${saved || ''}`
    if (applied.current === key) return
    applied.current = key
    const current = readyLanguage(i18n.language)
    if (saved) {
      if (readyLanguage(saved) !== current) i18n.changeLanguage(readyLanguage(saved))
    } else if (current !== 'en') {
      saveMyLanguage(current, token).catch(() => {})
    }
  }, [user?.id, token, saved, i18n])

  return null
}
