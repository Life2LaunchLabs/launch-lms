import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverFromLegacy, coachFromLegacy, routePaths, withQuery } from '../paths.ts'
import { resolveRequestRouting, type RequestInstanceInfo } from '../requestPolicy.ts'
import { classifyRoute } from '../routeAccess.ts'
import { buildPublicRequestUrl, getCanonicalOrgHostname } from '../context.ts'
import { hubTimestampDate } from '../../hub/timestamp.ts'
import { isManagedHost, legacyParentCookieDomain, safeHandoffPath } from '../handoff.ts'
import { hasRoutableSession, SERVER_AUTH_HEADERS } from '../../auth/sessionCookies.ts'
import { NextRequest } from 'next/server.js'
import { rewriteWithRequestHeaders } from '../rewriteResponse.ts'

function unsignedToken(exp: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ exp })}.unsigned`
}

test('routing ignores expired access-only cookies but preserves recoverable sessions', () => {
  const now = 2_000_000_000
  assert.equal(hasRoutableSession({}, now), false)
  assert.equal(hasRoutableSession({ accessToken: 'not-a-jwt' }, now), false)
  assert.equal(hasRoutableSession({ accessToken: unsignedToken(now - 1) }, now), false)
  assert.equal(hasRoutableSession({ accessToken: unsignedToken(now + 1) }, now), true)
  assert.equal(hasRoutableSession({ accessToken: unsignedToken(now - 1), refreshToken: 'not-a-jwt' }, now), false)
  assert.equal(hasRoutableSession({ accessToken: unsignedToken(now - 1), refreshToken: unsignedToken(now - 1) }, now), false)
  assert.equal(hasRoutableSession({ accessToken: unsignedToken(now - 1), refreshToken: unsignedToken(now + 1) }, now), true)
})

test('organization rewrites carry a sanitized server auth context', () => {
  const cookie = 'access_token_cookie=access.jwt; refresh_token_cookie=refresh.jwt'
  const request = new NextRequest('https://unstable.life2launch.app/portfolio', {
    headers: {
      cookie,
      [SERVER_AUTH_HEADERS.accessToken]: 'client-forged-access',
      [SERVER_AUTH_HEADERS.refreshToken]: 'client-forged-refresh',
    },
  })
  const response = rewriteWithRequestHeaders(request, '/orgs/default/portfolio')

  assert.match(response.headers.get('x-middleware-override-headers') || '', /(^|,)cookie(,|$)/)
  assert.equal(response.headers.get('x-middleware-request-cookie'), cookie)
  assert.equal(response.headers.get(`x-middleware-request-${SERVER_AUTH_HEADERS.accessToken}`), 'access.jwt')
  assert.equal(response.headers.get(`x-middleware-request-${SERVER_AUTH_HEADERS.refreshToken}`), 'refresh.jwt')
  assert.equal(response.headers.get('cookie'), null)

  const unauthenticatedRequest = new NextRequest('https://unstable.life2launch.app/portfolio', {
    headers: { [SERVER_AUTH_HEADERS.accessToken]: 'client-forged-access' },
  })
  const unauthenticatedResponse = rewriteWithRequestHeaders(
    unauthenticatedRequest,
    '/orgs/default/portfolio'
  )
  assert.equal(
    unauthenticatedResponse.headers.get(`x-middleware-request-${SERVER_AUTH_HEADERS.accessToken}`),
    null
  )
})

test('session handoff only targets the same installation and one organization label', () => {
  const domain = 'unstable.life2launch.app'
  assert.equal(isManagedHost(domain, domain), true)
  assert.equal(isManagedHost(`school.${domain}`, domain), true)
  for (const host of [
    'school.life2launch.app', 'life2launch.dev',
    `nested.school.${domain}`, `school.${domain}.evil.test`,
    `school.${domain}:9999`, `${domain}@evil.test`,
  ]) {
    assert.equal(isManagedHost(host, domain), false, host)
  }
})

test('handoff return paths cannot navigate to another origin', () => {
  assert.equal(safeHandoffPath('/admin?tab=users#roles'), true)
  for (const path of ['//evil.test', '/\\evil.test', 'https://evil.test', '/home\nX-Test: bad']) {
    assert.equal(safeHandoffPath(path), false, path)
  }
})

test('legacy cookie cleanup only accepts an actual parent of the environment domain', () => {
  assert.equal(legacyParentCookieDomain('unstable.life2launch.app', 'life2launch.app'), '.life2launch.app')
  assert.equal(legacyParentCookieDomain('life2launch.app', '.life2launch.app'), '.life2launch.app')
  assert.equal(legacyParentCookieDomain('unstable.life2launch.app', 'evil.test'), undefined)
  assert.equal(legacyParentCookieDomain('evil-life2launch.app', 'life2launch.app'), undefined)
})

const instanceInfo: RequestInstanceInfo = {
  multi_org_enabled: true,
  default_org_slug: 'default',
  frontend_domain: 'launchlms.test',
  top_domain: 'launchlms.test',
}

test('default organization canonical host is the installation apex regardless of cookie scope', () => {
  assert.equal(
    getCanonicalOrgHostname('default', 'default', 'unstable.life2launch.app'),
    'unstable.life2launch.app'
  )
  assert.equal(
    getCanonicalOrgHostname('school', 'default', 'unstable.life2launch.app'),
    'school.unstable.life2launch.app'
  )
  assert.equal(
    getCanonicalOrgHostname('default', 'default', 'localhost:3000'),
    'localhost'
  )
})

test('Coach treats timezone-less server timestamps as UTC before local display', () => {
  assert.equal(
    hubTimestampDate('2026-09-08T12:00:00').getTime(),
    new Date('2026-09-08T12:00:00Z').getTime()
  )
  assert.equal(
    hubTimestampDate('2026-09-08T12:00:00-07:00').getTime(),
    new Date('2026-09-08T12:00:00-07:00').getTime()
  )
})

test('withQuery omits empty values and encodes query params', () => {
  assert.equal(
    withQuery('/signup', {
      mode: 'create-org',
      next: '/admin/badges',
      inviteCode: '',
      ignored: undefined,
    }),
    '/signup?mode=create-org&next=%2Fadmin%2Fbadges'
  )
})

test('legacy resource and search links land in Discover with their query', () => {
  assert.equal(
    discoverFromLegacy({ channel: 'shared channel', q: 'career planning', tag: ['one', 'two'] }),
    '/discover?q=career+planning&type=resources&channel=shared+channel'
  )
  assert.equal(discoverFromLegacy({ q: 'career planning', type: 'resources' }), '/discover?q=career+planning&type=resources')
  assert.equal(discoverFromLegacy({ query: ['interviews', 'other'] }), '/discover?q=interviews')
  assert.equal(discoverFromLegacy({}), '/discover')
})

test('legacy Coach links open Coach beside Plans, or the resource or search they named', () => {
  assert.equal(coachFromLegacy({}), '/plans?coach=open')
  assert.equal(coachFromLegacy({ conversation: 'hub_conversation_1' }), '/plans?coach=open&coach_conversation=hub_conversation_1')
  assert.equal(coachFromLegacy({ resource: 'resource_abc' }), '/discover/resources/abc')
  assert.equal(coachFromLegacy({ q: 'resume help' }), '/discover?q=resume+help')
  assert.equal(coachFromLegacy({ view: 'resources' }), '/discover?type=resources')
})

test('route manifest builds admin tab and owner routes', () => {
  const admin = routePaths.org.admin
  assert.equal(admin.root(), '/admin')
  assert.equal(admin.assignments(), '/admin/plans')
  assert.equal(admin.planReview({ assignment: 'assignment_1', objective: 'objective_1' }), '/admin/plans/review?assignment=assignment_1&objective=objective_1')
  assert.equal(admin.livePlan('plan_1'), '/admin/plans/live/plan_1')
  assert.equal(admin.livePlan('plan_1', 'reviews'), '/admin/plans/live/plan_1/reviews')
  assert.equal(admin.people.root(), '/admin/users')
  assert.equal(admin.people.user('learner'), '/admin/users/user/learner/overview')
  assert.equal(admin.people.userPage('learner', 'plans'), '/admin/users/user/learner/plans')
  assert.equal(admin.people.group(2), '/admin/users/groups/2/plans')
  assert.equal(admin.people.group(2, 'members'), '/admin/users/groups/2/members')
  assert.equal(admin.people.groupPlans(2, 'assignment_1'), '/admin/users/groups/2/plans?assignment=assignment_1')
  assert.equal(admin.templates(), '/admin/plans/templates')
  assert.equal(admin.templatePage('template 1', 'overview'), '/admin/plans/template%201/overview')
  assert.equal(admin.badges(), '/admin/badges')
  assert.equal(admin.badge('badge_abc', 'routes'), '/admin/badges/badge/abc/routes')
  assert.equal(admin.insights(), '/admin/plans/requirements')
  assert.equal(admin.requirementFramework('framework 1', 'levels'), '/admin/plans/requirements/framework%201/levels')
  assert.equal(admin.content.resourceChannel('channel_1', 'general'), '/admin/resources/channel_1/general')
  assert.equal(admin.organization.general(), '/admin/org/settings/general')
  assert.equal(admin.payments.overview(), '/admin/payments/overview')
  assert.equal(routePaths.owner.platform.organization(42), '/admin/platform/orgs/42')
  assert.equal(routePaths.owner.platform.newsPost('article_1'), '/admin/news/article_1')
  assert.equal(routePaths.auth.login({ next: '/' }), '/login?next=%2F')
})

test('dead dashboard builders are gone with the dash namespace', () => {
  assert.equal('dash' in routePaths.org, false)
  for (const name of ['analytics', 'feedback', 'boards', 'communities', 'communitySettings', 'planAssignment', 'programs']) {
    assert.equal(name in routePaths.org.admin, false, name)
  }
  assert.equal('roles' in routePaths.org.admin.people, false)
})

test('route manifest builds auth, account, and public org paths used by navigation surfaces', () => {
  assert.equal(routePaths.auth.signup({ mode: 'create-org' }), '/signup?mode=create-org')
  assert.equal(routePaths.owner.account.root(), '/account')
  assert.equal(routePaths.owner.account.security(), '/account')
  assert.equal(routePaths.owner.account.messages(), '/account/messages')
  assert.equal(routePaths.owner.account.organizations(), '/account/organizations')
  assert.equal(routePaths.owner.account.memory(), '/account/memory')
  assert.equal(routePaths.owner.account.badges(), '/account/badges')
  assert.equal(routePaths.org.home(), '/plans')
  assert.equal(routePaths.org.coachOpen({ prompt: 'Help me plan' }), '/plans?coach=open&coach_prompt=Help+me+plan')
  assert.equal(routePaths.org.portfolio(), '/portfolio')
  assert.equal(routePaths.org.portfolioEdit(), '/portfolio/edit')
  assert.equal(routePaths.org.portfolioResume(), '/portfolio/resume')
  assert.equal(routePaths.org.portfolioTimeline(), '/portfolio/timeline')
  assert.equal(routePaths.org.organization('acme'), '/organization/acme')
  assert.equal(routePaths.org.user('jane'), '/user/jane')
  assert.equal(routePaths.org.userResume('jane'), '/user/jane/resume')
  assert.equal(routePaths.org.userTimeline('jane'), '/user/jane/timeline')
  assert.equal(routePaths.org.search('ai prompts'), '/discover?q=ai+prompts')
  assert.equal(routePaths.org.resource('resource_1'), '/discover/resources/1')

  assert.equal(routePaths.org.portfolioBadges(), '/portfolio/badges')
  assert.equal(routePaths.org.discover(), '/discover')
  assert.equal(routePaths.org.badgeDetail('badge-slug'), '/badges/badge-slug')
  assert.equal('profile' in routePaths.org, false)
  assert.equal('welcome' in routePaths.org, false)
})

test('navigation manifest smoke test keeps representative routes absolute and unique', () => {
  const navigationRoutes = [
    routePaths.org.home(),
    routePaths.org.portfolio(),
    routePaths.org.discover(),
    routePaths.owner.account.root(),
    routePaths.owner.account.messages(),
    routePaths.org.root(),
    routePaths.org.portfolioTimeline(),
    routePaths.org.admin.root(),
    routePaths.org.admin.badges(),
    routePaths.org.admin.people.root(),
    routePaths.org.admin.organization.general(),
    routePaths.owner.platform.organizations(),
  ]

  navigationRoutes.forEach((route) => {
    assert.ok(route.startsWith('/'))
  })

  assert.equal(new Set(navigationRoutes).size, navigationRoutes.length)
})

test('legacy course and collection route helpers are absent', () => {
  assert.equal('course' in routePaths.org, false)
  assert.equal('courses' in routePaths.org, false)
  assert.equal('collections' in routePaths.org, false)
  assert.equal('courseSettings' in routePaths.org.admin, false)
})

test('request policy redirects authenticated org root to plans', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/',
    pathname: '/',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(decision.destination, 'https://acme.launchlms.test/plans')
})

test('activity previews render on the requested host so they can be framed', () => {
  for (const [host, hasSession] of [['launchlms.test', false], ['acme.launchlms.test', true]] as const) {
    const decision = resolveRequestRouting({
      requestUrl: `https://${host}/preview/activity/lpv_abc?org=acme&embed=1`,
      pathname: '/preview/activity/lpv_abc',
      search: '?org=acme&embed=1',
      host,
      hasSession,
      instanceInfo,
      resolvedCustomDomainOrgSlug: null,
      orgSubdomainAccess: { user_site_enabled: false },
    })
    assert.equal(decision.action, 'rewrite')
    assert.equal(decision.destination, '/orgs/acme/preview/activity/lpv_abc?org=acme&embed=1')
  }
  const unsafe = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/preview/activity/lpv_abc?org=../x',
    pathname: '/preview/activity/lpv_abc',
    search: '?org=../x',
    host: 'launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })
  assert.notEqual(unsafe.destination, '/orgs/../x/preview/activity/lpv_abc?org=../x')
})

