'use client'

import React from 'react'
import useSWR from 'swr'
import { MotionConfig } from 'motion/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { accessibilityApi, accessibilityKeys, DEFAULT_ACCESSIBILITY, type AccessibilitySettings } from '@services/users/accessibility'

const CACHE_KEY = 'accessibility-settings'

type Value = {
  settings: AccessibilitySettings
  /** Saves a change for the signed-in learner (and on this browser for someone signed out). */
  save: (patch: Partial<AccessibilitySettings>) => Promise<void> // eslint-disable-line no-unused-vars
}

const AccessibilityContext = React.createContext<Value>({ settings: DEFAULT_ACCESSIBILITY, save: async () => undefined })

function readCache(): AccessibilitySettings | null {
  try { const saved = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null'); return saved && typeof saved === 'object' ? { ...DEFAULT_ACCESSIBILITY, ...saved } : null } catch { return null }
}
function writeCache(settings: AccessibilitySettings) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings)) } catch { /* private mode: the account still has them */ }
}

/**
 * The learner's accessibility settings for the whole app: saved on their account, kept on this browser too so
 * the first screen already reads aloud or shows bigger text before the account answers.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const [cached, setCached] = React.useState<AccessibilitySettings | null>(null)
  React.useEffect(() => setCached(readCache()), [])
  const { data, mutate } = useSWR(token ? [accessibilityKeys.mine(), token] : null, () => accessibilityApi.mine(token!), { revalidateOnFocus: true })
  const settings = data || cached || DEFAULT_ACCESSIBILITY

  React.useEffect(() => { if (data) writeCache(data) }, [data])
  React.useEffect(() => {
    const root = document.documentElement
    if (settings.bigger_text) root.setAttribute('data-bigger-text', '')
    else root.removeAttribute('data-bigger-text')
  }, [settings.bigger_text])
  React.useEffect(() => {
    const root = document.documentElement
    if (settings.less_motion === 'on') root.setAttribute('data-less-motion', '')
    else root.removeAttribute('data-less-motion')
  }, [settings.less_motion])

  const save = React.useCallback(async (patch: Partial<AccessibilitySettings>) => {
    const next = { ...settings, ...patch, set_by: null }
    setCached(next)
    writeCache(next)
    if (!token) return
    await mutate(accessibilityApi.saveMine(next, token), { optimisticData: next, rollbackOnError: true, revalidate: false })
  }, [settings, token, mutate])

  const value = React.useMemo(() => ({ settings, save }), [settings, save])
  const reducedMotion = settings.less_motion === 'on' ? 'always' : settings.less_motion === 'off' ? 'never' : 'user'
  return <AccessibilityContext.Provider value={value}>
    <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
  </AccessibilityContext.Provider>
}

export function useAccessibility(): Value {
  return React.useContext(AccessibilityContext)
}
