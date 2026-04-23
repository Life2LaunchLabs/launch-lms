'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type OnboardingFeatureKey = 'courses' | 'communities' | 'resources'

type FeatureState = Record<OnboardingFeatureKey, boolean>

export type OrgOnboardingState = {
  dashboardBannerDismissed: boolean
  dismissedFeatureBanners: FeatureState
  visitedFeatures: FeatureState
}

// eslint-disable-next-line no-unused-vars
type OnboardingStateUpdater = (state: OrgOnboardingState) => OrgOnboardingState

const ORG_ONBOARDING_EVENT = 'org-onboarding-change'

const DEFAULT_FEATURE_STATE: FeatureState = {
  courses: false,
  communities: false,
  resources: false,
}

const DEFAULT_ONBOARDING_STATE: OrgOnboardingState = {
  dashboardBannerDismissed: false,
  dismissedFeatureBanners: {
    ...DEFAULT_FEATURE_STATE,
  },
  visitedFeatures: {
    ...DEFAULT_FEATURE_STATE,
  },
}

const onboardingSnapshotCache = new Map<
  string,
  {
    rawValue: string | null
    state: OrgOnboardingState
  }
>()

function createDefaultState(): OrgOnboardingState {
  return {
    dashboardBannerDismissed: DEFAULT_ONBOARDING_STATE.dashboardBannerDismissed,
    dismissedFeatureBanners: {
      ...DEFAULT_ONBOARDING_STATE.dismissedFeatureBanners,
    },
    visitedFeatures: {
      ...DEFAULT_ONBOARDING_STATE.visitedFeatures,
    },
  }
}

function normalizeFeatureState(value: unknown): FeatureState {
  const record = value && typeof value === 'object' ? value as Partial<FeatureState> : {}

  return {
    courses: record.courses === true,
    communities: record.communities === true,
    resources: record.resources === true,
  }
}

function normalizeOnboardingState(value: unknown): OrgOnboardingState {
  const record =
    value && typeof value === 'object'
      ? value as Partial<OrgOnboardingState>
      : {}

  return {
    dashboardBannerDismissed: record.dashboardBannerDismissed === true,
    dismissedFeatureBanners: normalizeFeatureState(
      record.dismissedFeatureBanners
    ),
    visitedFeatures: normalizeFeatureState(record.visitedFeatures),
  }
}

function getStorageKey(orgslug: string, userKey: string) {
  return `launchlms:onboarding:${orgslug}:${userKey}`
}

function readOnboardingState(storageKey: string): OrgOnboardingState {
  if (typeof window === 'undefined') {
    return DEFAULT_ONBOARDING_STATE
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey)
    const cachedSnapshot = onboardingSnapshotCache.get(storageKey)

    if (cachedSnapshot && cachedSnapshot.rawValue === rawValue) {
      return cachedSnapshot.state
    }

    const nextState = rawValue
      ? normalizeOnboardingState(JSON.parse(rawValue))
      : createDefaultState()

    onboardingSnapshotCache.set(storageKey, {
      rawValue,
      state: nextState,
    })

    return nextState
  } catch {
    return DEFAULT_ONBOARDING_STATE
  }
}

function writeOnboardingState(
  storageKey: string,
  nextState: OrgOnboardingState
) {
  window.localStorage.setItem(storageKey, JSON.stringify(nextState))
  window.dispatchEvent(
    new CustomEvent(ORG_ONBOARDING_EVENT, {
      detail: {
        storageKey,
        state: nextState,
      },
    })
  )
}

export function getOnboardingUserKey(session: any): string | null {
  return (
    session?.data?.user?.user_uuid ||
    session?.data?.user?.id ||
    session?.data?.user?.username ||
    null
  )
}

function subscribeToOnboardingState(
  storageKey: string | null,
  onStoreChange: () => void
) {
  if (!storageKey || typeof window === 'undefined') {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== storageKey) {
      return
    }

    onStoreChange()
  }

  const handleStateChange = (event: Event) => {
    const detail = (event as CustomEvent<{
      storageKey?: string
    }>).detail

    if (detail?.storageKey !== storageKey) {
      return
    }

    onStoreChange()
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(ORG_ONBOARDING_EVENT, handleStateChange)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(ORG_ONBOARDING_EVENT, handleStateChange)
  }
}

export function useOrgOnboarding(orgslug: string, userKey: string | null) {
  const storageKey = userKey ? getStorageKey(orgslug, userKey) : null
  const state = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) =>
        subscribeToOnboardingState(storageKey, onStoreChange),
      [storageKey]
    ),
    useCallback(() => {
      if (!storageKey) {
        return DEFAULT_ONBOARDING_STATE
      }

      return readOnboardingState(storageKey)
    }, [storageKey]),
    () => DEFAULT_ONBOARDING_STATE
  )

  const updateState = useCallback((updater: OnboardingStateUpdater) => {
    if (!userKey || typeof window === 'undefined') {
      return
    }

    const storageKey = getStorageKey(orgslug, userKey)
    const currentState = readOnboardingState(storageKey)
    const nextState = normalizeOnboardingState(updater(currentState))

    if (JSON.stringify(currentState) === JSON.stringify(nextState)) {
      return
    }

    writeOnboardingState(storageKey, nextState)
  }, [orgslug, userKey])

  return {
    state,
    dismissDashboardBanner: () => {
      updateState((currentState) => ({
        ...currentState,
        dashboardBannerDismissed: true,
      }))
    },
    dismissFeatureBanner: (feature: OnboardingFeatureKey) => {
      updateState((currentState) => ({
        ...currentState,
        dismissedFeatureBanners: {
          ...currentState.dismissedFeatureBanners,
          [feature]: true,
        },
      }))
    },
    markFeatureVisited: (feature: OnboardingFeatureKey) => {
      updateState((currentState) => {
        if (currentState.visitedFeatures[feature]) {
          return currentState
        }

        return {
          ...currentState,
          visitedFeatures: {
            ...currentState.visitedFeatures,
            [feature]: true,
          },
        }
      })
    },
  }
}
