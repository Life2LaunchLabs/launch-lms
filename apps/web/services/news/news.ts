import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'

export type NewsArticleStatus = 'draft' | 'published'

export interface NewsArticle {
  id: number
  article_uuid: string
  org_id: number
  author_user_id: number | null
  title: string
  slug: string
  summary: string | null
  body: string | null
  external_url: string | null
  status: NewsArticleStatus
  published_at: string | null
  creation_date: string
  update_date: string
}

export type NewsArticleInput = {
  title: string
  slug: string
  summary?: string | null
  body?: string | null
  external_url?: string | null
  status?: NewsArticleStatus
  published_at?: string | null
}

export type NewsArticleUpdate = Partial<NewsArticleInput>

export async function getPublishedNewsArticles(orgId: number) {
  const result: any = await fetch(
    `${getAPIUrl()}news/org/${orgId}`,
    RequestBodyWithAuthHeader('GET', null, null, undefined)
  )
  return errorHandling(result) as Promise<NewsArticle[]>
}

export async function getPublishedNewsArticle(orgId: number, slug: string) {
  const result: any = await fetch(
    `${getAPIUrl()}news/org/${orgId}/${encodeURIComponent(slug)}`,
    RequestBodyWithAuthHeader('GET', null, null, undefined)
  )
  return errorHandling(result) as Promise<NewsArticle>
}

export async function getAdminNewsArticles(orgId: number, accessToken?: string, query?: string) {
  const search = query ? `?query=${encodeURIComponent(query)}` : ''
  const result: any = await fetch(
    `${getAPIUrl()}news/admin/org/${orgId}${search}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<NewsArticle[]>
}

export async function createNewsArticle(orgId: number, data: NewsArticleInput, accessToken?: string) {
  const result: any = await fetch(
    `${getAPIUrl()}news/admin/org/${orgId}`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<NewsArticle>
}

export async function updateNewsArticle(
  orgId: number,
  articleUuid: string,
  data: NewsArticleUpdate,
  accessToken?: string
) {
  const result: any = await fetch(
    `${getAPIUrl()}news/admin/org/${orgId}/${articleUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<NewsArticle>
}

export async function publishNewsArticle(orgId: number, articleUuid: string, accessToken?: string) {
  const result: any = await fetch(
    `${getAPIUrl()}news/admin/org/${orgId}/${articleUuid}/publish`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result) as Promise<NewsArticle>
}

export async function unpublishNewsArticle(orgId: number, articleUuid: string, accessToken?: string) {
  const result: any = await fetch(
    `${getAPIUrl()}news/admin/org/${orgId}/${articleUuid}/unpublish`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result) as Promise<NewsArticle>
}

export async function deleteNewsArticle(orgId: number, articleUuid: string, accessToken?: string) {
  const result: any = await fetch(
    `${getAPIUrl()}news/admin/org/${orgId}/${articleUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result) as Promise<{ deleted: boolean }>
}
