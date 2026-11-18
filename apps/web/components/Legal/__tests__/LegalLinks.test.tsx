import { describe, expect, test } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import LegalAgreement from '@components/Legal/LegalAgreement'
import LegalFooter from '@components/Legal/LegalFooter'
import { LEGAL_LINKS } from '@components/Legal/LegalPage'
import { classifyRoute } from '@services/routing/routeAccess'

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8')

describe('the Privacy Policy and Terms of Use are linked wherever people sign up or sign in (DEV-24)', () => {
  test('the agreement line links both pages, in a new tab so the form is kept', () => {
    const html = renderToStaticMarkup(<LegalAgreement />)
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
    expect(html.match(/target="_blank"/g)?.length).toBe(2)
  })

  test('the footer links every legal page', () => {
    const html = renderToStaticMarkup(<LegalFooter />)
    for (const link of LEGAL_LINKS) expect(html).toContain(`href="${link.href}"`)
  })

  test('sign-up, sign-in, invited sign-up and Get started all show the agreement line', () => {
    for (const path of ['app/auth/signup/OpenSignup.tsx', 'app/auth/login/login.tsx', 'app/auth/signup/InviteOnlySignUp.tsx', 'components/Onboarding/Start/StartFlow.tsx']) {
      expect(source(path)).toContain('<LegalAgreement')
    }
  })

  test('signed-out org pages and the organizations page show the footer', () => {
    expect(source('app/orgs/[orgslug]/(withmenu)/layout.tsx').match(/<LegalFooter \/>/g)?.length).toBe(2)
    expect(source('app/orgs/[orgslug]/(guest)/for-organizations/page.tsx')).toContain('<LegalFooter />')
  })

  test('the pages they link to open signed out', () => {
    expect(classifyRoute('/privacy').kind).toBe('public')
    expect(classifyRoute('/terms').kind).toBe('public')
  })

  test('the sign-in text calls them Terms of Use', () => {
    const en = JSON.parse(source('locales/en.json'))
    expect(en.auth.terms_of_service).toBe('Terms of Use')
    expect(en.legal.terms_of_use).toBe('Terms of Use')
  })
})
