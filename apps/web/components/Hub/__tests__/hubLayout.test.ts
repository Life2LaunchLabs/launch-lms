import { describe, expect, test } from 'bun:test'
import { navCompactBesideCoach, tuckOnNavigation } from '@components/Hub/hubLayout'
import { NAV_ACTIVE_CLASS } from '@components/Objects/Menus/OrgMenuMobile'

describe('sidebar beside Coach (FEED-39)', () => {
  test('a wide page pane keeps the full sidebar while Coach is open', () => {
    expect(navCompactBesideCoach('open', 1280)).toBe(false)
    expect(navCompactBesideCoach('open', 1024)).toBe(false)
  })
  test('a pane narrowed to tablet width, by the window or by dragging Coach wider, drops to the rail', () => {
    expect(navCompactBesideCoach('open', 1023)).toBe(true)
    expect(navCompactBesideCoach('open', 700)).toBe(true)
  })
  test('with Coach closed or tucked, or the pane not measured yet, Coach never forces the rail', () => {
    expect(navCompactBesideCoach('closed', 600)).toBe(false)
    expect(navCompactBesideCoach('edge', 600)).toBe(false)
    expect(navCompactBesideCoach(undefined, 600)).toBe(false)
    expect(navCompactBesideCoach('open', null)).toBe(false)
  })
})

describe('Coach on a phone when the page changes (FEED-36)', () => {
  test('going to another page from the tab bar puts Coach back', () => {
    expect(tuckOnNavigation({ phone: true, state: 'open', from: '/plans', to: '/discover' })).toBe(true)
  })
  test('the first render, the same page, a closed Coach and desktops leave Coach alone', () => {
    expect(tuckOnNavigation({ phone: true, state: 'open', from: null, to: '/plans' })).toBe(false)
    expect(tuckOnNavigation({ phone: true, state: 'open', from: '/plans', to: '/plans' })).toBe(false)
    expect(tuckOnNavigation({ phone: true, state: 'edge', from: '/plans', to: '/discover' })).toBe(false)
    expect(tuckOnNavigation({ phone: false, state: 'open', from: '/plans', to: '/discover' })).toBe(false)
  })
})

describe('nav active item (FEED-35)', () => {
  const classes = NAV_ACTIVE_CLASS.split(/\s+/)
  test('uses neutral tones, not the org accent', () => {
    expect(NAV_ACTIVE_CLASS).not.toContain('--org-primary-color')
    expect(classes).toContain('text-foreground')
  })
  test('draws its ring inside the item so the collapsed sidebar cannot clip it', () => {
    expect(classes).toContain('ring-inset')
  })
})
