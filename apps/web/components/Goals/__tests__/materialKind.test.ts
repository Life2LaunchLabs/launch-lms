import { describe, expect, test } from 'bun:test'
import { isUploadedFile } from '../edit/materialKind'

describe('step materials', () => {
  test('a link to the org’s own media reads as a file (FEED-111)', () => {
    expect(isUploadedFile({ kind: 'link', url: '/content/orgs/org_1/media/demo.mp4' })).toBe(true)
    expect(isUploadedFile({ kind: 'link', url: '/api/v1/content/orgs/org_1/media/p.pdf' })).toBe(true)
    expect(isUploadedFile({ kind: 'file', url: 'https://files.example.com/p.pdf' })).toBe(true)
    expect(isUploadedFile({ kind: 'link', url: 'https://example.com/content/guide' })).toBe(false)
    expect(isUploadedFile({ kind: 'resource', url: undefined })).toBe(false)
  })
})
