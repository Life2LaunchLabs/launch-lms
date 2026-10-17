'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, Lock } from 'lucide-react'
import { Switch } from '@components/ui/switch'
import { coachAdminApi, type CoachAbility, type CoachPolicy } from '@services/coach/admin'
import HubLaunchCardsEditor from '../HubLaunchCardsEditor'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'

const GROUP_DESCRIPTIONS: Record<string, string> = {
  reads: 'What Coach can see when it answers. Each one is read only for the learner it is talking to.',
  chat: 'What Coach can offer in a conversation. The learner always taps to accept; Coach never changes anything on its own here.',
  own: 'What Coach does without a message from the learner. It never creates goals.',
}

export default function CoachAbilities({ policy }: { policy: CoachPolicy }) {
  const { mutate, token } = useCoachPolicy()
  const [pending, setPending] = React.useState<string | null>(null)

  async function toggle(ability: CoachAbility, enabled: boolean) {
    setPending(ability.key)
    try {
      await mutate(await coachAdminApi.update({ abilities: { [ability.key]: enabled } }, token), { revalidate: false })
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change the ability.'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4">
      {policy.ability_groups.map((group) => (
        <Panel key={group.key} title={group.label} description={GROUP_DESCRIPTIONS[group.key]}>
          <ul className="divide-y divide-black/5">
            {policy.abilities.filter((ability) => ability.group === group.key).map((ability) => (
              <li key={ability.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <label htmlFor={`ability-${ability.key}`} className="min-w-0">
                  <span className="block text-sm font-bold text-gray-950">{ability.label}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-gray-600">{ability.detail}</span>
                </label>
                <Switch id={`ability-${ability.key}`} checked={ability.enabled} disabled={pending !== null} onCheckedChange={(enabled) => void toggle(ability, enabled)} />
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      <HubLaunchCardsEditor />

      <Panel title="Built-in rules" description="Fixed by Launch LMS so the app can read Coach's output and keep learners safe. Shown so the coaching team knows exactly what Coach is told; ask the product team to change them.">
        <div className="space-y-2">
          {policy.built_in_rules.map((rule) => (
            <details key={rule.title} className="group rounded-xl border border-black/10 bg-gray-50/60">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-gray-900">
                <Lock size={14} className="text-gray-400" aria-hidden="true" />
                <span className="flex-1">{rule.title}</span>
                <ChevronDown size={16} className="text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <pre className="whitespace-pre-wrap border-t border-black/10 px-4 py-3 font-sans text-[13px] leading-6 text-gray-700">{rule.text}</pre>
            </details>
          ))}
        </div>
      </Panel>
    </div>
  )
}
