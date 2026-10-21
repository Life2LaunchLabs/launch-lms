/** What a group in People shows beside the list besides its chat. */
export type GroupView = 'plans' | 'requirements'

/** The Plans area's tabs, each its own page. */
export type PlansTabId = 'assignments' | 'templates' | 'badges' | 'requirements' | 'marketplace'
/** A requirement framework's pages under Plans › Requirements. */
export type FrameworkSubpage = 'details' | 'levels' | 'spec' | 'plans'
/** What the marketplace browses: everything, or one kind ("Add from marketplace" on a tab pre-filters to its kind). */
export type MarketplaceType = 'templates' | 'badges' | 'frameworks'
export type MarketplaceParams = { type?: MarketplaceType | null; creator?: string | number | null; view?: 'browse' | 'requests' | null; q?: string | null }

const PLANS_TAB_PATHS: Record<PlansTabId, string> = {
  assignments: '/admin/plans',
  templates: '/admin/plans/templates',
  badges: '/admin/badges',
  requirements: '/admin/plans/requirements',
  marketplace: '/admin/plans/marketplace',
}

function adminMarketplace(params?: MarketplaceParams): string {
  return withQuery(PLANS_TAB_PATHS.marketplace, { type: params?.type, creator: params?.creator, view: params?.view === 'browse' ? null : params?.view, q: params?.q })
}

function frameworkPage(frameworkUuid: string, subpage: FrameworkSubpage = 'details'): string {
  return `/admin/plans/requirements/${encodeURIComponent(frameworkUuid)}/${encodeURIComponent(subpage)}`
}

/** A framework list for a report: every framework, some, or none. */
function frameworksParam(frameworks?: string[] | 'all' | null): string | null {
  if (frameworks === 'all') return 'all'
  return frameworks?.length ? frameworks.join(',') : null
}

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

/** Where old Hub/Coach, resources and search URLs land: Discover keeps the query and resource filters. */
export function discoverFromLegacy(params: Record<string, string | string[] | undefined>): string {
  const query = flatten(params, 'q') || flatten(params, 'query')
  const resourceFilter = ['channel', 'user_channel', 'resource_types', 'tags', 'access', 'provider'].some((key) => flatten(params, key))
  const type = flatten(params, 'type') === 'resources' || flatten(params, 'view') === 'resources' || resourceFilter ? 'resources' : undefined
  return withQuery('/discover', { q: query, type, channel: flatten(params, 'channel'), resource_types: flatten(params, 'resource_types') })
}

/**
 * The old full-page Hub/Coach URLs. Coach lives beside every page, so a conversation link opens
 * Coach over Plans; a resource opens its page in Discover; a search becomes a Discover search.
 */
export function coachFromLegacy(params: Record<string, string | string[] | undefined>): string {
  const resource = flatten(params, 'resource')
  if (resource) return routePaths.org.resource(resource)
  if (flatten(params, 'q') || flatten(params, 'query') || flatten(params, 'view') === 'resources' || flatten(params, 'channel')) return discoverFromLegacy(params)
  return routePaths.org.coachOpen({ conversation: flatten(params, 'conversation') })
}

