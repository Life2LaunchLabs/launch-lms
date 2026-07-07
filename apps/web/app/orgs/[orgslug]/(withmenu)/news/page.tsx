import Link from 'next/link'
import type React from 'react'
import { ArrowUpRight, BadgeCheck, User } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getPublishedNewsArticles, NewsArticle } from '@services/news/news'

function formatPublishedDate(value?: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString()
}

function ArticleCard({
  article,
  orgslug,
  featured = false,
}: {
  article: NewsArticle
  orgslug: string
  featured?: boolean
}) {
  const publishedDate = formatPublishedDate(article.published_at)

  return (
    <Link
      href={getUriWithOrg(orgslug, routePaths.org.newsArticle(article.slug))}
      className={`block rounded-[8px] border p-5 transition-colors ${
        featured
          ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
          : 'border-border bg-card hover:bg-muted'
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {featured && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Featured
            </span>
          )}
          {publishedDate && (
            <time className="text-xs font-medium text-muted-foreground">
              {publishedDate}
            </time>
          )}
        </div>
        <div className="text-lg font-semibold text-foreground">
          {article.title}
        </div>
        {article.summary && (
          <p className="text-sm leading-6 text-muted-foreground">
            {article.summary}
          </p>
        )}
      </div>
    </Link>
  )
}

function FeatureCard({
  href,
  icon,
  title,
  description,
  className,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  className: string
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-[160px] flex-col justify-between rounded-[8px] p-5 text-white shadow-sm transition-transform hover:-translate-y-0.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-white/20">
          {icon}
        </div>
        <ArrowUpRight size={18} className="opacity-75 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/85">{description}</p>
      </div>
    </Link>
  )
}

export default async function NewsPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 180,
    tags: ['organizations'],
  })
  const articles = await getPublishedNewsArticles(org.id).catch(() => [])
  const featuredArticles = articles.filter((article) => article.featured)
  const standardArticles = articles.filter((article) => !article.featured)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          News
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Updates on the state of the app while this release is still taking shape.
        </p>
      </div>

      {featuredArticles.length > 0 && (
        <section className="mb-6 flex flex-col gap-3">
          {featuredArticles.map((article) => (
            <ArticleCard
              key={article.article_uuid}
              article={article}
              orgslug={orgslug}
              featured
            />
          ))}
        </section>
      )}

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <FeatureCard
          href={getUriWithOrg(orgslug, routePaths.org.portfolio())}
          icon={<User size={20} fill="currentColor" />}
          title="Portfolio"
          description="Build a public home for projects, reflections, links, and proof of learning."
          className="bg-gradient-to-br from-sky-600 via-cyan-600 to-teal-500"
        />
        <FeatureCard
          href={getUriWithOrg(orgslug, routePaths.org.badges())}
          icon={<BadgeCheck size={20} fill="currentColor" />}
          title="Badges"
          description="Explore credential paths and earn shareable proof of completed skills."
          className="bg-gradient-to-br from-fuchsia-600 via-rose-500 to-orange-400"
        />
      </section>

      {standardArticles.length === 0 ? (
        <div className="rounded-[6px] border border-border bg-card p-6 text-sm text-muted-foreground">
          {articles.length === 0
            ? 'No updates have been published yet.'
            : 'No other updates have been published yet.'}
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          {standardArticles.map((article) => (
            <ArticleCard
              key={article.article_uuid}
              article={article}
              orgslug={orgslug}
            />
          ))}
        </section>
      )}
    </main>
  )
}
