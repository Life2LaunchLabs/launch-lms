'use client'

import React from 'react'
import type { Catalog, Estimate, LifeDoc, Line, Phase } from '@services/life/life'
import type { LineValue, Per, Projection, Stretch } from './model'

/* eslint-disable no-unused-vars -- parameter names in function types */
export interface LifeCtx {
  token?: string
  doc: LifeDoc
  catalog?: Catalog
  /** Estimates by `${phaseId}:${lineId}`; null when there is no sourced fact. */
  estimates: Record<string, Estimate | null>
  estimatesLoading: boolean
  per: Per
  setPer: (per: Per) => void
  phase: Phase
  stretch: Stretch
  stretchesOf: Stretch[]
  selectStretch: (phaseId: string, i: number) => void
  projection: Projection
  valueOf: (phase: Phase, line: Line) => LineValue
  update: (fn: (doc: LifeDoc) => void) => void
  updatePhase: (fn: (phase: Phase) => void) => void
  openLine: string | null
  setOpenLine: (id: string | null) => void
  openAdd: (side: 'in' | 'out', cat?: string) => void
  /** Delete the whole plan and go back to the start. */
  startOver: () => Promise<void>
  /** Someone else's plan, shared with you: shown as theirs, with nothing to add or change. */
  readOnly?: boolean
}
/* eslint-enable no-unused-vars */

export const LifeContext = React.createContext<LifeCtx | null>(null)

export function useLife(): LifeCtx {
  const ctx = React.useContext(LifeContext)
  if (!ctx) throw new Error('useLife outside LifePlanWorkspace')
  return ctx
}
