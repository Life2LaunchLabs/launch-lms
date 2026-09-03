import { Card } from '@/components/ui/card'

export default function HubLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6 sm:py-12" aria-label="Loading Hub" aria-busy="true">
      <div className="h-56 rounded-3xl bg-muted" />
      <div className="mt-9 h-8 w-72 max-w-full rounded bg-muted" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => <Card key={item} variant="subtle" className="h-40" />)}
      </div>
      <span className="sr-only">Loading your Hub</span>
    </main>
  )
}