test('request policy rewrites nested account tabs to the current organization', () => {
  for (const pathname of ['/account/messages', '/account/organizations', '/account/memory', '/account/preferences']) {
    const decision = resolveRequestRouting({
      requestUrl: `https://launchlms.test${pathname}`,
      pathname,
      search: '',
      host: 'launchlms.test',
      hasSession: true,
      instanceInfo,
      resolvedCustomDomainOrgSlug: null,
      orgSubdomainAccess: null,
    })
    assert.equal(decision.action, 'rewrite')
    assert.equal(decision.destination, `/orgs/default${pathname}`)
  }
})

test('request policy keeps review queue links on the canonical org route', () => {
  const target = routePaths.org.admin.planReview({ assignment: 'assignment_1', objective: 'objective_1' })
  const [pathname, query = ''] = target.split('?')
  const decision = resolveRequestRouting({
    requestUrl: `https://launchlms.test${pathname}`,
    pathname,
    search: query ? `?${query}` : '',
    host: 'launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })
  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/default/admin/plans/review?assignment=assignment_1&objective=objective_1')
})

test('old admin and dashboard URLs redirect once, in one place, keeping their query', () => {
  const cases: [string, string, string][] = [
    ['/dash', '', '/admin'],
    ['/dash/users/settings/roles', '', '/admin/users'],
    ['/dash/badges', '?tab=marketplace', '/admin/badges?tab=marketplace'],
    ['/admin/analytics', '', '/admin'],
    ['/admin/boards/board_1/general', '', '/admin'],
    ['/admin/feedback', '', '/admin/platform/feedback'],
    ['/admin/org-management', '', '/admin/platform/orgs'],
    ['/admin/org-management/7', '', '/admin/platform/orgs/7'],
    ['/admin/programs', '', '/admin/plans/templates'],
    ['/admin/programs/program_1/assignments', '', '/admin/plans/program_1/overview'],
    ['/admin/programs/program_1/settings', '', '/admin/plans/program_1/settings'],
    ['/admin/plans/reporting', '', '/admin/plans/requirements'],
    ['/admin/plans/assignments/assignment_1/learners', '', '/admin/plans'],
    ['/admin/plans/template_1/assignments/new', '', '/admin/plans/template_1/overview'],
    ['/admin/plans/requirements/fw_1', '', '/admin/plans/requirements/fw_1/details'],
    ['/admin/users/jane', '', '/admin/users/user/jane/overview'],
    ['/admin/users/roles', '', '/admin/users'],
    ['/admin/users/user/jane', '', '/admin/users/user/jane/overview'],
    ['/admin/users/user/jane/assignments', '', '/admin/users/user/jane/plans'],
    ['/admin/users/cohorts/3/programs/assignment_1', '', '/admin/users/groups/3/plans?assignment=assignment_1'],
    ['/admin/users/groups/3', '', '/admin/users/groups/3/plans'],
    ['/admin/users/groups/3/users', '', '/admin/users/groups/3/members'],
    ['/admin/users/groups/3/programs/assignment_1/learners', '', '/admin/users/groups/3/plans?assignment=assignment_1'],
    ['/admin/badges/marketplace', '', '/admin/badges?tab=marketplace'],
    ['/admin/badges/badge/abc', '', '/admin/badges/badge/abc/analytics'],
    ['/admin/badges/collection/c1', '', '/admin/badges/collection/c1/badges'],
    ['/admin/resources/channel_1', '', '/admin/resources/channel_1/general'],
    ['/plans/groups/assignment_1', '', '/plans'],
  ]
  for (const [pathname, search, expected] of cases) {
    const decision = resolveRequestRouting({
      requestUrl: `https://acme.launchlms.test${pathname}${search}`,
      pathname,
      search,
      host: 'acme.launchlms.test',
      hasSession: true,
      instanceInfo,
      resolvedCustomDomainOrgSlug: null,
      orgSubdomainAccess: null,
    })
    assert.equal(decision.action, 'redirect', pathname)
    assert.equal(decision.destination, `https://acme.launchlms.test${expected}`, pathname)
  }
})

test('live admin pages are not caught by the legacy redirects', () => {
  for (const pathname of ['/admin', '/admin/plans', '/admin/plans/template_1/assignments', '/admin/plans/requirements/fw_1/spec', '/admin/resources/tags', '/admin/users/groups/3/members', '/admin/users/user/jane/plans', '/admin/badges/badge/abc/routes', '/plans/sb3']) {
    const decision = resolveRequestRouting({
      requestUrl: `https://acme.launchlms.test${pathname}`,
      pathname,
      search: '',
      host: 'acme.launchlms.test',
      hasSession: true,
      instanceInfo,
      resolvedCustomDomainOrgSlug: null,
      orgSubdomainAccess: null,
    })
    assert.equal(decision.action, 'rewrite', pathname)
    assert.equal(decision.destination, `/orgs/acme${pathname}`, pathname)
  }
})

test('request policy rewrites unauthenticated org root to the landing page', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/',
    pathname: '/',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/acme/')
})

test('request policy rewrites main-domain traffic into internal org routes', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/badges',
    pathname: '/badges',
    search: '',
    host: 'launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/default/badges')
})

