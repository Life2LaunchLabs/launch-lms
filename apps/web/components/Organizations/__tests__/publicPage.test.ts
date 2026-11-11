import { expect, test } from 'bun:test'
import { pageGaps, pageLinks, pagePlans } from '../publicPage'
import { orgPageHref } from '../OrgLink'

const card = (template_uuid: string) => ({ template_uuid, title: template_uuid }) as any
const page = (patch: object = {}) => ({ city: '', website: '', highlights: [], pinned_plans: [], hidden_plans: [], ...patch })

test('pinned plans come first in the order pinned, hidden ones stay off, each plan once', () => {
  const plans = pagePlans([card('a'), card('b'), card('c'), card('b'), card('d')], page({ pinned_plans: ['c', 'a'], hidden_plans: ['d'] }))
  expect(plans.map((item) => item.template_uuid)).toEqual(['c', 'a', 'b'])
})

test('only web links show: the website first, then socials we know', () => {
  const links = pageLinks({ page: page({ website: 'https://crew.example' }), socials: { instagram: 'https://instagram.com/crew', twitter: 'javascript:alert(1)', myspace: 'https://myspace.com/crew' } })
  expect(links).toEqual([{ label: 'Website', href: 'https://crew.example' }, { label: 'Instagram', href: 'https://instagram.com/crew' }])
})

test('the checklist names what the page still needs before listing', () => {
  expect(pageGaps({ thumbnail_image: '', description: ' ' }, 0)).toEqual(['cover', 'tagline', 'plan'])
  expect(pageGaps({ thumbnail_image: 'cover.jpg', description: 'Paid summer crews' }, 2)).toEqual([])
})

test('a name links to the organization page only when the page is listed', () => {
  expect(orgPageHref('acme', { slug: 'crew', name: 'Crew', listed: true })).toContain('/organization/crew')
  expect(orgPageHref('acme', { slug: 'crew', name: 'Crew', listed: false })).toBeNull()
  expect(orgPageHref('acme', null)).toBeNull()
})
