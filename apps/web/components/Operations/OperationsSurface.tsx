'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getConfig } from '@services/config/config'
import { issueOperationsSession } from '@services/operations/operations'

type SurfaceContext = {
  route: string
  theme: 'light' | 'dark'
  viewport: { width: number; height: number }
  organization: string | null
  role: string
  release: string
}
type Controller = {
  update: Function
  open: Function
  destroy: Function
}
declare global {
  interface Window {
    LaunchOperationsV1?: { protocol: string; mount: Function }
  }
}

const OPEN_EVENT = 'launchlms-candidate-open'

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function safePlatformUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.origin
  } catch {
    return ''
  }
  return ''
}

export default function OperationsSurface({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const pathname = usePathname()
  const controller = useRef<Controller | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const enabled = getConfig('NEXT_PUBLIC_OPERATIONS_SURFACE_ENABLED') === 'true'
  const platformUrl = safePlatformUrl(getConfig('NEXT_PUBLIC_OPERATIONS_PLATFORM_URL'))
  const environment = getConfig('NEXT_PUBLIC_OPERATIONS_ENVIRONMENT')
  const project = getConfig('NEXT_PUBLIC_OPERATIONS_PROJECT', 'launch-lms')
  const release = getConfig('NEXT_PUBLIC_LAUNCHLMS_BUILD_REVISION', 'unknown')
  const accessToken = session?.data?.tokens?.access_token as string | undefined
  const authenticated = session?.status === 'authenticated'
  const role = session?.data?.user?.is_superadmin ? 'superadmin' : 'member'
  const orgId = org?.id
  const context = useRef<SurfaceContext>({ route: pathname, theme, viewport: viewportSize, organization: org?.org_uuid || null, role, release })

  useEffect(() => {
    context.current = { route: pathname, theme, viewport: viewportSize, organization: org?.org_uuid || null, role, release }
  }, [org?.org_uuid, pathname, release, role, theme, viewportSize])

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setViewportSize(viewport()))
    }
    update()
    window.addEventListener('resize', update)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update) }
  }, [])

  useEffect(() => {
    if (!enabled || !authenticated || !accessToken || !orgId || !platformUrl || !environment) return
    let active = true
    const start = () => {
      if (!active || !window.LaunchOperationsV1 || controller.current) return
      setUnavailable(false)
      controller.current = window.LaunchOperationsV1.mount({
        project, environment, hideWhenUnavailable: false,
        context: { ...context.current, route: window.location.pathname, viewport: viewport() },
        onUnavailable: () => setUnavailable(true),
        getSessionToken: ({ nonce, protocol }: { nonce: string; protocol: string }) =>
          issueOperationsSession(Number(orgId), nonce, protocol, accessToken),
      }) as Controller
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-launch-operations="v1"]')
    if (existing) { if (window.LaunchOperationsV1) start(); else existing.addEventListener('load', start, { once: true }) }
    else {
      const script = document.createElement('script')
      script.src = `${platformUrl}/sdk/v1/loader.js`
      script.async = true; script.crossOrigin = 'anonymous'; script.dataset.launchOperations = 'v1'
      script.addEventListener('load', start, { once: true })
      script.addEventListener('error', () => active && setUnavailable(true), { once: true })
      document.head.append(script)
    }
    const open = (event: Event) => controller.current?.open((event as CustomEvent<string>).detail || 'feedback')
    window.addEventListener(OPEN_EVENT, open)
    return () => { active = false; window.removeEventListener(OPEN_EVENT, open); controller.current?.destroy(); controller.current = null }
  }, [accessToken, authenticated, enabled, environment, orgId, platformUrl, project])

  useEffect(() => {
    controller.current?.update({ route: pathname, theme, viewport: viewportSize, organization: org?.org_uuid || null, role, release })
  }, [org?.org_uuid, pathname, release, role, theme, viewportSize])

  if (!enabled || !authenticated || !platformUrl || !environment) return null
  return unavailable ? <div className="fixed bottom-3 right-3 z-[1000] rounded-full border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow" role="status">Project tools unavailable</div> : null
}
