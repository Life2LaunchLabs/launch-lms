import { redirect } from 'next/navigation'

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ orgslug: string; collectionuuid: string }>
}) {
  const { orgslug, collectionuuid } = await params
  redirect(`/${orgslug}/dash/courses/collection/${collectionuuid}/general`)
}
