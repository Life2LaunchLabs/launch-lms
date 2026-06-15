import test from 'node:test'
import assert from 'node:assert/strict'

import {
  expandChapterPages,
  getChapterPageProgress,
  getQuizSlideCount,
} from './progress.ts'

const quizContent = {
  type: 'doc',
  content: [
    { type: 'quizInfoBlock', attrs: { slide_uuid: 'info_1' } },
    { type: 'quizSelectBlock', attrs: { question_uuid: 'q_1' } },
    { type: 'quizSliderBlock', attrs: { question_uuid: 'q_2' } },
  ],
}

test('counts quiz info and question slides as pages', () => {
  assert.equal(getQuizSlideCount(quizContent), 3)
})

test('expands quiz activities into slide pages plus a result page', () => {
  const pages = expandChapterPages({
    activities: [
      { id: 1, activity_uuid: 'activity_intro', activity_type: 'TYPE_DYNAMIC' },
      { id: 2, activity_uuid: 'activity_quiz', activity_type: 'TYPE_QUIZ', content: quizContent },
    ],
  })

  assert.deepEqual(
    pages.map((page) => [page.type, page.activity.id, page.pageIndex]),
    [
      ['activity', 1, 0],
      ['quiz-slide', 2, 0],
      ['quiz-slide', 2, 1],
      ['quiz-slide', 2, 2],
      ['quiz-result', 2, 3],
    ]
  )
})

test('keeps mixed chapter pages in chapter order', () => {
  const pages = expandChapterPages({
    activities: [
      { id: 1, activity_uuid: 'activity_intro', activity_type: 'TYPE_DYNAMIC' },
      { id: 2, activity_uuid: 'activity_quiz', activity_type: 'TYPE_QUIZ', content: quizContent },
      { id: 3, activity_uuid: 'activity_outro', activity_type: 'TYPE_VIDEO' },
    ],
  })

  assert.deepEqual(
    pages.map((page) => [page.type, page.activity.id, page.pageIndex]),
    [
      ['activity', 1, 0],
      ['quiz-slide', 2, 0],
      ['quiz-slide', 2, 1],
      ['quiz-slide', 2, 2],
      ['quiz-result', 2, 3],
      ['activity', 3, 0],
    ]
  )
})

test('reports current chapter page progress for quiz result pages', () => {
  const progress = getChapterPageProgress(
    {
      activities: [
        { id: 1, activity_uuid: 'activity_intro', activity_type: 'TYPE_DYNAMIC' },
        { id: 2, activity_uuid: 'activity_quiz', activity_type: 'TYPE_QUIZ', content: quizContent },
      ],
    },
    2,
    3
  )

  assert.equal(progress.currentPageNumber, 5)
  assert.equal(progress.totalPages, 5)
})
