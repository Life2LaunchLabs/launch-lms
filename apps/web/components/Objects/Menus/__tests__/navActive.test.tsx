import { describe, expect, test } from 'bun:test'
import { NAV_ACTIVE_CLASS } from '@components/Objects/Menus/OrgMenuMobile'

describe('nav active item', () => {
  // The collapsed sidebar is one item (w-11) wide with overflow hidden, so a ring drawn
  // outside the item loses its left and right edges there (FEED-35).
  test('draws its ring inside the item so the collapsed sidebar cannot clip it', () => {
    const classes = NAV_ACTIVE_CLASS.split(/\s+/)
    expect(classes).toContain('ring-2')
    expect(classes).toContain('ring-inset')
    expect(classes.some((name) => name.startsWith('ring-offset-'))).toBe(false)
  })
})