test('request policy preserves query params when rewriting user profile routes', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/user/admin?tab=achievements',
    pathname: '/user/admin',
    search: '?tab=achievements',
    host: 'launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/default/user/admin?tab=achievements')
})

test('request policy keeps main-host dashboard traffic on the default org even if old org cookies existed', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/admin',
    pathname: '/admin',
    search: '',
    host: 'launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/default/admin')
})

test('request policy rewrites custom-domain traffic into resolved org routes and keeps host-scoped cookies', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://learn.example.com/badges',
    pathname: '/badges',
    search: '',
    host: 'learn.example.com',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: 'acme',
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/acme/badges')
  assert.ok(decision.cookies?.some((cookie) => cookie.name === 'launchlms_custom_domain'))
})

test('request policy routes auth pages through auth namespace while preserving org cookies', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/login',
    pathname: '/login',
    search: '?next=%2Fdash',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/auth/login?next=%2Fdash')
})

test('request policy keeps auth query params when rewriting create-org signup flow', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/signup?mode=create-org',
    pathname: '/signup',
    search: '?mode=create-org',
    host: 'launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/auth/signup?mode=create-org')
})

test('request policy redirects authenticated login and signup pages to plans', () => {
  const loginDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/login',
    pathname: '/login',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })
  const signupDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/signup',
    pathname: '/signup',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(loginDecision.action, 'redirect')
  assert.equal(loginDecision.destination, 'https://acme.launchlms.test/plans')
  assert.equal(signupDecision.action, 'redirect')
  assert.equal(signupDecision.destination, 'https://acme.launchlms.test/plans')
})

