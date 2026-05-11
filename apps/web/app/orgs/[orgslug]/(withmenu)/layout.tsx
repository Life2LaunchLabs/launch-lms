import WithMenuLayoutClient from './WithMenuLayoutClient'

export default async function RootLayout(props: {
  children: React.ReactNode
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  return <WithMenuLayoutClient orgslug={orgslug}>{props.children}</WithMenuLayoutClient>
}
