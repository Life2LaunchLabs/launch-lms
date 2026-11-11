import Link from 'next/link'
import { Lock } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { getUriWithOrg, routePaths } from '@services/config/config'

/** What a person sees at an organization's page when it isn't listed and they aren't a member (or it doesn't exist). */
export default function PrivateOrganization({ orgslug, signedIn }: { orgslug: string; signedIn: boolean }) {
  return <GeneralWrapperStyled>
    <main className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Lock size={24} aria-hidden="true" /></span>
      <h1 className="m-0 text-2xl font-extrabold tracking-tight">This page is for members</h1>
      <p className="m-0 text-base text-muted-foreground">
        This organization hasn&rsquo;t made its page public, or the link is wrong.{signedIn ? '' : ' If you belong to it, sign in to see it.'}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {signedIn ? null : <Link href={getUriWithOrg(orgslug, '/login')} className="inline-flex h-10 items-center rounded-xl bg-foreground px-4 text-sm font-bold text-background no-underline">Sign in</Link>}
        <Link href={getUriWithOrg(orgslug, routePaths.org.discover())} className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-bold text-foreground no-underline">Go to Discover</Link>
      </div>
    </main>
  </GeneralWrapperStyled>
}
