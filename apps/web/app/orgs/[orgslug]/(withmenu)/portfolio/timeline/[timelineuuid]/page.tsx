import { ownerItemPage } from '@components/Pages/Portfolio/v2/portfolioPages'

type Props = { params: Promise<{ orgslug: string; timelineuuid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
export default async function TimelineDetailPage({ params, searchParams }: Props) {
  const { orgslug, timelineuuid } = await params
  return ownerItemPage(orgslug, 'experience', timelineuuid, await searchParams)
}
