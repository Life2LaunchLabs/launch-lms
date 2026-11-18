'use client'

import { useEffect, useState } from 'react'
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

/** Known after mount only, so the server render and the first client render agree. */
export function useInFrame(): boolean {
  const [framed, setFramed] = useState(false)
  useEffect(() => setFramed(isFramed()), [])
  return framed
}

/** Inside Canvas: framed, in a session a Canvas launch started. */
export function useInCanvas(): boolean {
  const [inCanvas, setInCanvas] = useState(false)
  useEffect(() => setInCanvas(isFramed() && isCanvasBrowserSession()), [])
  return inCanvas
}
