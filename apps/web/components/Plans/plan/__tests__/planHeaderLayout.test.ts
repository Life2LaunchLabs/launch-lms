import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// bun test runs from apps/web.
const source = readFileSync(join(process.cwd(), 'components', 'Plans', 'plan', 'PlanHeader.tsx'), 'utf8')
const classesOf = (testId: string) => {
  const match = source.match(new RegExp(`data-testid="${testId}" className="([^"]+)"`))
  expect(Boolean(match)).toBe(true)
  return match![1].split(/\s+/)
}

// FEED-126, FEED-251: beside the plan sidebar at about 1280px, Share, Preview, Insights and More sat in the title's row
// and squeezed "Career week" into a column so thin it broke mid-word.
describe('plan header layout (DEV-60)', () => {
  test('the header is sized by its own width, not the screen', () => {
    expect(source).toContain('<header className="@container">')
  })

  test('the buttons only share the title row once the header is wide enough for both', () => {
    const actions = classesOf('plan-header-actions')
    expect(actions).toContain('w-full')
    expect(actions).toContain('flex-wrap')
    expect(actions).toContain('@4xl:w-auto')
    expect(actions.some((name) => name.startsWith('sm:w-auto'))).toBe(false)
    expect(source).toContain('@4xl:flex-nowrap')
    expect(source).not.toContain('sm:flex-nowrap')
  })

  test('until then the title and description take the full width beside the cover', () => {
    const text = classesOf('plan-header-text')
    expect(text).toContain('basis-[calc(100%-74px)]')
    expect(text).toContain('sm:basis-[calc(100%-94px)]')
    expect(text).toContain('@4xl:basis-0')
    expect(text).not.toContain('sm:basis-0')
  })
})
