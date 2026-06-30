'use client'

import Link from 'next/link'
import React from 'react'
import { Check, Copy, Monitor, Plus, Save, Smartphone, Trash2, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  createLearningPage,
  deleteLearningPage,
  updateLearningActivity,
  updateLearningPage,
  type LearningPageType,
} from '@services/learning/learning'
import toast from 'react-hot-toast'

const pageTypes: Array<{ value: LearningPageType; label: string }> = [
  { value: 'video', label: 'Video' },
  { value: 'info', label: 'Info' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'text_input', label: 'Text Input' },
  { value: 'question_response', label: 'Question Response' },
]

export default function LearningActivityEditor({
  orgslug,
  badgePath,
  activity,
}: {
  orgslug: string
  badgePath: any
  activity: any
}) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const [pages, setPages] = React.useState<any[]>(activity.pages || [])
  const [selectedPageUuid, setSelectedPageUuid] = React.useState(pages[0]?.page_uuid)
  const [previewMode, setPreviewMode] = React.useState<'mobile' | 'desktop'>('mobile')
  const selectedPage = pages.find((page) => page.page_uuid === selectedPageUuid) || pages[0]

  const addPage = async (type: LearningPageType = 'info') => {
    try {
      const page = await createLearningPage({
        activity_uuid: activity.activity_uuid,
        page_type: type,
        title: `New ${type.replace('_', ' ')} page`,
        content: {},
        design: {},
        scoring: {},
        completion: { mode: 'manual' },
      }, accessToken)
      setPages((current) => [...current, page])
      setSelectedPageUuid(page.page_uuid)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add page')
    }
  }

  const savePage = async (patch: any) => {
    if (!selectedPage) return
    const optimistic = { ...selectedPage, ...patch }
    setPages((current) => current.map((page) => page.page_uuid === selectedPage.page_uuid ? optimistic : page))
    try {
      const saved = await updateLearningPage(selectedPage.page_uuid, patch, accessToken)
      setPages((current) => current.map((page) => page.page_uuid === saved.page_uuid ? saved : page))
      toast.success('Saved')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save page')
    }
  }

  const removePage = async (page: any) => {
    if (!confirm(`Delete "${page.title}"?`)) return
    await deleteLearningPage(page.page_uuid, accessToken)
    const nextPages = pages.filter((item) => item.page_uuid !== page.page_uuid)
    setPages(nextPages)
    setSelectedPageUuid(nextPages[0]?.page_uuid)
  }

  const publishActivity = async () => {
    await updateLearningActivity(activity.activity_uuid, { published: !activity.published }, accessToken)
    toast.success(activity.published ? 'Activity unpublished' : 'Activity published')
    window.location.reload()
  }

  return (
    <div className="flex h-screen flex-col bg-[#f8f8f8] text-gray-950">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={getUriWithOrg(orgslug, `/admin/badges/badge/${badge.badge_uuid}/learning-path`)} className="rounded-lg p-2 hover:bg-gray-100">
            <X size={18} />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{activity.title}</p>
            <p className="text-xs text-gray-500">{badge.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewMode(previewMode === 'mobile' ? 'desktop' : 'mobile')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm">
            {previewMode === 'mobile' ? <Smartphone size={16} /> : <Monitor size={16} />}
            {previewMode}
          </button>
          <button onClick={publishActivity} className="inline-flex h-9 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white">
            <Check size={16} />
            {activity.published ? 'Published' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_420px]">
        <aside className="min-h-0 overflow-y-auto border-r border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase text-gray-400">Pages</p>
            <select onChange={(event) => addPage(event.target.value as LearningPageType)} value="" className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
              <option value="" disabled>Add page</option>
              {pageTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            {pages.map((page, index) => (
              <button
                key={page.page_uuid}
                onClick={() => setSelectedPageUuid(page.page_uuid)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${selectedPage?.page_uuid === page.page_uuid ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-xs font-bold">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{page.title}</p>
                  <p className="text-xs capitalize text-gray-500">{page.page_type.replace('_', ' ')}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-8">
          <div className={`mx-auto bg-zinc-950 text-white shadow-2xl ${previewMode === 'mobile' ? 'min-h-[680px] max-w-[390px] rounded-[2rem] p-5' : 'min-h-[560px] max-w-4xl rounded-xl p-8'}`}>
            <div className="mb-8 flex items-center gap-3">
              <X size={18} />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-lime-300" style={{ width: `${Math.max(8, ((pages.findIndex((page) => page.page_uuid === selectedPage?.page_uuid) + 1) / Math.max(1, pages.length)) * 100)}%` }} />
              </div>
              <span className="text-sm">•••</span>
            </div>
            <LearningPagePreview page={selectedPage} />
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
          {selectedPage ? (
            <PageInspector page={selectedPage} pages={pages} savePage={savePage} removePage={removePage} />
          ) : (
            <button onClick={() => addPage()} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white">
              <Plus size={16} />
              Add first page
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

function LearningPagePreview({ page }: { page: any }) {
  if (!page) return <div className="flex min-h-[420px] items-center justify-center text-white/50">No page selected</div>
  if (page.page_type === 'video') {
    return <div><div className="aspect-video rounded-xl bg-white/10" /><h1 className="mt-6 text-3xl font-bold">{page.title}</h1><p className="mt-2 text-white/70">{page.content?.caption}</p></div>
  }
  if (page.page_type === 'multiple_choice') {
    const options = page.content?.options || []
    return <div><p className="text-xs font-bold uppercase text-purple-300">Check your knowledge</p><h1 className="mt-3 text-3xl font-bold">{page.content?.prompt || page.title}</h1><div className="mt-6 space-y-3">{options.map((option: any, index: number) => <div key={option.id || index} className="rounded-xl border border-white/15 p-4">{option.text || `Option ${index + 1}`}</div>)}</div></div>
  }
  if (page.page_type === 'text_input') {
    return <div><p className="text-xs font-bold uppercase text-purple-300">Your turn</p><h1 className="mt-3 text-3xl font-bold">{page.content?.prompt || page.title}</h1><div className="mt-6 min-h-32 rounded-xl border border-purple-400 p-4 text-white/50">Response</div></div>
  }
  if (page.page_type === 'question_response') {
    const variant = page.content?.variants?.default || {}
    return <div><h1 className="text-3xl font-bold">{variant.title || page.title}</h1><p className="mt-4 text-lg text-white/75">{variant.body || page.content?.body}</p></div>
  }
  return <div><h1 className="text-3xl font-bold">{page.title}</h1><p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-white/75">{page.content?.body || 'Add page content in the inspector.'}</p></div>
}

function PageInspector({ page, pages, savePage, removePage }: { page: any; pages: any[]; savePage: (patch: any) => void; removePage: (page: any) => void }) {
  const [draft, setDraft] = React.useState(page)
  React.useEffect(() => setDraft(page), [page])
  const setContent = (patch: any) => setDraft({ ...draft, content: { ...(draft.content || {}), ...patch } })
  const save = () => savePage(draft)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Page</h2>
        <button onClick={() => removePage(page)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={16} /></button>
      </div>
      <label className="block text-sm font-medium">Title</label>
      <input value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      <label className="block text-sm font-medium">Type</label>
      <select value={draft.page_type} onChange={(event) => setDraft({ ...draft, page_type: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
        {pageTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
      {(draft.page_type === 'info' || draft.page_type === 'question_response') && (
        <textarea value={draft.content?.body || ''} onChange={(event) => setContent({ body: event.target.value })} rows={8} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Body text" />
      )}
      {draft.page_type === 'video' && (
        <>
          <input value={draft.content?.video_url || ''} onChange={(event) => setContent({ video_url: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Video URL" />
          <input value={draft.content?.caption || ''} onChange={(event) => setContent({ caption: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Caption" />
        </>
      )}
      {(draft.page_type === 'multiple_choice' || draft.page_type === 'text_input') && (
        <>
          <textarea value={draft.content?.prompt || ''} onChange={(event) => setContent({ prompt: event.target.value })} rows={3} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Prompt" />
          <textarea value={JSON.stringify(draft.page_type === 'multiple_choice' ? (draft.content?.options || []) : (draft.scoring?.accepted_answers || []), null, 2)} onChange={(event) => {
            try {
              const parsed = JSON.parse(event.target.value)
              if (draft.page_type === 'multiple_choice') setContent({ options: parsed })
              else setDraft({ ...draft, scoring: { ...(draft.scoring || {}), accepted_answers: parsed } })
            } catch {}
          }} rows={8} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs" />
        </>
      )}
      {draft.page_type === 'question_response' && (
        <select value={draft.content?.linked_page_uuid || ''} onChange={(event) => setContent({ linked_page_uuid: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">Linked input page</option>
          {pages.filter((item) => item.page_type === 'multiple_choice' || item.page_type === 'text_input').map((item) => <option key={item.page_uuid} value={item.page_uuid}>{item.title}</option>)}
        </select>
      )}
      <button onClick={save} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white">
        <Save size={16} />
        Save Page
      </button>
    </div>
  )
}
