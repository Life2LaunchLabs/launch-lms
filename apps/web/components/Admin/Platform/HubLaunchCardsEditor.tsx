'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { hubLaunchCardsApi } from '@services/hub/configuration'
import { LAUNCH_CARD_LIMITS, MAX_LAUNCH_CARDS, launchCardsProblem, type HubLaunchCard, type HubLaunchCardsSettings } from '@services/hub/launchCards'
import { swrFetcher } from '@services/utils/ts/requests'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'

const blankCard = (): HubLaunchCard => ({ label: '', hint: '', first_message: '' })

export default function HubLaunchCardsEditor() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data, error, isLoading, mutate } = useSWR<HubLaunchCardsSettings>(
    token ? `${getAPIUrl()}superadmin/settings/hub-launch-cards` : null,
    (url: string) => swrFetcher(url, token),
  )
  const [cards, setCards] = React.useState<HubLaunchCard[]>([])
  const [busy, setBusy] = React.useState<'save' | 'reset' | null>(null)

  React.useEffect(() => { if (data) setCards(data.cards) }, [data])

  const problem = launchCardsProblem(cards)
  const dirty = JSON.stringify(cards) !== JSON.stringify(data?.cards ?? [])
  const update = (index: number, patch: Partial<HubLaunchCard>) => setCards((current) => current.map((card, i) => i === index ? { ...card, ...patch } : card))
  const move = (index: number, by: number) => setCards((current) => {
    const next = [...current]
    ;[next[index], next[index + by]] = [next[index + by], next[index]]
    return next
  })

  const run = async (kind: 'save' | 'reset', payload: HubLaunchCard[] | null, done: string) => {
    if (kind === 'reset' && !window.confirm('Replace the cards with the Launch LMS defaults?')) return
    setBusy(kind)
    try {
      await mutate(await hubLaunchCardsApi.save(payload, token), { revalidate: false })
      toast.success(done)
    } catch (saveError: any) {
      toast.error(saveError?.message || 'Could not update the cards.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="hub-launch-cards-heading">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Hub home</p>
      <h2 id="hub-launch-cards-heading" className="mt-1 text-2xl font-black text-gray-950">Starter cards</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">Shown to learners who have no plan work yet. Clicking a card sends its opening message to the Hub coach, which replies using the platform guidance above. Up to {MAX_LAUNCH_CARDS} cards.</p>

      {error ? <p className="mt-5 text-sm text-red-700" role="alert">Could not load the cards. Learners still see the default set.</p> : null}
      {isLoading ? <p className="mt-5 text-sm text-gray-500" role="status">Loading cards…</p> : null}

      <ol className="mt-6 space-y-4">
        {cards.map((card, index) => (
          <li key={index} className="rounded-xl border border-black/10 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-xs font-bold text-gray-900">Title</span>
                <Input value={card.label} maxLength={LAUNCH_CARD_LIMITS.label} onChange={(event) => update(index, { label: event.target.value })} className="mt-1.5" /></label>
              <label className="block"><span className="text-xs font-bold text-gray-900">Subtitle <span className="font-normal text-gray-500">(optional)</span></span>
                <Input value={card.hint} maxLength={LAUNCH_CARD_LIMITS.hint} onChange={(event) => update(index, { hint: event.target.value })} className="mt-1.5" /></label>
            </div>
            <label className="mt-3 block"><span className="text-xs font-bold text-gray-900">Opening message <span className="font-normal text-gray-500">(sent as the learner)</span></span>
              <Input value={card.first_message} maxLength={LAUNCH_CARD_LIMITS.first_message} onChange={(event) => update(index, { first_message: event.target.value })} className="mt-1.5" /></label>
            <div className="mt-3 flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move card ${index + 1} up`}><ArrowUp size={15} /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(index, 1)} disabled={index === cards.length - 1} aria-label={`Move card ${index + 1} down`}><ArrowDown size={15} /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCards((current) => current.filter((_, i) => i !== index))} aria-label={`Remove card ${index + 1}`}><Trash2 size={15} /></Button>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4"><Button type="button" variant="outline" onClick={() => setCards((current) => [...current, blankCard()])} disabled={cards.length >= MAX_LAUNCH_CARDS}><Plus size={15} />Add card</Button></div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
        <p className="text-xs text-gray-500" aria-live="polite">{problem && dirty ? problem : data?.is_default ? 'Using the Launch LMS default cards.' : 'Using customized cards.'}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void run('reset', null, 'Default cards restored.')} disabled={busy !== null || data?.is_default}>{busy === 'reset' ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}Reset to defaults</Button>
          <Button type="button" onClick={() => void run('save', cards, 'Starter cards updated.')} disabled={busy !== null || !dirty || Boolean(problem)}>{busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save cards</Button>
        </div>
      </div>
    </section>
  )
}
