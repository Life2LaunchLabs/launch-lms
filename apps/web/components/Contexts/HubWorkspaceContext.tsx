'use client'

import { createContext, useContext } from 'react'
import type { HubSurfaceHint } from '@services/hub/advisor'

export type HubSurface = {
  path: string
  label: string
  selectionLabel?: string
  hint: HubSurfaceHint
}

export const HubWorkspaceContext = createContext<{
  surface: HubSurface | null
  // eslint-disable-next-line no-unused-vars
  setSurface: (surface: HubSurface | null) => void
  open: () => void
  compact: boolean
} | null>(null)

export function useHubWorkspace() { return useContext(HubWorkspaceContext) }
