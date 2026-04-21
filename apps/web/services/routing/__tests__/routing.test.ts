import test from 'node:test'
import assert from 'node:assert/strict'
import { routePaths, withQuery } from '../paths.ts'
import { resolveRequestRouting, type RequestInstanceInfo } from '../requestPolicy.ts'

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
      next: '/dash/courses',
      inviteCode: '',
      ignored: undefined,
    }),
    '/signup?mode=create-org&next=%2Fdash%2Fcourses'
  )
})

test('route manifest builds key dashboard and owner routes', () => {
  assert.equal(routePaths.org.dash.courseSettings('abc', 'general'), '/dash/courses/course/abc/general')
  assert.equal(routePaths.org.dash.users.roles(), '/dash/users/settings/roles')
  assert.equal(routePaths.owner.platform.organization(42), '/dash/org-management/42')
  assert.equal(routePaths.auth.login({ next: '/welcome' }), '/login?next=%2Fwelcome')
})

test('route manifest builds auth, account, and public org paths used by navigation surfaces', () => {
  assert.equal(routePaths.auth.signup({ mode: 'create-org' }), '/signup?mode=create-org')
  assert.equal(routePaths.owner.account.orgAdmin(), '/account/org-admin')
  assert.equal(routePaths.owner.account.purchases(), '/account/purchases')
  assert.equal(routePaths.org.organization('acme'), '/organization/acme')
  assert.equal(routePaths.org.user('jane'), '/user/jane')
  assert.equal(routePaths.org.search('ai prompts'), '/search?q=ai+prompts')
})

test('navigation manifest smoke test keeps representative routes absolute and unique', () => {
  const navigationRoutes = [
    routePaths.owner.account.general(),
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

test('request policy rewrites main-domain traffic into internal org routes', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/courses',
    pathname: '/courses',
    search: '',
    host: 'launchlms.test',
    cookieOrgSlug: null,
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/orgs/default/courses')
})

test('request policy redirects dashboard traffic to org subdomain when cookie org differs from owner org', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/dash',
    pathname: '/dash',
    search: '',
    host: 'launchlms.test',
    cookieOrgSlug: 'acme',
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(decision.destination, 'https://acme.launchlms.test/dash')
})

test('request policy rewrites custom-domain traffic into resolved org routes and keeps host-scoped cookies', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://learn.example.com/courses',
    pathname: '/courses',
    search: '',
    host: 'learn.example.com',
    cookieOrgSlug: null,
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
    cookieOrgSlug: 'acme',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/auth/login?next=%2Fdash')
  assert.ok(decision.cookies?.some((cookie) => cookie.name === 'launchlms_orgslug' && cookie.value === 'acme'))
})

test('request policy keeps auth query params when rewriting create-org signup flow', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://launchlms.test/signup?mode=create-org',
    pathname: '/signup',
    search: '?mode=create-org',
    host: 'launchlms.test',
    cookieOrgSlug: null,
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/auth/signup?mode=create-org')
})

test('request policy redirects unauthenticated protected paths to welcome', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/resources',
    pathname: '/resources',
    search: '',
    host: 'acme.launchlms.test',
    cookieOrgSlug: 'acme',
    hasSession: false,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'redirect')
  assert.equal(decision.destination, 'https://acme.launchlms.test/welcome')
})

test('request policy rewrites sitemap and annotates org slug header', () => {
  const decision = resolveRequestRouting({
    requestUrl: 'https://acme.launchlms.test/sitemap.xml',
    pathname: '/sitemap.xml',
    search: '',
    host: 'acme.launchlms.test',
    cookieOrgSlug: null,
    hasSession: true,
    instanceInfo,
    resolvedCustomDomainOrgSlug: null,
    orgSubdomainAccess: null,
  })

  assert.equal(decision.action, 'rewrite')
  assert.equal(decision.destination, '/api/sitemap')
  assert.equal(decision.headers?.['X-Sitemap-Orgslug'], 'acme')
})
