import EppCaseload from '@components/Epp/EppCaseload'

/** Every learner the school supports and where their Education Plan and Profile stands. */
export default async function EppCaseloadPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ mine?: string }> }) {
  const { orgslug } = await params
  const { mine } = await searchParams
  return <EppCaseload orgslug={orgslug} mine={mine === '1'} />
}
