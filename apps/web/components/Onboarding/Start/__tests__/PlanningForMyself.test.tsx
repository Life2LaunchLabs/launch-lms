import { describe, expect, test } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import PlanningForMyself, { PLANNING_FOR_MYSELF_HREF } from '@components/Onboarding/Start/PlanningForMyself'
import { classifyRoute } from '@services/routing/routeAccess'

describe('the role step has a way out for someone planning for themselves (FEED-64)', () => {
  test('offers their own space, through /welcome', () => {
    const html = renderToStaticMarkup(<PlanningForMyself />)
    expect(html).toContain('Planning your own future?')
    expect(html).toContain('Go to your own space')
    expect(html).toContain(`href="${PLANNING_FOR_MYSELF_HREF}"`)
    expect(PLANNING_FOR_MYSELF_HREF).toBe('/welcome')
  })

  test('/welcome opens signed out too, so it can send them to sign up', () => {
    expect(classifyRoute(PLANNING_FOR_MYSELF_HREF).kind).toBe('public')
  })

  test('sits on the role step, beside Continue', () => {
    const source = readFileSync(fileURLToPath(new URL('../StartFlow.tsx', import.meta.url)), 'utf8')
    const roleStep = source.slice(source.indexOf("if (step === 'role') return"), source.indexOf("if (step === 'reqs') return"))
    expect(roleStep).toContain('<PlanningForMyself />')
  })
})
