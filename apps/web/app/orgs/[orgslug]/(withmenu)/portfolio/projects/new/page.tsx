import { ownerItemPage } from '@components/Pages/Portfolio/v2/portfolioPages'

type Props = { params: Promise<{ orgslug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
export default async function NewProjectPage({ params, searchParams }: Props) {
  return ownerItemPage((await params).orgslug, 'project', undefined, await searchParams)
}
