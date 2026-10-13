'use client'

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { HubEditOperation, HubEditRun, HubSurfaceHint } from '@services/hub/advisor'
import type { Resource } from '@services/resources/resources'

export type HubSurface = {
  path: string
  label: string
  selectionLabel?: string
  hint: HubSurfaceHint
}

export type HubEditReviewItem = {
  key: string
  label: string
  objectType: string
  targetId: string
}

export type HubEditContinuation = {
  id: string
  conversationUuid: string
  runUuid: string
  content: string
}

/**
 * Where the coach sits. ``open``: the conversation is out and the page is aside (phone)
 * or narrowed (wider screens). ``edge``: a conversation exists and the page is back, with
 * the coach's edge still showing. ``closed``: no conversation in view.
 */
export type HubCoachState = 'open' | 'edge' | 'closed'

/** Something to start the coach with: a message, a conversation to resume, a resource. */
export type HubCoachIntent = {
  prompt?: string
  conversation?: string
  resource?: string
}

export type HubContextValue = {
  surface: HubSurface | null
  // eslint-disable-next-line no-unused-vars
  setSurface: (surface: HubSurface | null) => void
  state: HubCoachState
  // eslint-disable-next-line no-unused-vars
  open: (intent?: HubCoachIntent) => void
  /** Puts the page back; the edge stays while a conversation exists. */
  tuck: () => void
  toggle: () => void
  /** Ends the conversation and removes the edge. */
  end: () => void
  /** The coach has something new the learner hasn't seen; drawn as a dot on the edge and nav. */
  unread: boolean
  // eslint-disable-next-line no-unused-vars
  attach: (resource: Resource) => void
  editRun: HubEditRun | null
  setEditRun: Dispatch<SetStateAction<HubEditRun | null>>
  editOperations: HubEditOperation[]
  setEditOperations: Dispatch<SetStateAction<HubEditOperation[]>>
  editReviewItems: HubEditReviewItem[]
  setEditReviewItems: Dispatch<SetStateAction<HubEditReviewItem[]>>
  editContinuations: HubEditContinuation[]
  // eslint-disable-next-line no-unused-vars
  enqueueEditContinuation: (continuation: HubEditContinuation) => void
  // eslint-disable-next-line no-unused-vars
  removeEditContinuation: (id: string) => void
  // eslint-disable-next-line no-unused-vars
  clearEditContinuations: (runUuid?: string) => void
}

export const HubContext = createContext<HubContextValue | null>(null)

export function useHub() { return useContext(HubContext) }
