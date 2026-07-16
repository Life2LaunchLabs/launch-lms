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
      overview: () => '/admin/platform',
      organizations: () => '/admin/platform/orgs',
      users: () => '/admin/platform/users',
      user: (username: string) => `/admin/platform/users/${encodeURIComponent(username)}`,
      requests: () => '/admin/platform/requests',
      news: () => '/admin/news',
      analytics: () => '/admin/platform',
      organization: (orgId: string | number) => `/admin/platform/orgs/${orgId}`,
    },
  },
  org: {
    root: () => '/',
    portfolio: () => '/portfolio',
    portfolioWork: () => '/portfolio/work',
    portfolioWorkNew: () => '/portfolio/work/new',
    portfolioWorkDetail: (workUuid: string) => `/portfolio/work/${encodeURIComponent(workUuid)}`,
    portfolioPreview: () => '/portfolio/preview',
    portfolioLegacy: () => '/portfolio/legacy',
    portfolioEdit: () => '/portfolio/edit',
    portfolioPost: (slug: string) => `/portfolio/journal/${slug}`,
    portfolioResume: () => '/portfolio/resume',
    portfolioTimeline: () => '/portfolio/timeline',
    portfolioAchievements: () => '/portfolio/achievements',
    portfolioAchievementDetail: (achievementId: string) => `/portfolio/achievements/${achievementId}`,
    news: () => '/news',
    newsArticle: (slug: string) => `/news/${slug}`,
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
    myBadges: () => '/portfolio/badges',
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
    userWork: (username: string) => `/user/${username}/work`,
    userWorkDetail: (username: string, slug: string) => `/user/${username}/work/${encodeURIComponent(slug)}`,
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
      badges: () => '/admin/badges',
      assignments: () => '/admin/assignments',
      news: () => '/admin/news',
      newsNewPost: () => '/admin/news/new-post',
      newsPost: (articleUuid: string) => `/admin/news/${articleUuid}`,
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
        users: () => '/admin/users',
        user: (username: string) => `/admin/users/${encodeURIComponent(username)}`,
        usergroups: () => '/admin/users/groups',
        roles: () => '/admin/users/roles',
        signups: () => '/admin/users/signups',
        add: () => '/admin/users/new',
        auditLogs: () => '/admin/users/audit-logs',
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
        sso: () => '/admin/org/settings/sso',
        usage: () => '/admin/org/settings/general',
        plan: () => '/admin/org/settings/plan',
        other: () => '/admin/org/settings/general',
      },
      platform: {
        overview: () => '/admin/platform',
        organizations: () => '/admin/platform/orgs',
        users: () => '/admin/platform/users',
        user: (username: string) => `/admin/platform/users/${encodeURIComponent(username)}`,
        requests: () => '/admin/platform/requests',
        news: () => '/admin/news',
        analytics: () => '/admin/platform',
        organization: (orgId: string | number) => `/admin/platform/orgs/${orgId}`,
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
