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
  auth: {
    login: (params?: { next?: string; redirect?: string }) =>
      withQuery('/login', params),
    signup: (params?: { next?: string; inviteCode?: string; mode?: string; inviteBadge?: string }) =>
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
      organizations: () => '/admin/org-management',
      users: () => '/admin/org-management/users',
      analytics: () => '/admin/org-management',
      organization: (orgId: string | number) => `/admin/org-management/${orgId}`,
    },
  },
  org: {
    root: () => '/',
    portfolio: () => '/portfolio',
    portfolioEdit: () => '/portfolio/edit',
    portfolioPost: (slug: string) => `/portfolio/journal/${slug}`,
    portfolioResume: () => '/portfolio/resume',
    portfolioTimeline: () => '/portfolio/timeline',
    portfolioAchievements: () => '/portfolio/achievements',
    portfolioAchievementDetail: (achievementId: string) => `/portfolio/achievements/${achievementId}`,
    news: () => '/news',
    newsArticle: (slug: string) => `/news/${slug}`,
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
    badges: () => '/badges',
    courses: () => '/courses',
    collections: () => '/collections',
    collectionNew: () => '/collections/new',
    collection: (collectionUuid: string) => `/collection/${collectionUuid}`,
    course: (courseUuid: string) => `/badges/${courseUuid}`,
    badgeStatus: (courseUuid: string) => `/badges/${courseUuid}/badge`,
    badgePath: (courseUuid: string) => `/badges/${courseUuid}/path`,
    badgeChapter: (courseUuid: string, chapterId: string) =>
      `/badges/${courseUuid}/chapter/${chapterId}`,
    badgeInvite: (courseUuid: string) => `/badges/${courseUuid}/invite`,
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
    userResume: (username: string) => `/user/${username}/resume`,
    userPortfolioPost: (username: string, slug: string) => `/user/${username}/portfolio/${slug}`,
    userTimeline: (username: string) => `/user/${username}/timeline`,
    userAchievements: (username: string) => `/user/${username}/achievements`,
    userAchievementDetail: (username: string, achievementId: string) => `/user/${username}/achievements/${achievementId}`,
    store: {
      root: () => '/store',
      offer: (offerId: string) => `/store/offers/${offerId}`,
    },
    account: {
      root: () => '/account',
      page: (subpage: string) => `/account/${subpage}`,
    },
    dash: {
      root: () => '/admin',
      analytics: () => '/admin',
      courses: () => '/admin/courses',
      assignments: () => '/admin/assignments',
      communities: () => '/admin/communities',
      resources: () => '/admin/resources',
      resourceTags: () => '/admin/resources/tags',
      podcasts: () => '/admin/podcasts',
      boards: () => '/admin',
      playgrounds: () => '/admin/playgrounds',
      paymentsOverview: () => '/admin/payments/overview',
      paymentsOffers: () => '/admin/payments/offers',
      paymentsGroups: () => '/admin/payments/groups',
      paymentsConfiguration: () => '/admin/payments/configuration',
      courseSettings: (courseUuid: string, subpage: string) =>
        `/admin/courses/course/${courseUuid}/${subpage}`,
      collectionSettings: (collectionUuid: string, subpage: string) =>
        `/admin/courses/collection/${collectionUuid}/${subpage}`,
      boardSettings: (boardUuid: string, subpage: string) =>
        '/admin',
      boardRoot: (boardUuid: string) => '/admin',
      resourceChannelSettings: (channelUuid: string, subpage: string) =>
        `/admin/resources/${channelUuid}/${subpage}`,
      podcastSettings: (podcastUuid: string, subpage: string) =>
        `/admin/podcasts/podcast/${podcastUuid}/${subpage}`,
      communitySettings: (communityUuid: string, subpage: string) =>
        `/admin/communities/${communityUuid}/${subpage}`,
      assignment: (assignmentUuid: string) => `/admin/assignments/${assignmentUuid}`,
      assignmentEditor: (assignmentUuid: string) =>
        withQuery(`/admin/assignments/${assignmentUuid}`, { subpage: 'editor' }),
      users: {
        users: () => '/admin/users/settings/users',
        usergroups: () => '/admin/users/settings/usergroups',
        roles: () => '/admin/users/settings/roles',
        signups: () => '/admin/users/settings/signups',
        add: () => '/admin/users/settings/add',
        auditLogs: () => '/admin/users/settings/audit-logs',
      },
      orgSettings: {
        general: () => '/admin/org/settings/general',
        branding: () => '/admin/org/settings/branding',
        features: () => '/admin/org/settings/general',
        landing: () => '/admin/org/settings/general',
        seo: () => '/admin/org/settings/general',
        ai: () => '/admin/org/settings/general',
        domains: () => '/admin/org/settings/general',
        api: () => '/admin/org/settings/general',
        sso: () => '/admin/org/settings/general',
        usage: () => '/admin/org/settings/general',
        plan: () => '/admin/org/settings/general',
        other: () => '/admin/org/settings/general',
      },
      platform: {
        organizations: () => '/admin/org-management',
        users: () => '/admin/org-management/users',
        analytics: () => '/admin/org-management',
        organization: (orgId: string | number) => `/admin/org-management/${orgId}`,
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
