import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'

const ProfileResumePage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href={getUriWithOrg(params.orgslug, routePaths.org.profile())}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>

        <section className="mt-10 rounded-2xl border border-gray-200 bg-white px-6 py-14 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
            Resume export
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-gray-950">Coming soon</h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-gray-600">
            Resume export will turn your profile into a shareable resume format.
          </p>
        </section>
      </div>
    </main>
  )
}

export default ProfileResumePage