test('request policy preserves an explicit login recovery target despite a stale session hint', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/login?next=%2Fportfolio',
    pathname: '/login',
    search: '?next=%2Fportfolio',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/auth/login?next=%2Fportfolio')
})

test('request policy redirects unauthenticated protected paths to root landing', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/resources',
    pathname: '/resources',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(decision.destination, 'https://acme.launchlms.test/')
})

test('route access treats welcome onboarding as public', () => {
  assert.equal(classifyRoute('/').kind, 'public')
  assert.equal(classifyRoute('/welcome').kind, 'public')
})

test('route access exposes only the new public portfolio surfaces', () => {
  assert.equal(classifyRoute('/user/maya').kind, 'public')
  assert.equal(classifyRoute('/user/maya/work').kind, 'public')
  assert.equal(classifyRoute('/user/maya/work/community-garden').kind, 'public')
  assert.equal(classifyRoute('/user/maya/resume').kind, 'protected')
})

test('request policy serves welcome onboarding from the app route', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/welcome?email=learner%40example.com',
    pathname: '/welcome',
    search: '?email=learner%40example.com',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'next')
})

test('request policy allows unauthenticated badge entry pages', () => {
  const canonicalDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/badges/badge-slug',
    pathname: '/badges/badge-slug',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })
  assert.equal(canonicalDecision.action, 'rewrite')
  assert.equal(canonicalDecision.destination, '/orgs/acme/badges/badge-slug')
})

