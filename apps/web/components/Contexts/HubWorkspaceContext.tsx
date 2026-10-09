'use client'

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { HubEditOperation, HubEditRun, HubSurfaceHint } from '@services/hub/advisor'

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

export const HubWorkspaceContext = createContext<{
  surface: HubSurface | null
  // eslint-disable-next-line no-unused-vars
  setSurface: (surface: HubSurface | null) => void
  open: () => void
  compact: boolean
  editRun: HubEditRun | null
  // eslint-disable-next-line no-unused-vars
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
} | null>(null)

export function useHubWorkspace() { return useContext(HubWorkspaceContext) }
