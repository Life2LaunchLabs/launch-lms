import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getPublishedNewsArticle } from '@services/news/news'

export default async function NewsArticlePage(props: {
  params: Promise<{ orgslug: string; slug: string }>
}) {
  const { orgslug, slug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 180,
    tags: ['organizations'],
  })
  const article = await getPublishedNewsArticle(org.id, slug).catch(() => null)

  if (!article) {
    notFound()
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={getUriWithOrg(orgslug, routePaths.org.news())}
        className="mb-6 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Back to News
      </Link>

      <article className="rounded-[6px] border border-border bg-card p-6">
        {article.published_at && (
          <time className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {new Date(article.published_at).toLocaleDateString()}
          </time>
        )}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          {article.title}
        </h1>
        {article.summary && (
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            {article.summary}
          </p>
        )}

        {article.external_url && (
          <a
            href={article.external_url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-[6px] bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Read the full update
            <ArrowUpRight size={16} />
          </a>
        )}

        {article.body && (
          <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {article.body}
          </div>
        )}
      </article>
    </main>
  )
}
