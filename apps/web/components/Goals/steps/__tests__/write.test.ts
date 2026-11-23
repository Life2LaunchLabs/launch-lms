import { describe, expect, test } from 'bun:test'
import { pendingWrite } from '@components/Goals/steps/write'

describe('a write-up still to be saved (DEV-206)', () => {
  test('leaving saves a pasted reflection once, even if blur already asked', async () => {
    const sent: string[] = []
    const draft = pendingWrite()
    const save = async (text: string) => { sent.push(text); return true }
    draft.sync('A long pasted reflection', '', save)
    expect(draft.dirty()).toBe(true)
    await Promise.all([draft.flush(), draft.flush()])
    expect(sent).toEqual(['A long pasted reflection'])
    expect(draft.dirty()).toBe(false)
  })

  test('nothing is sent when the text is already saved', async () => {
    const sent: string[] = []
    const draft = pendingWrite()
    draft.sync('Saved before', 'Saved before', async (text) => { sent.push(text); return true })
    await draft.flush()
    expect(sent).toEqual([])
  })

  test('a save that failed goes out again and still counts as unsaved', async () => {
    const sent: string[] = []
    let ok = false
    const draft = pendingWrite()
    draft.sync('Try again', '', async (text) => { sent.push(text); return ok })
    expect(await draft.flush()).toBe(false)
    expect(draft.dirty()).toBe(true)
    ok = true
    expect(await draft.flush()).toBe(true)
    expect(sent).toEqual(['Try again', 'Try again'])
  })
})