test('request policy redirects direct internal org paths to canonical org URLs', () => {
  const subdomainDecision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/orgs/acme/resources',
    pathname: '/orgs/acme/resources',
    search: '',
    host: 'launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })
  const defaultDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/orgs/default/resources?tab=all',
    pathname: '/orgs/default/resources',
    search: '?tab=all',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(subdomainDecision.action, 'redirect')
  assert.equal(subdomainDecision.destination, 'https://acme.launchlms.test/resources')
  assert.equal(defaultDecision.action, 'redirect')
  assert.equal(defaultDecision.destination, 'https://launchlms.test/resources?tab=all')
})

test('canonical redirects do not expose a reverse proxy internal scheme or port', () => {
  const publicRequestUrl = buildPublicRequestUrl(
    'http://life2launch-core.com:8000/orgs/default/badges/teamwork',
    'life2launch-core.com',
    'https'
  )
  const decision = resolveRequestRouting({
    requestUrl: publicRequestUrl,
    pathname: '/orgs/default/badges/teamwork',
    search: '?returnTo=%2Fportfolio',
    host: 'life2launch-core.com',
    hasSession: true,
    instanceInfo: {
      ...instanceInfo,
      frontend_domain: 'life2launch-core.com',
      top_domain: 'life2launch-core.com',
    },
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(
    decision.destination,
    'https://life2launch-core.com/badges/teamwork?returnTo=%2Fportfolio'
  )
})

test('request policy rewrites sitemap and annotates org slug header', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/sitemap.xml',
    pathname: '/sitemap.xml',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/api/sitemap')
  assert.equal(decision.headers?.['X-Sitemap-Orgslug'], 'acme')
})

test('request policy brands main-host auth routes with the default org', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/login',
    pathname: '/login',
    search: '',
    host: 'launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/auth/login')
  assert.equal(decision.cookies?.length ?? 0, 0)
})

test('request policy redirects non-entitled org subdomains back to the main host', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/badges',
    pathname: '/badges',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: { user_site_enabled: false },
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(decision.destination, 'https://launchlms.test/badges')
})
