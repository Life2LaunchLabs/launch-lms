import test from 'node:test'
import assert from 'node:assert/strict'

import {
  expandChapterPages,
  getChapterPageProgress,
  getQuizQuestionCount,
} from './progress.ts'

const quizContent = {
  type: 'doc',
  content: [
    { type: 'quizInfoBlock', attrs: { slide_uuid: 'info_1' } },
    { type: 'quizSelectBlock', attrs: { question_uuid: 'q_1' } },
    { type: 'quizSliderBlock', attrs: { question_uuid: 'q_2' } },
  ],
}

test('counts only quiz question pages, excluding info slides', () => {
  assert.equal(getQuizQuestionCount(quizContent), 2)
})

test('expands quiz activities into question pages plus a result page', () => {
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
      ['quiz-question', 2, 0],
      ['quiz-question', 2, 1],
      ['quiz-result', 2, 2],
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
    2
  )

  assert.equal(progress.currentPageNumber, 4)
  assert.equal(progress.totalPages, 4)
})
