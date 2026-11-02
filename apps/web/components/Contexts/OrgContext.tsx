'use client'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ErrorUI from '@components/Objects/StyledElements/Error/Error'

interface OrgContextValue {
  org: any
  isUserPartOfTheOrg: boolean
  orgslug: string
}

export const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({ children, orgslug }: { children: React.ReactNode, orgslug: string }) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const isAuthenticated = session?.status === 'authenticated'
  const userId = session?.data?.user?.id ?? 'anonymous'
  const sessionRoles = Array.isArray(session?.data?.roles) ? session.data.roles : []
  const hasForcedSessionRefresh = useRef(false)
  const [isResolvingMembership, setIsResolvingMembership] = useState(false)

  const { data: org, error: orgError } = useSWR(
    [`${getAPIUrl()}orgs/slug/${orgslug}`, accessToken || '', userId],
    // A stale or rejected sign-in still gets the org: everyone can read it, so fall back to asking
    // without the token rather than leaving the page dead.
    async ([url, token]) => {
      try { return await swrFetcher(url, token || undefined) }
      catch (error: any) {
        if (token && (error?.status === 401 || error?.status === 403)) return swrFetcher(url)
        throw error
      }
    },
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 5000,
      // A new token changes the key; keep the org on screen while it's fetched again.
      keepPreviousData: true,
      errorRetryCount: 4,
    }
  )

  const isOrgActive = useMemo(() => (org?.config?.config?.active ?? org?.config?.config?.general?.enabled) !== false, [org])
  const isUserPartOfTheOrg = useMemo(() => {
    // If user is not authenticated, treat them as "part of org" for viewing purposes
    if (!isAuthenticated) return true
    return sessionRoles.some((entry: any) => String(entry?.org?.id) === String(org?.id))
  }, [isAuthenticated, sessionRoles, org?.id])

  useEffect(() => {
    if (!isAuthenticated || hasForcedSessionRefresh.current) return
    if (sessionRoles.length > 0) return

    hasForcedSessionRefresh.current = true
    setIsResolvingMembership(true)

    Promise.resolve(session?.update?.(true)).finally(() => {
      setIsResolvingMembership(false)
    })
  }, [isAuthenticated, sessionRoles.length, session])

  // A failed refetch (a sign-in refresh hiccup, a busy server) keeps the org already loaded.
  if (orgError && !org) return <ErrorUI message='An error occurred while fetching data' />
  if (!org || !session) return <div></div>
  if (isAuthenticated && sessionRoles.length === 0 && isResolvingMembership) return <div></div>
  if (!isOrgActive) return <ErrorUI message='This organization is no longer active' />

  const contextValue: OrgContextValue = {
    org,
    isUserPartOfTheOrg,
    orgslug,
  }

  return <OrgContext.Provider value={contextValue}>{children}</OrgContext.Provider>
}

// Backward compatible hook - returns just the org object
export function useOrg() {
  const context = useContext(OrgContext)
  return context?.org ?? null
}

// New hook to get membership status
export function useOrgMembership() {
  const context = useContext(OrgContext)
  return {
    org: context?.org ?? null,
    isUserPartOfTheOrg: context?.isUserPartOfTheOrg ?? true,
    orgslug: context?.orgslug ?? '',
  }
}
