import Link from 'next/link'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getPublishedNewsArticles } from '@services/news/news'

export default async function NewsPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 180,
    tags: ['organizations'],
  })
  const articles = await getPublishedNewsArticles(org.id).catch(() => [])

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
          News
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          Updates on the state of the app while this release is still taking shape.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-[6px] border border-gray-200 bg-white p-6 text-sm text-gray-600">
          No updates have been published yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-200 rounded-[6px] border border-gray-200 bg-white">
          {articles.map((article) => (
            <Link
              key={article.article_uuid}
              href={getUriWithOrg(orgslug, routePaths.org.newsArticle(article.slug))}
              className="block p-5 transition-colors hover:bg-gray-50"
            >
              <div className="flex flex-col gap-2">
                <div className="text-lg font-semibold text-gray-950">
                  {article.title}
                </div>
                {article.summary && (
                  <p className="text-sm leading-6 text-gray-600">
                    {article.summary}
                  </p>
                )}
                {article.published_at && (
                  <time className="text-xs text-gray-400">
                    {new Date(article.published_at).toLocaleDateString()}
                  </time>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
