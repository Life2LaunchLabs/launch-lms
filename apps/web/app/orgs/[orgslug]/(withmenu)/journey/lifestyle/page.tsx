import LifestyleClient from './lifestyle'

export default async function LifestylePage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  return <LifestyleClient orgslug={orgslug} />
}
