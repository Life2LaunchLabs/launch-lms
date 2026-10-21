import { describe, expect, test } from 'bun:test'
import { embedUrl, guideItems, guideSummary } from '../admin/assignments/StaffGuideViewer'

describe('staff guide items', () => {
  test('notes come first, then each file or link shown the way it reads best', () => {
    const items = guideItems('## Period 4', [
      { kind: 'file', title: 'Packet', url: '/content/orgs/o/media/p.pdf', media_type: 'document' },
      { kind: 'link', title: 'Slides', url: 'https://docs.google.com/presentation/d/abc123/edit#slide=id.p' },
      { kind: 'link', url: 'https://youtu.be/xyz' },
      { kind: 'link', title: 'Examples', url: 'https://example.org/examples' },
      { kind: 'link', title: 'Empty' },
    ])
    expect(items.map((item) => item.kind)).toEqual(['notes', 'pdf', 'embed', 'embed', 'link'])
    expect('url' in items[2] && items[2].url).toBe('https://docs.google.com/presentation/d/abc123/embed')
    expect([items[3].title, 'url' in items[3] && items[3].url]).toEqual(['youtu.be', 'https://www.youtube-nocookie.com/embed/xyz'])
    expect(guideSummary(items)).toBe('Notes · 4 files')
    expect(guideSummary(guideItems('  ', []))).toBe('')
  })

  test('only known sites are embedded', () => {
    expect(embedUrl('https://drive.google.com/file/d/f1/view')).toBe('https://drive.google.com/file/d/f1/preview')
    expect(embedUrl('https://docs.google.com/document/d/d1/edit')).toBe('https://docs.google.com/document/d/d1/preview')
    expect(embedUrl('https://example.org/slides')).toBe(null)
    expect(embedUrl('not a url')).toBe(null)
  })
})
