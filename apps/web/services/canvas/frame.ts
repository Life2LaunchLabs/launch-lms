'use client'

import { useSyncExternalStore } from 'react'
import { isCanvasBrowserSession } from '@services/auth/browserCookies'

/** True when this page is shown inside another site's frame (Canvas). Google and SSO refuse to be framed. */
export function isFramed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

const noSubscription = () => () => {}

/** False on the server and while hydrating, so both renders agree; the real answer right after. */
export function useInFrame(): boolean {
  return useSyncExternalStore(noSubscription, isFramed, () => false)
}

/** Inside Canvas: framed, in a session a Canvas launch started. */
export function useInCanvas(): boolean {
  return useSyncExternalStore(noSubscription, () => isFramed() && isCanvasBrowserSession(), () => false)
}
