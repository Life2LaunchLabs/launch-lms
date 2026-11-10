import { afterEach, expect, mock, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'

// SWR always reports loading when rendered on the server, so the plan comes straight from the hook.
let lifeDoc: unknown = null
mock.module('@components/Goals/phases/useLifePlan', () => ({ default: () => ({ doc: lifeDoc, isLoading: false, busy: false, change: async () => null }) }))
import { HOLD_KEY, holdRoute, routeWaiting } from '@components/Goals/phases/MapParts'
import { routesFor } from '@components/Goals/phases/careers'

// A learner with no plan who taps "Add to my plan ideas" on a career must not lose it: they still pick
// the way there, and "Start my plan" keeps that route waiting until their first phase opens the map with it.

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }
const dietitian = { code: '29-1031.00', title: 'Dietitians and Nutritionists', job_zone: 5 }

async function render(doc: unknown) {
  lifeDoc = doc
  const { default: AddToPlans } = await import('@components/Careers/AddToPlans')
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <AddToPlans career={dietitian} token="token" orgslug="school" onClose={() => {}} />
  </AppRouterContext.Provider>)
}

const store = new Map<string, string>()
;(globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
afterEach(() => store.clear())

test('with no plan yet, the career’s routes still show and the button starts the plan instead of leaving for an empty page', async () => {
  const html = await render(null)
  expect(html).toContain('Start your plan with where you are now')
  expect(html).toContain('How to get there')
  expect(html).toContain('Graduate school')
  expect(html).toContain('Start my plan')
  expect(html).not.toContain('href=')
  expect(html).not.toContain('After which phase')
})

test('a held route is what tells the first phase to open the map holding it', () => {
  expect(routeWaiting()).toBe(false)
  holdRoute(dietitian.title, routesFor(dietitian)[0].steps)
  expect(routeWaiting()).toBe(true)
  expect(JSON.parse(store.get(HOLD_KEY)!).title).toBe(dietitian.title)
  store.set(HOLD_KEY, 'not json')
  expect(routeWaiting()).toBe(false)
})
