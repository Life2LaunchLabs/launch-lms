import Link from 'next/link'
import { primaryActionClass, secondaryActionClass } from '@components/Admin/Plans/PlansActions'
import { cn } from '@/lib/utils'

export type WelcomeAction = { label: string; href: string; primary?: boolean }

/**
 * What an empty admin page shows before it has anything in it: what the page is for, the one or
 * two things that fill it, and how it works. It goes away once the page has content.
 */
export default function PageWelcome({ icon, title, body, how, actions = [], children, className }: {
  icon?: React.ReactNode
  title: string
  body: React.ReactNode
  /** One line on how the page works, under the actions. */
  how?: React.ReactNode
  actions?: WelcomeAction[]
  /** Actions that aren't links, such as a dialog's trigger. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section aria-label={title} className={cn('rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center sm:px-10 sm:py-12', className)}>
      {icon ? <div aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">{icon}</div> : null}
      <h2 className="text-lg font-black text-gray-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-600">{body}</p>
      {actions.length || children ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {actions.map((action) => (
            <Link key={action.label} href={action.href}
              className={action.primary ? primaryActionClass : secondaryActionClass}>
              {action.label}
            </Link>
          ))}
          {children}
        </div>
      ) : null}
      {how ? <p className="mx-auto mt-6 max-w-lg text-xs leading-5 text-gray-500">{how}</p> : null}
    </section>
  )
}
