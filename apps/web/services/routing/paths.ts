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

export function hubFromLegacyResources(
  params: Record<string, string | string[] | undefined>
): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item))
    else if (value !== undefined) search.set(key, value)
  })
  const query = search.toString()
  return query ? `/hub?${query}` : '/hub'
}

export const routePaths = {
  auth: {
    login: (params?: { next?: string; redirect?: string }) =>
      withQuery('/login', params),
    signup: (params?: { next?: string; inviteCode?: string; invitation?: string; mode?: string; inviteBadge?: string }) =>
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
      general: () => '/account',
      security: () => '/account',
      messages: () => '/account/messages',
      organizations: () => '/account/organizations',
      preferences: () => '/account/preferences',
      badges: () => '/account/badges',
    },
    platform: {
      overview: () => '/admin/platform',
      organizations: () => '/admin/platform/orgs',
      users: () => '/admin/platform/users',
      user: (username: string) => `/admin/platform/users/${encodeURIComponent(username)}`,
      requests: () => '/admin/platform/requests',
      settings: () => '/admin/platform/settings',
      news: () => '/admin/news',
      analytics: () => '/admin/platform',
      organization: (orgId: string | number) => `/admin/platform/orgs/${orgId}`,
    },
  },
  org: {
    root: () => '/',
    hub: () => '/hub',
    portfolio: () => '/portfolio',
    portfolioProjects: () => '/portfolio/projects',
    portfolioProjectsNew: () => '/portfolio/projects/new',
    portfolioProjectDetail: (projectUuid: string) => `/portfolio/projects/${encodeURIComponent(projectUuid)}`,
    portfolioPreview: () => '/portfolio/preview',
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
    organizations: () => '/organizations',
    organization: (orgSlug: string) => `/organization/${orgSlug}`,
    search: (query?: string) => withQuery('/search', { q: query }),
    boards: () => '/boards',
    communities: () => '/communities',
    resources: () => '/resources',
    podcasts: () => '/podcasts',
    badges: () => '/badges',
    plans: () => '/plans',
    plan: (planSlug: string) => `/plans/${encodeURIComponent(planSlug)}`,
    groupPlan: (assignmentUuid: string) => withQuery('/plans', { group: assignmentUuid }),
    programs: () => '/programs',
    program: (programSlug: string) => `/programs/${encodeURIComponent(programSlug)}`,
    myBadges: () => '/badges/my-badges',
    badgeDetail: (badgeUuid: string) => `/badges/${badgeUuid}`,
    badgeStatus: (courseUuid: string) => `/badges/${courseUuid}/badge`,
    badgePath: (courseUuid: string) => `/badges/${courseUuid}/path`,
    badgeChapter: (courseUuid: string, chapterId: string) =>
      `/badges/${courseUuid}/chapter/${chapterId}`,
    badgeInvite: (courseUuid: string) => `/badges/${courseUuid}/invite`,
    resource: (resourceUuid: string) => `/resource/${resourceUuid}`,
    podcast: (podcastUuid: string) => `/podcast/${podcastUuid}`,
    playground: (playgroundUuid: string) => `/playground/${playgroundUuid}`,
    community: (communityUuid: string) => `/community/${communityUuid}`,
    communityDiscussion: (communityUuid: string, discussionUuid: string) =>
      `/community/${communityUuid}/discussion/${discussionUuid}`,
    user: (username: string) => `/user/${username}`,
    userProjects: (username: string) => `/user/${username}/projects`,
    userProjectDetail: (username: string, slug: string) => `/user/${username}/projects/${encodeURIComponent(slug)}`,
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
      badges: () => '/admin/badges',
      programs: () => '/admin/plans',
      program: (programUuid: string) => `/admin/plans/${encodeURIComponent(programUuid)}`,
      programPage: (programUuid: string, subpage: string) => `/admin/plans/${encodeURIComponent(programUuid)}/${encodeURIComponent(subpage)}`,
      programAssignmentNew: (programUuid: string) => `/admin/plans/${encodeURIComponent(programUuid)}/assignments/new`,
      planAssignments: () => '/admin/plans/assignments',
      planRequirements: () => '/admin/plans/requirements',
      planReporting: () => '/admin/plans/reporting',
      planAssignment: (assignmentUuid: string, subpage = 'overview') => `/admin/plans/assignments/${encodeURIComponent(assignmentUuid)}/${encodeURIComponent(subpage)}`,
      livePlan: (planUuid: string, subpage = 'overview') => subpage === 'overview' ? `/admin/plans/live/${encodeURIComponent(planUuid)}` : `/admin/plans/live/${encodeURIComponent(planUuid)}/${encodeURIComponent(subpage)}`,
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
      boardSettings: (boardUuid: string, subpage: string) => {
        void boardUuid
        void subpage
        return '/admin'
      },
      boardRoot: (boardUuid: string) => {
        void boardUuid
        return '/admin'
      },
      resourceChannelSettings: (channelUuid: string, subpage: string) =>
        `/admin/resources/${channelUuid}/${subpage}`,
      podcastSettings: (podcastUuid: string, subpage: string) =>
        `/admin/podcasts/podcast/${podcastUuid}/${subpage}`,
      communitySettings: (communityUuid: string, subpage: string) =>
        `/admin/communities/${communityUuid}/${subpage}`,
      users: {
        users: () => '/admin/users',
        grading: () => '/admin/users/grading',
        user: (username: string) => `/admin/users/user/${encodeURIComponent(username)}`,
        userPage: (username: string, subpage: string) => `/admin/users/user/${encodeURIComponent(username)}/${encodeURIComponent(subpage)}`,
        usergroups: () => '/admin/users',
        roles: () => '/admin/users/roles',
        signups: () => '/admin/users/signups',
        add: () => '/admin/users/new',
        auditLogs: () => '/admin/users/audit-logs',
        group: (groupId: string | number) => `/admin/users/groups/${encodeURIComponent(String(groupId))}`,
        groupProgram: (groupId: string | number, assignmentUuid: string, subpage = 'progress') => `/admin/users/groups/${encodeURIComponent(String(groupId))}/programs/${encodeURIComponent(assignmentUuid)}/${encodeURIComponent(subpage)}`,
        // TODO(users-navigation-review): remove these aliases after old links have expired.
        cohort: (groupId: string | number) => `/admin/users/groups/${encodeURIComponent(String(groupId))}`,
        cohortProgram: (groupId: string | number, assignmentUuid: string, subpage = 'progress') => `/admin/users/groups/${encodeURIComponent(String(groupId))}/programs/${encodeURIComponent(assignmentUuid)}/${encodeURIComponent(subpage)}`,
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
        settings: () => '/admin/platform/settings',
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
  },
} as const
