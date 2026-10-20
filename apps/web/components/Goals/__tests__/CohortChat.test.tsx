import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import AssignmentPlan from '@components/Goals/admin/assignments/AssignmentPlan'
import { AudienceToggle } from '@components/Goals/chat/GoalChat'
import { connectApi, connectKeys, type CohortChat } from '@services/connect/connect'
import { matrix } from '@services/goals/__tests__/cohortFixture'

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }
const ctx = { orgslug: 'school', orgId: 1, token: 'token', assignmentUuid: 'a1', admin: true, refresh: () => undefined }

beforeAll(() => setSystemTime(new Date('2026-10-19T15:00:00Z')))
afterAll(() => setSystemTime())

function staffChat(counts: Record<string, number>): CohortChat {
  return {
    assignment_uuid: 'a1', audience: 'staff', conversation_uuid: 'chat_1', title: 'College & Career Launch · Staff', can_post: true, counts,
    count: Object.values(counts).reduce((sum, count) => sum + count, 0),
    topic: { goal_uuid: 'a1', title: 'College & Career Launch', status: 'active', source: 'assignment', count: 0, progress: { done: 0, total: 0, submitted: 0, behind: 0 }, steps: [] },
  }
}

function render(node: React.ReactNode, chat?: CohortChat) {
  const fallback = chat ? { [connectKeys.cohortChat(1, 'a1', 'staff')]: chat } : {}
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <SWRConfig value={{ provider: () => new Map(), fallback }}>{node}</SWRConfig>
  </AppRouterContext.Provider>)
}

describe('an assignment’s cohort chat', () => {
  test('every step on the plan gets a Discuss button, with a count once people have talked about it', () => {
    const data = matrix()
    data.assignment.status = 'active'
    const html = render(<AssignmentPlan matrix={data} ctx={ctx} viewerUserId={9} />, staffChat({ resume: 2 }))
    const resume = title(data, 'resume')
    expect(html).toContain(`aria-label="Discuss ${resume}, 2 messages about ${resume}"`)
    expect(html).toContain(`aria-label="Discuss ${title(data, 'survey')}"`)
    expect(html.match(/>Discuss</g)?.length).toBe(data.stages.flatMap((stage) => stage.steps).length)
  })

  test('no Discuss buttons for someone the chat isn’t for', () => {
    const html = render(<AssignmentPlan matrix={matrix()} ctx={ctx} viewerUserId={9} />)
    expect(html).not.toContain('>Discuss<')
  })

  test('the panel switches between Staff only and Whole group', () => {
    const html = renderToStaticMarkup(<AudienceToggle options={['staff', 'group']} value="group" onChange={() => undefined} />)
    expect(html).toContain('aria-label="Who reads this chat"')
    expect(html).toContain('aria-checked="false"')
    expect(html.indexOf('Staff only')).toBeLessThan(html.indexOf('Whole group'))
    expect(html.indexOf('aria-checked="true"')).toBeLessThan(html.indexOf('Whole group'))
    expect(html.indexOf('aria-checked="true"')).not.toBeLessThan(html.indexOf('Staff only'))
  })

  test('the chat comes from the assignment’s chat endpoint for its audience', async () => {
    const real = globalThis.fetch
    const asked: string[] = []
    globalThis.fetch = (async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify(staffChat({})), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as never
    try {
      const chat = await connectApi.cohortChat(1, 'a1', 'group', 'token')
      expect(chat.conversation_uuid).toBe('chat_1')
      expect(asked).toHaveLength(1)
      expect(asked[0].endsWith('connect/orgs/1/assignments/a1/chat?audience=group')).toBe(true)
    } finally {
      globalThis.fetch = real
    }
  })
})

function title(data: ReturnType<typeof matrix>, key: string) {
  return data.stages.flatMap((stage) => stage.steps).find((step) => step.template_key === key)!.title
}
