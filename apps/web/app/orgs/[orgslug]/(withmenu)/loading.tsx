import { PageContentSkeleton } from '@components/Objects/Loaders/OrgShellSkeleton'

/** Between learner pages: placeholder cards where the page will land, under the menu that stays put. */
export default function Loading() {
  return <div className="px-4 pb-10 pt-6 md:px-8 md:pt-10" role="status" aria-label="Loading" aria-busy="true"><PageContentSkeleton /></div>
}
