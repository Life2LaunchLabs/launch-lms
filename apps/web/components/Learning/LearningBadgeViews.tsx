'use client'

import Link from 'next/link'
import React from 'react'
import { Award, CheckCircle, ChevronRight, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  completeLearningPage,
  startLearningRun,
  submitLearningResponse,
} from '@services/learning/learning'
import toast from 'react-hot-toast'

export function LearningCollectionsBand({ orgslug, collections }: { orgslug: string; collections: any[] }) {
  if (!collections.length) return null
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-lime-600">Learning 2.0</p>
          <h2 className="text-2xl font-black text-gray-950">New badges</h2>
        </div>
      </div>
      <div className="space-y-8">
        {collections.map((collection) => (
          <div key={collection.collection_uuid}>
            <h3 className="mb-3 text-lg font-bold text-gray-900">{collection.name}</h3>
            <div className="flex gap-4 overflow-x-auto pb-3">
              {(collection.badges || []).map((badge: any) => (
                <Link key={badge.badge_uuid} href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}`)} className="block w-44 shrink-0">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
                    {badge.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award className="h-16 w-16 text-lime-500" />}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-bold text-gray-950">{badge.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{badge.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function LearningBadgeDetail({ orgslug, badge }: { orgslug: string; badge: any }) {
  return (
    <main className="min-h-screen bg-[#f7faf6] px-5 py-10">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="text-xs font-bold uppercase text-lime-600">Badge</p>
          <h1 className="mt-3 text-5xl font-black leading-tight text-gray-950">{badge.name}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-700">{badge.description || badge.about}</p>
          <div className="mt-8 flex gap-3">
            <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/path`)} className="inline-flex h-12 items-center gap-2 rounded-lg bg-lime-300 px-6 text-sm font-black text-black hover:bg-lime-400">
              Get started
              <ChevronRight size={18} />
            </Link>
          </div>
          <section className="mt-12">
            <h2 className="text-xl font-bold">Criteria</h2>
            <p className="mt-2 text-gray-600">{badge.criteria || 'Complete the required learning path.'}</p>
          </section>
        </div>
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          {badge.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award className="h-32 w-32 text-lime-500" />}
        </div>
      </div>
    </main>
  )
}

export function LearningPathView({ orgslug, badgePath }: { orgslug: string; badgePath: any }) {
  const badge = badgePath.badge
  return (
    <main className="min-h-screen bg-[#f8f8f8] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}`)} className="text-sm font-medium text-gray-500">Badge details</Link>
        <h1 className="mt-3 text-4xl font-black text-gray-950">{badge.name} Path</h1>
        <p className="mt-2 text-gray-600">{badge.description}</p>
        <div className="mt-8 space-y-3">
          {(badgePath.activities || []).map((activity: any, index: number) => (
            <Link key={activity.activity_uuid} href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/chapter/${activity.activity_uuid.replace('learning_activity_', '')}`)} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-lime-100 font-black text-lime-700">{index + 1}</div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-gray-950">{activity.title}</h2>
                <p className="text-sm text-gray-500">{activity.pages?.length || 0} pages</p>
              </div>
              <ChevronRight size={20} />
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

export function LearningActivityPlayer({ orgslug, badgePath, activity }: { orgslug: string; badgePath: any; activity: any }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const pages = activity.pages || []
  const [run, setRun] = React.useState<any>(badgePath.run)
  const [index, setIndex] = React.useState(0)
  const [unlocked, setUnlocked] = React.useState(false)
  const [answer, setAnswer] = React.useState<any>({})
  const page = pages[index]

  React.useEffect(() => {
    startLearningRun(badge.badge_uuid, accessToken)
      .then(setRun)
      .catch(() => null)
  }, [badge.badge_uuid, accessToken])

  React.useEffect(() => {
    setUnlocked(page?.page_type === 'info' || page?.page_type === 'question_response')
    setAnswer({})
  }, [page?.page_uuid])

  const latestAttemptByPage = React.useMemo(() => {
    const attempts = run?.attempts || []
    return attempts.reduce((acc: any, attempt: any) => ({ ...acc, [attempt.page_id]: attempt }), {})
  }, [run])

  const completeAndNext = async () => {
    if (!run || !page) return
    try {
      let nextRun
      if (page.page_type === 'multiple_choice' || page.page_type === 'text_input') {
        nextRun = await submitLearningResponse(run.run_uuid, page.page_uuid, answer, accessToken)
      } else {
        nextRun = await completeLearningPage(run.run_uuid, page.page_uuid, {}, accessToken)
      }
      setRun(nextRun)
      if (index < pages.length - 1) {
        setIndex(index + 1)
      } else {
        window.location.href = getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/badge`)
      }
    } catch (error: any) {
      toast.error(error?.message || 'Could not complete page')
    }
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-white">
      <div className="flex h-14 shrink-0 items-center gap-4 px-4">
        <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/path`)} className="rounded-full p-2 hover:bg-white/10"><X size={20} /></Link>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-lime-300 transition-all" style={{ width: `${((index + 1) / Math.max(1, pages.length)) * 100}%` }} />
        </div>
        <span className="text-sm text-white/70">{index + 1}/{pages.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto max-w-2xl">
          <PlayerPage page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} pages={pages} run={run} />
        </div>
      </div>
      <div className="shrink-0 border-t border-white/10 p-4">
        <div className="mx-auto flex max-w-2xl justify-end">
          <button onClick={completeAndNext} disabled={!unlocked} className="inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 text-sm font-bold text-white disabled:opacity-40">
            {index === pages.length - 1 ? 'Finish' : 'Continue'}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </main>
  )
}

function PlayerPage({ page, answer, setAnswer, setUnlocked, pages, run }: any) {
  if (!page) return null
  if (page.page_type === 'video') {
    return <div><div className="aspect-video rounded-xl bg-white/10" /><h1 className="mt-6 text-3xl font-bold">{page.title}</h1><button onClick={() => setUnlocked(true)} className="mt-5 text-sm text-lime-300">Mark video watched</button></div>
  }
  if (page.page_type === 'multiple_choice') {
    const options = page.content?.options || []
    return <div><p className="text-xs font-bold uppercase text-purple-300">Check your knowledge</p><h1 className="mt-3 text-3xl font-bold">{page.content?.prompt || page.title}</h1><div className="mt-6 space-y-3">{options.map((option: any, index: number) => <button key={option.id || index} onClick={() => { setAnswer({ option_id: option.id || String(index) }); setUnlocked(true) }} className={`w-full rounded-xl border p-4 text-left ${answer.option_id === (option.id || String(index)) ? 'border-purple-400 bg-purple-500/20' : 'border-white/15'}`}>{option.text || `Option ${index + 1}`}</button>)}</div></div>
  }
  if (page.page_type === 'text_input') {
    return <div><p className="text-xs font-bold uppercase text-purple-300">Your turn</p><h1 className="mt-3 text-3xl font-bold">{page.content?.prompt || page.title}</h1><textarea onChange={(event) => { setAnswer({ text: event.target.value }); setUnlocked(event.target.value.trim().length > 0) }} className="mt-6 min-h-36 w-full resize-none rounded-xl border border-purple-400 bg-transparent p-4 outline-none" /></div>
  }
  if (page.page_type === 'question_response') {
    const linkedUuid = page.content?.linked_page_uuid
    const variants = page.content?.variants || {}
    const linkedPage = pages.find((item: any) => item.page_uuid === linkedUuid)
    const attempt = (run?.attempts || []).filter((item: any) => item.result?.page_uuid === linkedPage?.page_uuid).at(-1)
    const variant = variants[attempt?.feedback_key] || variants[attempt?.is_correct ? 'correct' : 'incorrect'] || variants.default || {}
    return <div><CheckCircle className="mb-6 h-14 w-14 text-lime-300" /><h1 className="text-3xl font-bold">{variant.title || page.title}</h1><p className="mt-4 whitespace-pre-wrap text-lg leading-8 text-white/75">{variant.body || page.content?.body}</p></div>
  }
  return <div><h1 className="text-3xl font-bold">{page.title}</h1><p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-white/75">{page.content?.body}</p></div>
}
