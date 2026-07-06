'use client'

import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import {
  Edit3,
  ExternalLink,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import {
  deleteNewsArticle,
  getAdminNewsArticles,
  publishNewsArticle,
  unpublishNewsArticle,
  updateNewsArticle,
} from '@services/news/news'
import { getUriWithOrg, routePaths } from '@services/config/config'

function formatDate(value?: string | null) {
  if (!value) return 'Not published'
  return new Date(value).toLocaleDateString()
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
  const { data: articles = [], mutate, error, isLoading } = useSWR(
    orgId ? ['admin-news', orgId, accessToken || 'anon'] : null,
    () => getAdminNewsArticles(orgId, accessToken)
  )

  const togglePublished = async (articleUuid: string, published: boolean) => {
    try {
      if (published) {
        await unpublishNewsArticle(orgId, articleUuid, accessToken)
      } else {
        await publishNewsArticle(orgId, articleUuid, accessToken)
      }
      await mutate()
      toast.success(published ? 'Post unpublished' : 'Post published')
    } catch {
      toast.error('Unable to update publishing state')
    }
  }

  const toggleFeatured = async (articleUuid: string, featured: boolean) => {
    try {
      await updateNewsArticle(orgId, articleUuid, { featured: !featured }, accessToken)
      await mutate()
      toast.success(featured ? 'Post unfeatured' : 'Post featured')
    } catch {
      toast.error('Unable to update featured state')
    }
  }

  const removeArticle = async (articleUuid: string) => {
    if (!window.confirm('Delete this news post?')) return
    try {
      await deleteNewsArticle(orgId, articleUuid, accessToken)
      await mutate()
      toast.success('Post deleted')
    } catch {
      toast.error('Unable to delete post')
    }
  }

  return (
    <main className="flex w-full flex-col bg-[#f8f8f8] px-6 py-6 lg:px-10">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950">News</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage the posts shown on the public News page.
          </p>
        </div>
        <Button asChild className="gap-2 rounded-[6px]">
          <Link href={getUriWithOrg(orgslug, routePaths.org.dash.newsNewPost())}>
            <Plus size={16} />
            New post
          </Link>
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-[6px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          News editing is available to owner organization admins.
        </div>
      )}

      <section className="rounded-[6px] border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading posts...</div>
        ) : articles.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No news posts yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {articles.map((article) => {
              const isPublished = article.status === 'published'
              return (
                <article
                  key={article.article_uuid}
                  className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="line-clamp-1 text-base font-semibold text-gray-950">
                        {article.title || 'Untitled post'}
                      </h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isPublished
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isPublished ? 'Published' : 'Draft'}
                      </span>
                      {article.featured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Star size={11} className="fill-current" />
                          Featured
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                      {article.summary || article.body || 'No summary yet.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                      <span>/{article.slug}</span>
                      <span>{formatDate(article.published_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 rounded-[6px]"
                      onClick={() => togglePublished(article.article_uuid, isPublished)}
                    >
                      <Upload size={14} />
                      {isPublished ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 rounded-[6px]"
                      onClick={() => toggleFeatured(article.article_uuid, article.featured)}
                    >
                      <Star size={14} className={article.featured ? 'fill-current text-amber-500' : ''} />
                      {article.featured ? 'Unfeature' : 'Feature'}
                    </Button>
                    <Button asChild type="button" variant="outline" className="h-9 gap-2 rounded-[6px]">
                      <Link href={getUriWithOrg(orgslug, routePaths.org.dash.newsPost(article.article_uuid))}>
                        <Edit3 size={14} />
                        Edit
                      </Link>
                    </Button>
                    {isPublished && (
                      <Button asChild type="button" variant="outline" className="h-9 gap-2 rounded-[6px]">
                        <a
                          href={getUriWithOrg(orgslug, routePaths.org.newsArticle(article.slug))}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={14} />
                          View
                        </a>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 rounded-[6px] border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => removeArticle(article.article_uuid)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
