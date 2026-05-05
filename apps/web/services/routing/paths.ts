export type QueryParamValue =
  | string
  | number
  | boolean
  | null
  | undefined

export function withQuery(
  path: string,
  params?: Record<string, QueryParamValue>
): string {
  if (!params) return path

  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })

  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const routePaths = {
  home: () => '/home',
  auth: {
    login: (params?: { next?: string; redirect?: string }) =>
      withQuery('/login', params),
    signup: (params?: { next?: string; inviteCode?: string; mode?: string }) =>
      withQuery('/signup', params),
    forgot: () => '/forgot',
    reset: () => '/reset',
    verifyEmail: () => '/verify-email',
    redirect: () => '/auth/redirect',
    callbackGoogle: () => '/auth/callback/google',
    callbackSSO: () => '/auth/sso/callback',
    tokenExchange: () => '/auth/token-exchange',
  },
  owner: {
    root: () => '/',
    login: (params?: { next?: string; redirect?: string }) =>
      withQuery('/login', params),
    account: {
      root: () => '/account',
      general: () => '/account/general',
      security: () => '/account/security',
      purchases: () => '/account/purchases',
      organizations: () => '/account/organizations',
      badges: () => '/account/badges',
      orgAdmin: () => '/account/org-admin',
    },
    platform: {
      organizations: () => '/dash/org-management',
      users: () => '/dash/org-management/users',
      analytics: () => '/dash/org-management/analytics',
      organization: (orgId: string | number) => `/dash/org-management/${orgId}`,
    },
  },
  org: {
    root: () => '/',
    profile: () => '/profile',
    profileEdit: () => '/profile/edit',
    welcome: () => '/welcome',
    quickstart: () => '/quickstart',
    quickstartCourse: (courseUuid: string) => `/quickstart/course/${courseUuid}`,
    quickstartCourseActivity: (courseUuid: string, activityId: string) =>
      `/quickstart/course/${courseUuid}/activity/${activityId}`,
    quickstartCourseActivityEnd: (courseUuid: string) =>
      `/quickstart/course/${courseUuid}/activity/end`,
    badge: () => '/badge',
    badgesVerify: (uuid: string) => `/badges/${uuid}/verify`,
    certificateVerify: (uuid: string) => `/certificates/${uuid}/verify`,
    organizations: () => '/organizations',
    organization: (orgSlug: string) => `/organization/${orgSlug}`,
    search: (query?: string) => withQuery('/search', { q: query }),
    boards: () => '/boards',
    communities: () => '/communities',
    resources: () => '/resources',
    podcasts: () => '/podcasts',
    courses: () => '/courses',
    collections: () => '/collections',
    collectionNew: () => '/collections/new',
    collection: (collectionUuid: string) => `/collection/${collectionUuid}`,
    course: (courseUuid: string) => `/course/${courseUuid}`,
    courseActivity: (courseUuid: string, activityId: string) =>
      `/course/${courseUuid}/activity/${activityId}`,
    courseActivityEnd: (courseUuid: string) =>
      `/course/${courseUuid}/activity/end`,
    resource: (resourceUuid: string) => `/resource/${resourceUuid}`,
    podcast: (podcastUuid: string) => `/podcast/${podcastUuid}`,
    playground: (playgroundUuid: string) => `/playground/${playgroundUuid}`,
    community: (communityUuid: string) => `/community/${communityUuid}`,
    communityDiscussion: (communityUuid: string, discussionUuid: string) =>
      `/community/${communityUuid}/discussion/${discussionUuid}`,
    user: (username: string) => `/user/${username}`,
    store: {
      root: () => '/store',
      offer: (offerId: string) => `/store/offers/${offerId}`,
    },
    account: {
      root: () => '/account',
      page: (subpage: string) => `/account/${subpage}`,
    },
    dash: {
      root: () => '/dash',
      analytics: () => '/dash/analytics',
      courses: () => '/dash/courses',
      assignments: () => '/dash/assignments',
      communities: () => '/dash/communities',
      resources: () => '/dash/resources',
      resourceTags: () => '/dash/resources/tags',
      podcasts: () => '/dash/podcasts',
      boards: () => '/dash/boards',
      playgrounds: () => '/dash/playgrounds',
      paymentsOverview: () => '/dash/payments/overview',
      paymentsOffers: () => '/dash/payments/offers',
      paymentsGroups: () => '/dash/payments/groups',
      paymentsConfiguration: () => '/dash/payments/configuration',
      courseSettings: (courseUuid: string, subpage: string) =>
        `/dash/courses/course/${courseUuid}/${subpage}`,
      collectionSettings: (collectionUuid: string, subpage: string) =>
        `/dash/courses/collection/${collectionUuid}/${subpage}`,
      boardSettings: (boardUuid: string, subpage: string) =>
        `/dash/boards/${boardUuid}/${subpage}`,
      boardRoot: (boardUuid: string) => `/dash/boards/${boardUuid}`,
      resourceChannelSettings: (channelUuid: string, subpage: string) =>
        `/dash/resources/${channelUuid}/${subpage}`,
      podcastSettings: (podcastUuid: string, subpage: string) =>
        `/dash/podcasts/podcast/${podcastUuid}/${subpage}`,
      communitySettings: (communityUuid: string, subpage: string) =>
        `/dash/communities/${communityUuid}/${subpage}`,
      assignment: (assignmentUuid: string) => `/dash/assignments/${assignmentUuid}`,
      assignmentEditor: (assignmentUuid: string) =>
        withQuery(`/dash/assignments/${assignmentUuid}`, { subpage: 'editor' }),
      users: {
        users: () => '/dash/users/settings/users',
        usergroups: () => '/dash/users/settings/usergroups',
        roles: () => '/dash/users/settings/roles',
        signups: () => '/dash/users/settings/signups',
        add: () => '/dash/users/settings/add',
        auditLogs: () => '/dash/users/settings/audit-logs',
      },
      orgSettings: {
        general: () => '/dash/org/settings/general',
        branding: () => '/dash/org/settings/branding',
        features: () => '/dash/org/settings/features',
        landing: () => '/dash/org/settings/landing',
        seo: () => '/dash/org/settings/seo',
        ai: () => '/dash/org/settings/ai',
        domains: () => '/dash/org/settings/domains',
        api: () => '/dash/org/settings/api',
        sso: () => '/dash/org/settings/sso',
        usage: () => '/dash/org/settings/usage',
        plan: () => '/dash/org/settings/plan',
        other: () => '/dash/org/settings/other',
      },
      platform: {
        organizations: () => '/dash/org-management',
        users: () => '/dash/org-management/users',
        analytics: () => '/dash/org-management/analytics',
        organization: (orgId: string | number) => `/dash/org-management/${orgId}`,
      },
    },
  },
  editor: {
    board: (boardUuid: string) => `/board/${boardUuid}`,
    playgroundEdit: (playgroundUuid: string) =>
      `/editor/playground/${playgroundUuid}/edit`,
    courseActivityEdit: (courseId: string, activityUuid: string) =>
      `/editor/course/${courseId}/activity/${activityUuid}/edit`,
  },
} as const
