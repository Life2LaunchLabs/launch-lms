import { describe, expect, test } from 'bun:test'
import { quests, spotsFor, stageOf, unlocked } from '../progress'

const shell = (over: Record<string, any> = {}): any => ({ portfolio: { avatar_image: '', short_bio: '', socials: [] }, projects: [], timeline: [], credentials: [], quotes: [], results: [], ...over })
const entry = (entry_type = 'work_career', summary = '') => ({ entry_type, summary })

describe('portfolio quests', () => {
  test('a new portfolio works on sharing, with spots on the page', () => {
    const stage = stageOf(shell())
    expect(stage.kind).toBe('working')
    if (stage.kind === 'mastered') throw new Error('unexpected')
    expect([stage.quest.n, stage.quest.done, stage.quest.total]).toEqual([1, 0, 4])
    expect(unlocked(stage, 1)).toBe(false)
    expect(spotsFor(stage)).toEqual({ avatar: 'Add a profile photo', about: 'Write a short bio', experience: 'Add where you are right now', projects: 'Add something you made or earned' })
  })

  test('finishing a quest shows its unlock until it is seen, then the next quest starts', () => {
    const done = shell({ portfolio: { avatar_image: 'me.jpg', short_bio: 'Hi', socials: [] }, timeline: [entry()], projects: [{ cover_url: '' }] })
    const stage = stageOf(done)
    expect(stage.kind).toBe('unlocked')
    expect(unlocked(stage, 1)).toBe(true)
    expect(spotsFor(stage)).toEqual({})
    const next = stageOf({ ...done, progress: { seen: [1] } })
    expect(next.kind === 'working' && next.quest.n).toBe(2)
  })

  test('a public portfolio or a saved résumé keeps what it had before quests', () => {
    expect((stageOf(shell({ portfolio: { published_at: '2026-01-01' } })) as any).quest.n).toBe(2)
    expect((stageOf(shell({ resume_versions: [{}] })) as any).quest.n).toBe(3)
    expect(stageOf(shell({ progress: { seen: [1, 2, 3] } })).kind).toBe('mastered')
  })

  test('counts cap at what the item needs and skills come from results and badges', () => {
    const [, second, third] = quests(shell({ timeline: [entry(), entry('education'), entry(), entry()], results: [{ kind: 'skills', summary: 'Welding, CAD' }], badges: { earned: [{ skills: ['cad', 'Safety'] }], working_toward: [] } }))
    const xp3 = second.items.find((item) => item.key === 'xp3')
    expect([xp3?.have, xp3?.need, xp3?.done]).toEqual([3, 3, true])
    const skills = second.items.find((item) => item.key === 'skills')
    expect([skills?.have, skills?.done]).toEqual([3, true])
    expect(third.items.find((item) => item.key === 'stories')?.done).toBe(false)
  })

  test('mastery asks for what you are like and a phase now and next', () => {
    const third = (over: Record<string, any>) => quests(shell(over))[2].items
    expect(third({}).find((item) => item.key === 'headed')?.done).toBe(false)
    expect(third({ headed: { now: { title: 'High school' }, next: [] } }).find((item) => item.key === 'headed')?.done).toBe(false)
    expect(third({ headed: { now: { title: 'High school' }, next: [{ title: 'College' }] } }).find((item) => item.key === 'headed')?.done).toBe(true)
    expect(third({ results: [{ kind: 'skills', summary: 'CAD' }] }).find((item) => item.key === 'like')?.done).toBe(false)
    expect(third({ results: [{ kind: 'interests', summary: 'Artistic' }] }).find((item) => item.key === 'like')?.done).toBe(true)
  })
})
