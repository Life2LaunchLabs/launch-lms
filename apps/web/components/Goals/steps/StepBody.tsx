'use client'

import React from 'react'
import type { StepActions, StepCardProps } from './registry'
import { stepDefinition } from './index'
import { StepNote } from './shared'

/** A step's card body from the registry, with the note every step has under it. */
export default function StepBody(props: StepCardProps) {
  const definition = stepDefinition(props.step.type)
  const CardBody = definition.CardBody as React.ComponentType<StepCardProps>
  const [prompted, setPrompted] = React.useState(false)
  const asks = !props.staff && definition.notePrompt !== false
  const actions: StepActions = {
    ...props.actions,
    setStatus: async (status, note) => {
      const done = await props.actions.setStatus(status, note)
      if (done && status === 'completed' && asks) setPrompted(true)
      return done
    },
  }
  return <>
    <CardBody {...props} actions={actions} />
    <StepNote step={props.step} actions={props.actions} canWork={props.canWork} prompted={prompted} onSettled={() => setPrompted(false)} />
  </>
}
