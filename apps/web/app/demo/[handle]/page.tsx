import DemoEntry from '@components/Demo/DemoEntry'

/** Direct link to one demo user, e.g. from a QR code. */
export default async function DemoUserPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  return <DemoEntry handle={handle.toLowerCase()} />
}
