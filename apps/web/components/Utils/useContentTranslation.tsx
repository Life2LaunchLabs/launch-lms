'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { readyLanguage } from '@/lib/languages'
import { translateContent } from '@services/translate/content'

/*
 * Text that schools, programs and outside sources wrote (plan steps, resources, collections) shown in
 * the learner's language. Texts asked for in one render are sent together; each comes back once and
 * is kept for the visit (the server keeps it for good). Until it arrives, or when there is no model,
 * the original shows. "Show original" turns it off on this device.
 */

const BATCH_MS = 40
const MAX_BATCH = 60
const OFF_KEY = 'launchlms_content_translation_off'

type Entry = string | null // null: asked for, or can't be translated
const cache = new Map<string, Map<string, Entry>>()
const queue = new Map<string, Set<string>>()
const listeners = new Set<() => void>()
let version = 0
let timer: ReturnType<typeof setTimeout> | null = null
let token = ''
let off = false
try { off = typeof window !== 'undefined' && window.localStorage.getItem(OFF_KEY) === '1' } catch { /* storage blocked */ }

const notify = () => { version += 1; listeners.forEach((listener) => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => version

function flush() {
  timer = null
  for (const [language, texts] of queue) {
    queue.delete(language)
    const all = [...texts]
    for (let start = 0; start < all.length; start += MAX_BATCH) {
      const batch = all.slice(start, start + MAX_BATCH)
      translateContent(language, batch, token)
        .then((result) => {
          const known = cache.get(language)!
          for (const text of batch) known.set(text, result.translations[text] ?? null)
          notify()
        })
        .catch(() => undefined) // Leave them as asked; the originals keep showing.
    }
  }
}

function lookup(language: string, text: string): string {
  let known = cache.get(language)
  if (!known) { known = new Map(); cache.set(language, known) }
  const found = known.get(text)
  if (found) return found
  if (found === undefined && token) {
    known.set(text, null)
    const pending = queue.get(language) || new Set<string>()
    pending.add(text)
    queue.set(language, pending)
    if (!timer) timer = setTimeout(flush, BATCH_MS)
  }
  return text
}

// Set from the session; a new token redraws, so texts shown before it are asked for.
function setToken(value: string) {
  if (!value || value === token) return
  token = value
  notify()
}

/** Whether organization text is shown translated on this device. */
export function setContentTranslationOff(value: boolean) {
  off = value
  try { window.localStorage.setItem(OFF_KEY, value ? '1' : '0') } catch { /* storage blocked */ }
  notify()
}

/**
 * `tx(text)`: the text in the learner's language, or the original. `translating` is true when it
 * applies at all (signed in, not English, not turned off); `showOriginal`/`showTranslated` switch it.
 */
export function useContentTranslation() {
  const { i18n } = useTranslation()
  const session = useLHSession() as any
  const accessToken: string = session?.data?.tokens?.access_token || ''
  useEffect(() => { setToken(accessToken) }, [accessToken])
  useSyncExternalStore(subscribe, snapshot, () => 0)
  const language = readyLanguage(i18n.language)
  const active = language !== 'en' && Boolean(accessToken)
  const translating = active && !off
  const tx = useCallback((text?: string | null): string => {
    if (!text || !translating) return text || ''
    return lookup(language, text)
  }, [translating, language])
  return { tx, active, translating, showOriginal: () => setContentTranslationOff(true), showTranslated: () => setContentTranslationOff(false) }
}

/** Organization text, translated when the learner reads another language. */
export function Tx({ text }: { text?: string | null }) {
  const { tx } = useContentTranslation()
  return <>{tx(text)}</>
}

/** "Translated automatically · Show original", or the way back, where translated text is shown. */
export function TranslatedNote({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { active, translating, showOriginal, showTranslated } = useContentTranslation()
  if (!active) return null
  return <p className={className || 'm-0 text-xs text-muted-foreground'}>
    {translating ? t('translate.auto') : t('translate.original')}{' · '}
    <button type="button" className="font-bold underline underline-offset-2" onClick={translating ? showOriginal : showTranslated}>
      {translating ? t('translate.show_original') : t('translate.show_translated')}
    </button>
  </p>
}

export default useContentTranslation
