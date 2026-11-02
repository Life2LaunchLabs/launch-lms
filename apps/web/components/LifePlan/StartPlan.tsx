'use client'

import React from 'react'
import type { LifeDoc } from '@services/life/life'
import { newDoc, uid } from './model'
import { PhaseForm } from './PhaseForm'

/** The first step: name the phase you're in now. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export default function StartPlan({ token, existing, onStart }: { token?: string; existing: LifeDoc | null; onStart: (doc: LifeDoc) => void }) {
  return (
    <div className="mx-auto max-w-[560px] py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Your life plan</h1>
      <p className="mt-2 text-muted-foreground">
        A life plan is a run of phases, like high school, college, or a first job. Each one has a budget. Start with the phase you're in now; you can add what comes next after.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <PhaseForm
          token={token}
          initial={{ title: '', kind: 'school', place: null, placeLabel: '', months: 12 }}
          submitLabel="Start my plan"
          onSubmit={(d) => {
            const doc = existing ? { ...existing } : newDoc()
            doc.phases = [{ id: uid('p'), title: d.title, kind: d.kind, place: d.place, place_label: d.placeLabel, months: d.months, lines: [] }]
            onStart(doc)
          }}
        />
      </div>
    </div>
  )
}
