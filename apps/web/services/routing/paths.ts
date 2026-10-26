/** A group profile's tabs (People when none); requirements moved to Insights. */
export type GroupView = 'plans' | 'join' | 'requirements'
/** A person's profile tabs (Overview when none). */
export type PersonTab = 'overview' | 'portfolio' | 'plans' | 'access'
/** The organization's profile tabs (Overview when none). */
export type OrgTab = 'overview' | 'invites' | 'join'

/** The Plans area's tabs, each its own page, always in this order. */
export type PlansTabId = 'plans' | 'discover' | 'assignments' | 'requirements' | 'requests'
/** A requirement framework's pages under Plans › Requirements. */
export type FrameworkSubpage = 'details' | 'levels' | 'spec' | 'plans'

const PLANS_TAB_PATHS: Record<PlansTabId, string> = {
  plans: '/admin/plans',
  discover: '/admin/plans/discover',
  assignments: '/admin/plans/assignments',
  requirements: '/admin/plans/requirements',
  requests: '/admin/plans/requests',
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
    orgSignup: () => '/start',
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
    /** One badge a learner earned, by its short code: the badge, who earned it, and its certificate. */
    badgeAward: (code: string) => `/b/${encodeURIComponent(code)}`,
    organizations: () => '/organizations',
    organization: (orgSlug: string) => `/organization/${orgSlug}`,
    search: (query?: string) => withQuery('/discover', { q: query }),
    discover: (params?: { q?: string; type?: string; resource_types?: string; saved?: string }) => withQuery('/discover', params),
    resources: () => '/resources',
    plans: () => '/plans',
    plan: (planSlug: string) => `/plans/${encodeURIComponent(planSlug)}`,
    /** A plan learners can join, as Discover shows it; also the criteria page of the badge it earns. */
    discoverPlan: (templateUuid: string) => `/discover/plans/${encodeURIComponent(templateUuid)}`,
    /** A collection of plans an organization offers learners. */
    discoverCollection: (collectionUuid: string) => `/discover/collections/${encodeURIComponent(collectionUuid)}`,
    resource: (resourceUuid: string) => `/discover/resources/${encodeURIComponent(resourceUuid.replace(/^resource_/, ''))}`,
    user: (username: string) => `/user/${username}`,
    userProjects: (username: string) => `/user/${username}/projects`,
    userProjectDetail: (username: string, slug: string) => `/user/${username}/projects/${encodeURIComponent(slug)}`,
    userResume: (username: string) => `/user/${username}/resume`,
    userPortfolioPost: (username: string, slug: string) => `/user/${username}/portfolio/${slug}`,
    userTimeline: (username: string) => `/user/${username}/timeline`,
    store: {
      root: () => '/store',
      offer: (offerId: string) => `/store/offers/${offerId}`,
    },
    account: {
      root: () => '/account',
      page: (subpage: string) => `/account/${subpage}`,
    },
    /** The org admin side, by tab: Home, Plans (Plans, Discover, Assignments, Requirements), People, Insights, Content, Organization. */
    admin: {
      root: () => '/admin',
      /** One Plans tab's page; with no tab, the org's plans. */
      plans: (tab: PlansTabId = 'plans') => PLANS_TAB_PATHS[tab],
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
      /**
       * Threads: everyone you share a thread with (learners, staff, groups, all staff, the
       * organization), one open beside the list, maybe on one plan (an assignment, for a group)
       * and one of its steps.
       */
      threads: {
        root: (params?: { invite?: 'learner' | 'staff' }) => withQuery('/admin/threads', params),
        person: (userId: number, plan?: string | null, step?: string | null) => withQuery(`/admin/threads/people/${userId}`, { plan, step }),
        group: (groupId: number, plan?: string | null, step?: string | null) => withQuery(`/admin/threads/groups/${groupId}`, { plan, step }),
        staff: () => '/admin/threads/staff',
        org: () => '/admin/threads/org',
      },
      /** Profiles under Threads, opened from a thread's header: a person's, a group's and the organization's. */
      people: {
        /** The list moved to Threads. */
        root: (params?: { invite?: 'learner' | 'staff' }) => withQuery('/admin/threads', params),
        user: (username: string, tab?: PersonTab) =>
          withQuery(`/admin/threads/profiles/people/${encodeURIComponent(username)}`, { tab: tab === 'overview' ? null : tab }),
        /** A group: its people, its plans (one assignment's grid), or its join links. */
        group: (groupId: string | number, view?: GroupView, assignment?: string | null) =>
          withQuery(`/admin/threads/profiles/groups/${encodeURIComponent(String(groupId))}`, { view, assignment: view === 'plans' ? assignment : null }),
        org: (tab?: OrgTab) => withQuery('/admin/threads/profiles/org', { tab: tab === 'overview' ? null : tab }),
      },
      // Template uuids kept their old program uuids.
      template: (templateUuid: string) => `/admin/plans/${encodeURIComponent(templateUuid)}`,
      /** A plan collection under Plans. */
      planCollection: (collectionUuid: string) => `/admin/plans/collections/${encodeURIComponent(collectionUuid)}`,
      /** Plans › Discover: what other organizations share, optionally searched. */
      discover: (q?: string | null) => withQuery(PLANS_TAB_PATHS.discover, { q }),
      /** A plan or collection another organization shares, as Discover shows it. */
      discoverPlan: (templateUuid: string) => `/admin/plans/discover/plan/${encodeURIComponent(templateUuid)}`,
      discoverCollection: (collectionUuid: string) => `/admin/plans/discover/collection/${encodeURIComponent(collectionUuid)}`,
      /** Plans › Requirements: the org's requirement frameworks. */
      requirements: () => PLANS_TAB_PATHS.requirements,
      /** One framework under Plans › Requirements: details, levels, spec, or coverage by plan. */
      requirementFrameworkPlans: frameworkPage,
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
      resources: {
        root: () => '/admin/resources',
        library: () => '/admin/resources/library',
        channel: (channelUuid: string) => `/admin/resources/channel/${encodeURIComponent(channelUuid)}`,
        item: (resourceUuid: string) => `/admin/resources/item/${encodeURIComponent(resourceUuid)}`,
      },
      organization: {
        general: () => '/admin/org/settings/general',
        branding: () => '/admin/org/settings/branding',
        sso: () => '/admin/org/settings/sso',
        messaging: () => '/admin/org/settings/messaging',
        /** The carousel learners see on Discover. */
        discover: () => '/admin/org/settings/discover',
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
} as const
