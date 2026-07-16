import test from 'node:test'
import assert from 'node:assert/strict'
import { routePaths, withQuery } from '../paths.ts'
import { resolveRequestRouting, type RequestInstanceInfo } from '../requestPolicy.ts'
import { classifyRoute } from '../routeAccess.ts'
import { buildPublicRequestUrl } from '../context.ts'

const instanceInfo: RequestInstanceInfo = {
  multi_org_enabled: true,
  default_org_slug: 'default',
  frontend_domain: 'launchlms.test',
  top_domain: 'launchlms.test',
}

test('withQuery omits empty values and encodes query params', () => {
  assert.equal(
    withQuery('/signup', {
      mode: 'create-org',
      next: '/admin/courses',
      inviteCode: '',
      ignored: undefined,
    }),
    '/signup?mode=create-org&next=%2Fadmin%2Fcourses'
  )
})

test('route manifest builds key dashboard and owner routes', () => {
  assert.equal(routePaths.org.dash.courseSettings('abc', 'general'), '/admin/courses/course/abc/general')
  assert.equal(routePaths.org.dash.users.roles(), '/admin/users/roles')
  assert.equal(routePaths.owner.platform.organization(42), '/admin/platform/orgs/42')
  assert.equal(routePaths.auth.login({ next: '/' }), '/login?next=%2F')
})

test('route manifest builds auth, account, and public org paths used by navigation surfaces', () => {
  assert.equal(routePaths.auth.signup({ mode: 'create-org' }), '/signup?mode=create-org')
  assert.equal(routePaths.owner.account.orgAdmin(), '/account/org-admin')
  assert.equal(routePaths.owner.account.security(), '/account/security')
  assert.equal(routePaths.owner.account.purchases(), '/account/purchases')
  assert.equal(routePaths.owner.account.organizations(), '/account/organizations')
  assert.equal(routePaths.owner.account.badges(), '/account/badges')
  assert.equal(routePaths.org.portfolio(), '/portfolio')
  assert.equal(routePaths.org.portfolioEdit(), '/portfolio/edit')
  assert.equal(routePaths.org.portfolioResume(), '/portfolio/resume')
  assert.equal(routePaths.org.portfolioTimeline(), '/portfolio/timeline')
  assert.equal(routePaths.org.news(), '/news')
  assert.equal(routePaths.org.newsArticle('release-notes'), '/news/release-notes')
  assert.equal(routePaths.org.organization('acme'), '/organization/acme')
  assert.equal(routePaths.org.user('jane'), '/user/jane')
  assert.equal(routePaths.org.userResume('jane'), '/user/jane/resume')
  assert.equal(routePaths.org.userTimeline('jane'), '/user/jane/timeline')
  assert.equal(routePaths.org.search('ai prompts'), '/search?q=ai+prompts')
  assert.equal(routePaths.org.badges(), '/badges')
  assert.equal(routePaths.org.myBadges(), '/portfolio/badges')
  assert.equal(routePaths.org.course('badge-slug'), '/badges/badge-slug')
  assert.equal(routePaths.org.badgeStatus('badge-slug'), '/badges/badge-slug/badge')
  assert.equal(routePaths.org.badgePath('badge-slug'), '/badges/badge-slug/path')
  assert.equal(routePaths.org.badgeChapter('badge-slug', 'chapter-1'), '/badges/badge-slug/chapter/chapter-1')
  assert.equal(routePaths.org.badgeInvite('badge-slug'), '/badges/badge-slug/invite')
  assert.equal('profile' in routePaths.org, false)
  assert.equal('welcome' in routePaths.org, false)
})

test('navigation manifest smoke test keeps representative routes absolute and unique', () => {
  const navigationRoutes = [
    routePaths.org.portfolio(),
    routePaths.org.news(),
    routePaths.owner.account.security(),
    routePaths.owner.account.orgAdmin(),
    routePaths.org.root(),
    routePaths.org.courses(),
    routePaths.org.collections(),
    routePaths.org.search(),
    routePaths.org.dash.root(),
    routePaths.org.dash.courses(),
    routePaths.org.dash.users.users(),
    routePaths.org.dash.orgSettings.general(),
    routePaths.owner.platform.organizations(),
  ]

  navigationRoutes.forEach((route) => {
    assert.ok(route.startsWith('/'))
  })

  assert.equal(new Set(navigationRoutes).size, navigationRoutes.length)
})

test('request policy redirects authenticated org root to portfolio', () => {
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
  assert.equal(decision.destination, 'https://acme.launchlms.test/portfolio')
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
    requestUrl: 'https://launchlms.test/courses',
    pathname: '/courses',
    search: '',
    host: 'launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/default/courses')
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
    requestUrl: 'https://learn.example.com/courses',
    pathname: '/courses',
    search: '',
    host: 'learn.example.com',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: 'acme',
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/acme/courses')
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

test('request policy redirects authenticated login and signup pages to portfolio', () => {
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
  assert.equal(loginDecision.destination, 'https://acme.launchlms.test/portfolio')
  assert.equal(signupDecision.action, 'redirect')
  assert.equal(signupDecision.destination, 'https://acme.launchlms.test/portfolio')
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
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/badges/badge-slug/invite',
    pathname: '/badges/badge-slug/invite',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(canonicalDecision.action, 'rewrite')
  assert.equal(canonicalDecision.destination, '/orgs/acme/badges/badge-slug')
  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/acme/badges/badge-slug/invite')
})

test('request policy allows unauthenticated news pages', () => {
  const listDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/news',
    pathname: '/news',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })
  const articleDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/news/release-notes',
    pathname: '/news/release-notes',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(listDecision.action, 'rewrite')
  assert.equal(listDecision.destination, '/orgs/acme/news')
  assert.equal(articleDecision.action, 'rewrite')
  assert.equal(articleDecision.destination, '/orgs/acme/news/release-notes')
})

test('request policy allows unauthenticated public course pages', () => {
  const publicCourseDecision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/course/badge-slug/activity/activity_abc',
    pathname: '/course/badge-slug/activity/activity_abc',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(publicCourseDecision.action, 'rewrite')
  assert.equal(publicCourseDecision.destination, '/orgs/acme/course/badge-slug/activity/activity_abc')
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
    'http://life2launch-core.com:8000/orgs/default/badges/system_onboarding',
    'life2launch-core.com',
    'https'
  )
  const decision = resolveRequestRouting({
    requestUrl: publicRequestUrl,
    pathname: '/orgs/default/badges/system_onboarding',
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
    'https://life2launch-core.com/badges/system_onboarding?returnTo=%2Fportfolio'
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
    requestUrl: 'https://acme.launchlms.test/courses',
    pathname: '/courses',
    search: '',
    host: 'acme.launchlms.test',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: { user_site_enabled: false },
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(decision.destination, 'https://launchlms.test/courses')
})
