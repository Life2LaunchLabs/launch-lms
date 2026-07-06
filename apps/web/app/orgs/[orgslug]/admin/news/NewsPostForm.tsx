'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Save } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import {
  NewsArticle,
  NewsArticleInput,
  createNewsArticle,
  getAdminNewsArticles,
  updateNewsArticle,
} from '@services/news/news'
import { getUriWithOrg, routePaths } from '@services/config/config'

type DraftState = NewsArticleInput

const EMPTY_DRAFT: DraftState = {
  title: '',
  slug: '',
  summary: '',
  body: '',
  external_url: '',
  featured: false,
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
    title: article.title,
    slug: article.slug,
    summary: article.summary || '',
    body: article.body || '',
    external_url: article.external_url || '',
    featured: article.featured,
    status: article.status,
    published_at: article.published_at,
  }
}

export default function NewsPostForm({
  orgId,
  orgslug,
  articleUuid,
}: {
  orgId: number
  orgslug: string
  articleUuid?: string
}) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const isEditing = Boolean(articleUuid)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [isSaving, setIsSaving] = useState(false)

  const { data: articles = [], error, isLoading } = useSWR(
    isEditing && orgId ? ['admin-news-edit', orgId, accessToken || 'anon'] : null,
    () => getAdminNewsArticles(orgId, accessToken)
  )

  const article = useMemo(
    () => articles.find((item) => item.article_uuid === articleUuid),
    [articles, articleUuid]
  )

  useEffect(() => {
    if (article) setDraft(draftFromArticle(article))
  }, [article])

  const setField = (field: keyof DraftState, value: string | boolean | null) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === 'title' && typeof value === 'string'
        ? { slug: slugify(value) }
        : {}),
    }))
  }

  const savePost = async () => {
    const payload: NewsArticleInput = {
      title: draft.title.trim(),
      slug: slugify(draft.title),
      summary: draft.summary || null,
      body: draft.body || null,
      external_url: draft.external_url || null,
      featured: Boolean(draft.featured),
      status: draft.status || 'draft',
      published_at: draft.published_at || null,
    }

    if (!payload.title || !payload.slug) {
      toast.error('Title and slug are required')
      return
    }

    setIsSaving(true)
    try {
      if (articleUuid) {
        await updateNewsArticle(orgId, articleUuid, payload, accessToken)
      } else {
        await createNewsArticle(orgId, payload, accessToken)
      }
      toast.success(articleUuid ? 'Post updated' : 'Post created')
      router.push(getUriWithOrg(orgslug, routePaths.org.dash.news()))
    } catch {
      toast.error('Unable to save post')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing && isLoading) {
    return (
      <main className="w-full bg-[#f8f8f8] px-6 py-6 lg:px-10">
        <div className="text-sm text-gray-500">Loading post...</div>
      </main>
    )
  }

  if (isEditing && (error || !article)) {
    return (
      <main className="w-full bg-[#f8f8f8] px-6 py-6 lg:px-10">
        <Link
          href={getUriWithOrg(orgslug, routePaths.org.dash.news())}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950"
        >
          <ArrowLeft size={14} />
          Back to news
        </Link>
        <div className="rounded-[6px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This post could not be loaded.
        </div>
      </main>
    )
  }

  return (
    <main className="w-full bg-[#f8f8f8] px-6 py-6 lg:px-10">
      <Link
        href={getUriWithOrg(orgslug, routePaths.org.dash.news())}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950"
      >
        <ArrowLeft size={14} />
        Back to news
      </Link>

      <section className="max-w-3xl rounded-[6px] border border-gray-200 bg-white p-5">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
            {articleUuid ? 'Edit post' : 'New post'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create a simple blog-style news post.
          </p>
        </div>

        <div className="grid gap-4">
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

          <div className="flex items-center justify-between gap-4 rounded-[6px] border border-amber-200 bg-amber-50 px-4 py-3">
            <div>
              <Label htmlFor="news-featured" className="text-sm font-semibold text-amber-950">
                Feature this post
              </Label>
              <p className="mt-1 text-xs text-amber-800">
                Featured posts appear at the top of the public News page.
              </p>
            </div>
            <Switch
              id="news-featured"
              checked={Boolean(draft.featured)}
              onCheckedChange={(checked) => setField('featured', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="news-body">Body</Label>
            <Textarea
              id="news-body"
              value={draft.body || ''}
              onChange={(event) => setField('body', event.target.value)}
              placeholder="Write the article body or leave this empty when linking out."
              rows={14}
            />
          </div>

          <div className="flex justify-end border-t border-gray-100 pt-4">
            <Button onClick={savePost} disabled={isSaving} className="gap-2 rounded-[6px]">
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save post'}
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