export const routePaths = {
  auth: {
    login: (params?: { next?: string; redirect?: string }) =>
      withQuery('/login', params),
    signup: (params?: { next?: string; inviteCode?: string; invitation?: string; mode?: string }) =>
      withQuery('/signup', params),
    orgSignup: () => '/signup/org',
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
      coach: () => '/admin/platform/coach',
      settings: () => '/admin/platform/settings',
      news: () => '/admin/news',
      newsNewPost: () => '/admin/news/new-post',
      newsPost: (articleUuid: string) => `/admin/news/${articleUuid}`,
      analytics: () => '/admin/platform',
      organization: (orgId: string | number) => `/admin/platform/orgs/${orgId}`,
    },
  },
  org: {
    root: () => '/',
    /** The marketing page for people who run learning for others. */
    forOrganizations: () => '/for-organizations',
    /** Plans is where the learner app opens. */
    home: () => '/plans',
    /** Opens Coach beside Plans, optionally resuming a conversation or starting with a prompt. */
    coachOpen: (params?: { conversation?: string; prompt?: string }) => withQuery('/plans', { coach: 'open', coach_conversation: params?.conversation, coach_prompt: params?.prompt }),
    portfolio: () => '/portfolio',
    connect: () => '/connect',
    chat: (conversationUuid: string) => `/connect/${encodeURIComponent(conversationUuid)}`,
    /** Invitations and notices from organizations, listed in Connect. */
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
    discover: (params?: { q?: string; type?: string; resource_types?: string; saved?: string }) => withQuery('/discover', params),
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
    /** The org admin side, by tab: Home, Plans (Assignments, Templates, Badges, Requirements, Marketplace), People, Insights, Content, Organization. */
    admin: {
      root: () => '/admin',
      /** One Plans tab's page; with no tab, Assignments. The sidebar opens the viewer's own first tab instead. */
      plans: (tab: PlansTabId = 'assignments') => PLANS_TAB_PATHS[tab],
      assignments: () => PLANS_TAB_PATHS.assignments,
      // The grading stack; from 'assignment' goes back to the assignment rather than the list.
      planReview: (params: { assignment: string; objective?: string | null; planObjective?: string | null; activity?: string | null; focus?: string | null; from?: 'assignment' | null }) =>
        withQuery('/admin/plans/review', { assignment: params.assignment, objective: params.objective, step: params.planObjective, activity: params.activity, focus: params.focus, from: params.from }),
      // One assignment (a template handed to a group or a person): its plan, or its learners.
      planAssignment: (assignmentUuid: string, subpage: 'plan' | 'learners' = 'plan') => subpage === 'plan'
        ? `/admin/plans/assignments/${encodeURIComponent(assignmentUuid)}` : `/admin/plans/assignments/${encodeURIComponent(assignmentUuid)}/${subpage}`,
      livePlan: (planUuid: string, subpage = 'overview') => subpage === 'overview' ? `/admin/plans/live/${encodeURIComponent(planUuid)}` : `/admin/plans/live/${encodeURIComponent(planUuid)}/${encodeURIComponent(subpage)}`,
      /** A learner's plan feed: their plan from the staff side, its chat open. People's "Open feed" lands here. */
      learnerFeed: (planUuid: string) => `/admin/plans/live/${encodeURIComponent(planUuid)}?chat=plan`,
      /** People: one list of the organization's people and your chats with them, with a chat, a person or a group open beside it. */
      people: {
        root: () => '/admin/users',
        chat: (conversationUuid: string) => `/admin/users/chat/${encodeURIComponent(conversationUuid)}`,
        user: (username: string) => `/admin/users/user/${encodeURIComponent(username)}`,
        /** A group: its chat, or its plans (one assignment's grid) or requirements beside it. */
        group: (groupId: string | number, view?: GroupView, assignment?: string | null) =>
          withQuery(`/admin/users/groups/${encodeURIComponent(String(groupId))}`, { view, assignment: view === 'plans' ? assignment : null }),
      },
      templates: () => PLANS_TAB_PATHS.templates,
      // Template uuids kept their old program uuids.
      template: (templateUuid: string) => `/admin/plans/${encodeURIComponent(templateUuid)}`,
      templatePage: (templateUuid: string, subpage: string) => `/admin/plans/${encodeURIComponent(templateUuid)}/${encodeURIComponent(subpage)}`,
      badges: () => PLANS_TAB_PATHS.badges,
      /** Old name: the marketplace browsing badges. */
      badgeMarketplace: () => adminMarketplace({ type: 'badges' }),
      /** Plans › Marketplace: browse (optionally one kind or one creator) or the requests view. */
      marketplace: adminMarketplace,
      /** Plans › Requirements: the org's requirement frameworks. */
      requirements: () => PLANS_TAB_PATHS.requirements,
      /** One framework under Plans › Requirements: details, levels, spec, or coverage by plan. */
      requirementFrameworkPlans: frameworkPage,
      badgeCollection: (collectionUuid: string, subpage: string) => `/admin/badges/collection/${encodeURIComponent(collectionUuid)}/${encodeURIComponent(subpage)}`,
      badge: (badgeUuid: string, subpage: string) => `/admin/badges/badge/${encodeURIComponent(badgeUuid.replace(/^badge_/, ''))}/${encodeURIComponent(subpage)}`,
      // Insights: reports by group (optionally against requirement frameworks), and learners' evidence by group.
      insights: () => '/admin/insights',
      /** A group's report; `frameworks` adds requirement sections ('all', or framework uuids). */
      insightsReport: (groupId?: string | number | null, frameworks?: string[] | 'all' | null) =>
        withQuery('/admin/insights', { group: groupId == null ? null : String(groupId), fw: frameworksParam(frameworks) }),
      insightsReportPrint: (groupId: string | number, frameworks?: string[] | 'all' | null) =>
        withQuery(`/admin/insights/reports/${encodeURIComponent(String(groupId))}/print`, { fw: frameworksParam(frameworks) }),
      /** Engagement by group (a placeholder for now). */
      insightsEngagement: () => '/admin/insights/engagement',
      /** Requirement coverage by template. */
      insightsCoverage: () => '/admin/insights/coverage',
      insightsEvidence: (groupId?: string | number | null) => withQuery('/admin/insights/evidence', { group: groupId == null ? null : String(groupId) }),
      /** Old name for `requirementFrameworkPlans`; frameworks moved from Insights to Plans › Requirements. */
      requirementFramework: frameworkPage,
      content: {
        resources: () => '/admin/resources',
        resourceTags: () => '/admin/resources/tags',
        resourceChannel: (channelUuid: string, subpage: string) => `/admin/resources/${channelUuid}/${subpage}`,
        podcasts: () => '/admin/podcasts',
        podcast: (podcastUuid: string, subpage: string) => `/admin/podcasts/podcast/${podcastUuid}/${subpage}`,
        playgrounds: () => '/admin/playgrounds',
      },
      organization: {
        general: () => '/admin/org/settings/general',
        branding: () => '/admin/org/settings/branding',
        sso: () => '/admin/org/settings/sso',
        messaging: () => '/admin/org/settings/messaging',
        plan: () => '/admin/org/settings/plan',
      },
      payments: {
        overview: () => '/admin/payments/overview',
        offers: () => '/admin/payments/offers',
        groups: () => '/admin/payments/groups',
        configuration: () => '/admin/payments/configuration',
      },
    },
  },
  editor: {
    board: (boardUuid: string) => `/board/${boardUuid}`,
    playgroundEdit: (playgroundUuid: string) =>
      `/editor/playground/${playgroundUuid}/edit`,
  },
} as const
