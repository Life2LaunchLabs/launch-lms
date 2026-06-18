'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ExternalLink, Plus, Save, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import {
  NewsArticle,
  NewsArticleInput,
  createNewsArticle,
  deleteNewsArticle,
  getAdminNewsArticles,
  publishNewsArticle,
  unpublishNewsArticle,
  updateNewsArticle,
} from '@services/news/news'
import { getUriWithOrg, routePaths } from '@services/config/config'

type DraftState = NewsArticleInput & {
  article_uuid?: string
}

const EMPTY_DRAFT: DraftState = {
  title: '',
  slug: '',
  summary: '',
  body: '',
  external_url: '',
  status: 'draft',
  published_at: null,
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function draftFromArticle(article: NewsArticle): DraftState {
  return {
    article_uuid: article.article_uuid,
    title: article.title,
    slug: article.slug,
    summary: article.summary || '',
    body: article.body || '',
    external_url: article.external_url || '',
    status: article.status,
    published_at: article.published_at,
  }
}

export default function NewsDashClient({
  orgId,
  orgslug,
}: {
  orgId: number
  orgslug: string
}) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const { data: articles = [], mutate, error } = useSWR(
    orgId ? ['admin-news', orgId, accessToken || 'anon'] : null,
    () => getAdminNewsArticles(orgId, accessToken)
  )

  const selectedArticle = useMemo(
    () => articles.find((article) => article.article_uuid === draft.article_uuid),
    [articles, draft.article_uuid]
  )

  const setField = (field: keyof DraftState, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === 'title' && !current.article_uuid
        ? { slug: slugify(value) }
        : {}),
    }))
  }

  const resetDraft = () => setDraft({ ...EMPTY_DRAFT })

  const saveDraft = async () => {
    const payload: NewsArticleInput = {
      title: draft.title.trim(),
      slug: slugify(draft.slug || draft.title),
      summary: draft.summary || null,
      body: draft.body || null,
      external_url: draft.external_url || null,
      status: draft.status || 'draft',
      published_at: draft.published_at || null,
    }

    if (!payload.title || !payload.slug) {
      toast.error('Title and slug are required')
      return
    }

    try {
      const saved = draft.article_uuid
        ? await updateNewsArticle(orgId, draft.article_uuid, payload, accessToken)
        : await createNewsArticle(orgId, payload, accessToken)
      setDraft(draftFromArticle(saved))
      await mutate()
      toast.success('News article saved')
    } catch (err) {
      toast.error('Unable to save news article')
    }
  }

  const togglePublished = async () => {
    if (!draft.article_uuid) return
    try {
      const saved = draft.status === 'published'
        ? await unpublishNewsArticle(orgId, draft.article_uuid, accessToken)
        : await publishNewsArticle(orgId, draft.article_uuid, accessToken)
      setDraft(draftFromArticle(saved))
      await mutate()
      toast.success(saved.status === 'published' ? 'Article published' : 'Article unpublished')
    } catch {
      toast.error('Unable to update publishing state')
    }
  }

  const removeArticle = async () => {
    if (!draft.article_uuid) return
    try {
      await deleteNewsArticle(orgId, draft.article_uuid, accessToken)
      resetDraft()
      await mutate()
      toast.success('News article deleted')
    } catch {
      toast.error('Unable to delete news article')
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
            News
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Publish app-state updates for the default organization.
          </p>
        </div>
        <Button onClick={resetDraft} className="gap-2 rounded-[6px]">
          <Plus size={16} />
          New Article
        </Button>
      </div>

      {error && (
        <div className="rounded-[6px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          News editing is available to default organization admins.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-[6px] border border-gray-200 bg-white">
          {articles.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              No articles yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {articles.map((article) => (
                <button
                  key={article.article_uuid}
                  type="button"
                  onClick={() => setDraft(draftFromArticle(article))}
                  className={`flex w-full flex-col items-start gap-1 p-4 text-left transition-colors hover:bg-gray-50 ${
                    selectedArticle?.article_uuid === article.article_uuid
                      ? 'bg-gray-50'
                      : ''
                  }`}
                >
                  <span className="text-sm font-semibold text-gray-950">
                    {article.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {article.status === 'published' ? 'Published' : 'Draft'} · /{article.slug}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-[6px] border border-gray-200 bg-white p-5">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="news-title">Title</Label>
                <Input
                  id="news-title"
                  value={draft.title}
                  onChange={(event) => setField('title', event.target.value)}
                  placeholder="Release status update"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="news-slug">Slug</Label>
                <Input
                  id="news-slug"
                  value={draft.slug}
                  onChange={(event) => setField('slug', slugify(event.target.value))}
                  placeholder="release-status-update"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="news-summary">Summary</Label>
              <Textarea
                id="news-summary"
                value={draft.summary || ''}
                onChange={(event) => setField('summary', event.target.value)}
                placeholder="Short context for the news list."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="news-external-url">External URL</Label>
              <Input
                id="news-external-url"
                value={draft.external_url || ''}
                onChange={(event) => setField('external_url', event.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="news-body">Body</Label>
              <Textarea
                id="news-body"
                value={draft.body || ''}
                onChange={(event) => setField('body', event.target.value)}
                placeholder="Write the article body or leave this empty when linking out."
                rows={12}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveDraft} className="gap-2 rounded-[6px]">
                  <Save size={16} />
                  Save
                </Button>
                {draft.article_uuid && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={togglePublished}
                    className="rounded-[6px]"
                  >
                    {draft.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                )}
                {draft.article_uuid && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={removeArticle}
                    className="gap-2 rounded-[6px] border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                )}
              </div>
              {draft.status === 'published' && draft.slug && (
                <a
                  href={getUriWithOrg(orgslug, routePaths.org.newsArticle(draft.slug))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950"
                >
                  View
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
