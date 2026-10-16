'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { HubAdvisorMessage, HubAdvisorResource, HubEditObjectState, HubMemory, HubSuggestedAction } from '@services/hub/advisor'
import type { Resource } from '@services/resources/resources'
import HubResourceCarousel from '../resources/HubResourceContext'
import HubQuickSearch from './HubQuickSearch'
import HubMessageMicroBar from './HubMessageMicroBar'
import QuestionSet from '@components/Questions/QuestionSet'
import type { HubQuestionAnswer } from '@services/hub/questions'
import { AssistantResponse, HubSuggestedActions } from './HubMessageParts'
import { HubEditActivity, HubLearnerSessionEvent, HubSessionBoundary, sessionEventLabel, type HubRunTimelineEntry } from './editRunTimeline'

export type HubConversationMessage = HubAdvisorMessage & {
  id: string
  resourceLabel?: 'You added' | 'Suggested'
  searchQuery?: string
  createdAt?: string
  memories?: HubMemory[]
  suggestedActions?: HubSuggestedAction[]
}

type HubThreadProps = {
  messages: HubConversationMessage[]
  timelineSlots: Map<number, HubRunTimelineEntry[]>
  editRun: any
  editObjects: HubEditObjectState[]
  pendingReviewCount: number
  pendingResources: HubAdvisorResource[]
  inChat: Set<string>
  orgId?: number
  orgUuid?: string
  accessToken?: string
  sending: boolean
  narratedConclusionMessageId: string
  restoreOfferMessageId: string
  /* eslint-disable no-unused-vars */
  onOpenResource: (resource: HubAdvisorResource) => void
  onInspectSearchResource: (messageId: string, resource: Resource) => void
  onActivateAction: (messageId: string, action: HubSuggestedAction, mode: 'navigate' | 'edit') => Promise<void>
  onAnswer: (messageId: string, answers: HubQuestionAnswer[]) => Promise<void>
  onPoint: (targetId: string) => void
  /* eslint-enable no-unused-vars */
  onFinish: () => void
  onRestore: () => void
}

/** The conversation itself: messages, Coach's suggestions and resources, and the editing session woven in. */
export default function HubThread({ messages, timelineSlots, editRun, editObjects, pendingReviewCount, pendingResources, inChat, orgId, orgUuid, accessToken, sending, narratedConclusionMessageId, restoreOfferMessageId, onOpenResource, onInspectSearchResource, onActivateAction, onAnswer, onPoint, onFinish, onRestore }: HubThreadProps) {
  const timeline = (slot: number) => (timelineSlots.get(slot) || []).map((entry) => entry.kind === 'agent'
    ? <HubEditActivity key={entry.id} events={entry.events} objects={editObjects} onPoint={onPoint} onFinish={onFinish} pendingReviewCount={pendingReviewCount} />
    : entry.kind === 'boundary'
      ? <HubSessionBoundary key={entry.id} event={entry.events[0]} run={editRun} onRestore={onRestore} />
      : <HubLearnerSessionEvent key={entry.id} events={entry.events} onPoint={onPoint} />)
  const microBar = (message: HubConversationMessage, content = message.content) => accessToken && orgId
    ? <HubMessageMicroBar role={message.role === 'user' ? 'user' : 'assistant'} content={content} createdAt={message.createdAt} memories={message.memories} pageContext={message.page_context} orgId={orgId} accessToken={accessToken} />
    : null
  const carousel = (message: HubConversationMessage) => <HubResourceCarousel resources={message.resources || []} inChat={inChat} label={message.resourceLabel === 'Suggested' ? 'Coach suggested' : message.resourceLabel} onOpen={onOpenResource} />

  return <>
    {messages.map((message, index) => <div key={`timeline:${message.id}`} className="contents">
      {timeline(index)}
      {message.role === 'user' ? sessionEventLabel(message.content) ? null : <div className="group/message space-y-1.5">
        {carousel(message)}
        <div className="flex justify-end"><div className="hub-user-message max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-6 text-foreground">{message.content}</div></div>
        {microBar(message)}
      </div> : <div className="group/message space-y-1.5">
        {message.searchQuery ? <div className="space-y-1.5">
          <HubQuickSearch orgId={orgId} orgUUID={orgUuid} query={message.searchQuery} resourceFilters={{}} selectedResourceUuids={(message.resources || []).map((resource) => resource.resource_uuid)} onSelectResource={(resource) => onInspectSearchResource(message.id, resource)} />
          {microBar(message, `Resource search results for ${message.searchQuery}`)}
        </div> : <>
          <AssistantResponse content={message.content} />
          <QuestionSet questions={message.questions || []} disabled={sending} onSubmit={(answers) => onAnswer(message.id, answers)} />
          <HubSuggestedActions actions={message.suggestedActions || []} disabled={sending} onActivate={(action, mode) => onActivateAction(message.id, action, mode)} />
          {message.id === narratedConclusionMessageId ? <Button type="button" size="sm" className="mt-2 h-8 text-xs" onClick={onFinish}>Finish session</Button> : null}
          {message.id === restoreOfferMessageId ? <Button type="button" size="sm" className="mt-2 h-8 gap-1.5 text-xs" onClick={onRestore}>Continue focused session<ArrowRight size={13} /></Button> : null}
          {microBar(message)}
          {carousel(message)}
        </>}
      </div>}
    </div>)}
    {timeline(messages.length)}
    <HubResourceCarousel resources={pendingResources} inChat={inChat} label="You added" onOpen={onOpenResource} />
  </>
}
