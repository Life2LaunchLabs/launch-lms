import { ownerItemPage } from '@components/Pages/Portfolio/v2/portfolioPages'

type Props = { params: Promise<{ orgslug: string; projectuuid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
export default async function OwnerProjectDetail({ params, searchParams }: Props) {
  const { orgslug, projectuuid } = await params
  return ownerItemPage(orgslug, 'project', projectuuid, await searchParams)
}
