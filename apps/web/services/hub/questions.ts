import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/** A question Coach asked with ``ask_learner``; the same shape any surface can render. */
export type HubQuestion = {
  question_uuid: string
  position: number
  kind: 'single' | 'multiple' | 'text' | 'scale'
  prompt: string
  options: { id: string; label: string }[]
  allow_skip: boolean
  low_label: string
  high_label: string
  /** Where the answer is kept, in the learner's words ("Saved as why this goal matters"), or empty. */
  keep_label: string
  status: 'open' | 'answered' | 'skipped'
  answer: { skipped?: boolean; option_ids?: string[]; labels?: string[]; text?: string; value?: number } | null
  kept: { saved: boolean; reason?: string } | null
}

export type HubQuestionAnswer = { question_uuid: string; skipped?: boolean; option_ids?: string[]; text?: string; value?: number }

/** Sends the learner's answers to one set; returns the answered questions and the message Coach reads. */
export async function answerHubQuestions(orgId: number, messageUuid: string, answers: HubQuestionAnswer[], accessToken: string): Promise<{ questions: HubQuestion[]; content: string }> {
  const response = await fetch(`${getAPIUrl()}hub/messages/${encodeURIComponent(messageUuid)}/answers?org_id=${encodeURIComponent(orgId)}`,
    RequestBodyWithAuthHeader('POST', { answers }, null, accessToken))
  if (!response.ok) return errorHandling(response)
  return response.json()
}

/** How a stored answer reads back. */
export function answerText(question: HubQuestion) {
  const answer = question.answer
  if (!answer || answer.skipped) return 'Skipped'
  if (answer.labels) return answer.labels.join(', ')
  if (typeof answer.value === 'number') return `${answer.value} of 5`
  return answer.text || ''
}
