import ChannelPage from '@components/Resources/admin/ChannelPage'

export default async function ResourceChannelRoute({ params }: { params: Promise<{ channeluuid: string }> }) {
  const { channeluuid } = await params
  return <ChannelPage channelUuid={decodeURIComponent(channeluuid)} />
}
