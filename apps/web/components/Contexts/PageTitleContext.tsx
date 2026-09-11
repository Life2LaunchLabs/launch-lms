'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { formatAppPageTitle, resolveAppPageTitle, type AppPageTitle } from '@services/routing/pageTitles'

type RegisteredTitle = AppPageTitle & { path: string }

const PageTitleContext = createContext<{
  title: string
  // eslint-disable-next-line no-unused-vars
  setPageTitle: (value: RegisteredTitle | null) => void
} | null>(null)

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const session = useLHSession() as any
  const [registered, setRegistered] = useState<RegisteredTitle | null>(null)
  const fallback = resolveAppPageTitle(pathname)
  const descriptor = registered?.path === pathname ? registered : fallback
  const title = formatAppPageTitle(descriptor)
  const setPageTitle = useCallback((value: RegisteredTitle | null) => setRegistered(value), [])

  useEffect(() => {
    if (session?.status === 'authenticated') document.title = title
  }, [session?.status, title])

  const value = useMemo(() => ({ title, setPageTitle }), [setPageTitle, title])
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>
}

export function usePageTitle() {
  return useContext(PageTitleContext)
}

export function PageTitleRegistration({ section, detail }: AppPageTitle) {
  const pathname = usePathname()
  const context = usePageTitle()
  const setPageTitle = context?.setPageTitle
  useEffect(() => {
    setPageTitle?.({ path: pathname, section, detail })
    return () => setPageTitle?.(null)
  }, [detail, pathname, section, setPageTitle])
  return null
}
