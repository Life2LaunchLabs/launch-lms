import { describe, expect, test } from 'bun:test'
import { HAND_IN_ACCEPT, handInRefusal } from '@components/Goals/steps/handIn'

describe('handing in a document (DEV-202)', () => {
  test('the picker takes PDF, Word and text files, by type and by extension', () => {
    for (const part of ['application/pdf', '.pdf', 'application/msword', '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx', 'text/plain', '.txt']) {
      expect(HAND_IN_ACCEPT.document.split(',')).toContain(part)
    }
  })

  test('a Word resume or a text file goes in', () => {
    expect(handInRefusal('document', { name: 'My Resume.docx' })).toBe(null)
    expect(handInRefusal('document', { name: 'resume.DOC' })).toBe(null)
    expect(handInRefusal('document', { name: 'notes.txt' })).toBe(null)
    expect(handInRefusal('document', { name: 'resume.pdf' })).toBe(null)
  })

  test('a file that cannot go in says which types work', () => {
    const refusal = handInRefusal('document', { name: 'resume.pages' })
    expect(refusal).toContain('PDF')
    expect(refusal).toContain('Word')
    expect(handInRefusal('image', { name: 'resume.docx' })).toContain('photo')
    expect(handInRefusal('document', { name: 'resume' })).not.toBe(null)
  })
})
