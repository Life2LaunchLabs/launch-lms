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

function flatten(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

/** Where old Hub, resources and search URLs land: Discover keeps the query and resource filters. */
export function discoverFromLegacy(params: Record<string, string | string[] | undefined>): string {
  const query = flatten(params, 'q') || flatten(params, 'query')
  const resourceFilter = ['channel', 'user_channel', 'resource_types', 'tags', 'access', 'provider'].some((key) => flatten(params, key))
  const type = flatten(params, 'type') === 'resources' || flatten(params, 'view') === 'resources' || resourceFilter ? 'resources' : undefined
  return withQuery('/discover', { q: query, type, channel: flatten(params, 'channel'), resource_types: flatten(params, 'resource_types') })
}

/**
 * The old full-page Hub URL. Hub now lives beside every page, so a conversation link opens
 * Hub over Plans; a resource opens its page in Discover; a search becomes a Discover search.
 */
export function hubFromLegacy(params: Record<string, string | string[] | undefined>): string {
  const resource = flatten(params, 'resource')
  if (resource) return routePaths.org.resource(resource)
  if (flatten(params, 'q') || flatten(params, 'query') || flatten(params, 'view') === 'resources' || flatten(params, 'channel')) return discoverFromLegacy(params)
  return routePaths.org.hubOpen({ conversation: flatten(params, 'conversation') })
}

export const routePaths = {
  auth: {
    login: (params?: { next?: string; redirect?: string }) =>
      withQuery('/login', params),
    signup: (params?: { next?: string; inviteCode?: string; invitation?: string; mode?: string }) =>
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
      memory: () => '/account/memory',
      preferences: () => '/account/preferences',
      badges: () => '/account/badges',
    },
    platform: {
      overview: () => '/admin/platform',
      organizations: () => '/admin/platform/orgs',
      users: () => '/admin/platform/users',
      user: (username: string) => `/admin/platform/users/${encodeURIComponent(username)}`,
      requests: () => '/admin/platform/requests',
      feedback: () => '/admin/platform/feedback',
      demo: () => '/admin/platform/demo',
      settings: () => '/admin/platform/settings',
      news: () => '/admin/news',
      analytics: () => '/admin/platform',
      organization: (orgId: string | number) => `/admin/platform/orgs/${orgId}`,
    },
  },
  org: {
    root: () => '/',
    /** Plans is where the learner app opens. */
    home: () => '/plans',
    /** Opens Hub beside Plans, optionally resuming a conversation or starting with a prompt. */
    hubOpen: (params?: { conversation?: string; prompt?: string }) => withQuery('/plans', { hub: 'open', hub_conversation: params?.conversation, hub_prompt: params?.prompt }),
    portfolio: () => '/portfolio',
    portfolioProjects: () => '/portfolio/projects',
    portfolioProjectsNew: () => '/portfolio/projects/new',
    portfolioProjectDetail: (projectUuid: string) => `/portfolio/projects/${encodeURIComponent(projectUuid)}`,
    portfolioPreview: () => '/portfolio/preview',
    portfolioEdit: () => '/portfolio/edit',
    portfolioPost: (slug: string) => `/portfolio/journal/${slug}`,
    portfolioResume: () => '/portfolio/resume',
    portfolioTimeline: () => '/portfolio/timeline',
    portfolioBadges: () => '/portfolio/badges',
    portfolioAchievements: () => '/portfolio/achievements',
    portfolioAchievementDetail: (achievementId: string) => `/portfolio/achievements/${achievementId}`,
    badgesVerify: (uuid: string) => `/badges/${uuid}/verify`,
    organizations: () => '/organizations',
    organization: (orgSlug: string) => `/organization/${orgSlug}`,
    search: (query?: string) => withQuery('/discover', { q: query }),
    discover: (params?: { q?: string; type?: string }) => withQuery('/discover', params),
    boards: () => '/boards',
    communities: () => '/communities',
    resources: () => '/resources',
    podcasts: () => '/podcasts',
    plans: () => '/plans',
    plan: (planSlug: string) => `/plans/${encodeURIComponent(planSlug)}`,
    badgeDetail: (badgeUuid: string) => `/badges/${badgeUuid}`,
    resource: (resourceUuid: string) => `/discover/resources/${encodeURIComponent(resourceUuid.replace(/^resource_/, ''))}`,
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
      plans: () => '/admin/plans',
      planReview: (params: { assignment: string; objective?: string | null; planObjective?: string | null; activity?: string | null; focus?: string | null }) =>
        withQuery('/admin/plans/review', { assignment: params.assignment, objective: params.objective, step: params.planObjective, activity: params.activity, focus: params.focus }),
      programs: () => '/admin/plans/templates',
      program: (programUuid: string) => `/admin/plans/${encodeURIComponent(programUuid)}`,
      programPage: (programUuid: string, subpage: string) => `/admin/plans/${encodeURIComponent(programUuid)}/${encodeURIComponent(subpage)}`,
      programAssignmentNew: (programUuid: string) => `/admin/plans/${encodeURIComponent(programUuid)}/assignments/new`,
      planRequirements: () => '/admin/plans/requirements',
      planRequirement: (frameworkUuid: string, subpage = 'details') => `/admin/plans/requirements/${encodeURIComponent(frameworkUuid)}/${encodeURIComponent(subpage)}`,
      // Resolves an assignment to the page that now shows it: its group's Plans tab or the learner.
      planAssignment: (assignmentUuid: string) => `/admin/plans/assignments/${encodeURIComponent(assignmentUuid)}`,
      livePlan: (planUuid: string, subpage = 'overview') => subpage === 'overview' ? `/admin/plans/live/${encodeURIComponent(planUuid)}` : `/admin/plans/live/${encodeURIComponent(planUuid)}/${encodeURIComponent(subpage)}`,
      news: () => '/admin/news',
      feedback: () => '/admin/feedback',
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
        group: (groupId: string | number, subpage?: string) => subpage
          ? `/admin/users/groups/${encodeURIComponent(String(groupId))}/${encodeURIComponent(subpage)}`
          : `/admin/users/groups/${encodeURIComponent(String(groupId))}`,
        groupPlans: (groupId: string | number, assignmentUuid?: string | null) =>
          withQuery(`/admin/users/groups/${encodeURIComponent(String(groupId))}/plans`, { assignment: assignmentUuid }),
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
        feedback: () => '/admin/platform/feedback',
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
