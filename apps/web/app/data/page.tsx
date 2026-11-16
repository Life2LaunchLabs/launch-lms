import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@components/ui/badge'
import { CHECKED_ON, SUBPROCESSORS } from '@/lib/legal/subprocessors'
import { AGE_CHECK, AI_PROVIDERS, COACH_MEMORY, DELETION, LOG_RETENTION, OUTSIDE_IMAGES, SELF_EXPORT, UPLOAD_LINKS } from '@/lib/legal/facts'

// The public page a school's technical reviewer reads (v0.10.0 PF-1, DEV-25). Signed out, on every
// Life2Launch address. Its subprocessor list is lib/legal/subprocessors.ts, shared with /privacy.

export const metadata: Metadata = {
  title: 'How Life2Launch handles student data',
  description: 'What Life2Launch collects, where it is stored, which services handle it, how long it is kept, how to delete it and who can see it.',
}

const COLLECTED: [string, string][] = [
  ['Account', 'Name (legal name and the name a person goes by), email address, username, password (stored only as a one-way hash), profile picture and bio if added.'],
  ['Membership', 'Which organizations a person belongs to, their role there, and their groups.'],
  ['Plans and work', 'Goals, steps, answers, write-ups, decisions, badges earned, portfolio entries and requirement progress.'],
  ['Messages', 'Conversations in Connect, including notes staff keep about a learner (never shown to the learner).'],
  ['Uploads', 'Files and photos people add to steps, their portfolio and resources.'],
  ['Coach conversations', 'What a person asks Coach and its answers, and the memories Coach saves (see Coach and AI below).'],
  ['Logs', 'Server logs of requests (address, time, IP address) and error reports, used to keep the service running and secure. Staff actions on Enterprise organizations are kept in an audit log.'],
]

const ACCESS: [string, string][] = [
  ['The learner', 'Everything in their own account.'],
  ["Their organization's staff", 'Admins see the organization’s learners and their work. Other staff see only what the admin lets them (for example reviewing work or seeing reports). Staff see school records, such as an Education Plan and Profile, only through a support link the learner agreed to.'],
  ['People the learner chooses', 'Helpers a learner invites, and anyone they share a portfolio or badge link with.'],
  ['Life2Launch staff', 'A small number of Life2Launch staff, to run the service, answer support requests and fix problems.'],
  ['The outside services listed above', 'Only the data each one needs for its purpose.'],
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border">
      {rows.map(([term, detail]) => (
        <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="font-medium text-foreground">{term}</dt>
          <dd>{detail}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function StudentDataPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight">Life2Launch</Link>
          <nav aria-label="Legal" className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms of Use</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">How Life2Launch handles student data</h1>
        <p className="mt-4 text-[17px] leading-8 text-muted-foreground">
          For schools and their technical reviewers: what we collect, where it lives, which outside services
          touch it, how long we keep it, how to delete it and who can see it. The list of services was last
          checked against our code and production setup on {CHECKED_ON}.
        </p>

        <Section id="no-ads" title="No ads, no tracking, no selling">
          <p>
            Life2Launch shows no ads, never sells or rents personal data, and loads no analytics, advertising or tracking
            scripts. Pages, code and fonts are all served from Life2Launch itself, and organizations cannot add scripts
            of their own.
          </p>
        </Section>

        <Section id="collected" title="What we collect">
          <Rows rows={COLLECTED} />
          <p>{AGE_CHECK}</p>
        </Section>

        <Section id="stored" title="Where it is stored">
          <p>
            In Life2Launch’s own database and file storage on DigitalOcean servers in the United States. Every connection
            to Life2Launch is encrypted (HTTPS).
          </p>
          <p>{UPLOAD_LINKS}</p>
          <p>{OUTSIDE_IMAGES}</p>
        </Section>

        <Section id="coach" title="Coach and AI">
          <p>{AI_PROVIDERS.summary}</p>
          <p>{AI_PROVIDERS.terms}</p>
          <p>{COACH_MEMORY}</p>
        </Section>

        <Section id="services" title="Outside services that handle data">
          <p>Each one receives only what it needs for its purpose.</p>
          <ul className="space-y-3">
            {SUBPROCESSORS.map((service) => (
              <li key={service.name} className="rounded-2xl border border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={service.website} className="font-medium text-foreground underline-offset-4 hover:underline" rel="noopener noreferrer">{service.name}</a>
                  <Badge variant={service.use === 'always' ? 'secondary' : 'outline'}>{service.use === 'always' ? 'Always used' : 'Only when used'}</Badge>
                  <span className="text-sm">{service.location}</span>
                </div>
                <p className="mt-1">{service.purpose}</p>
                <p className="mt-1"><span className="font-medium text-foreground">Receives: </span>{service.data}</p>
                {service.when ? <p className="mt-1"><span className="font-medium text-foreground">When: </span>{service.when}</p> : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="retention" title="How long we keep it">
          <p>
            As long as the account exists. When an organization removes a learner, the organization’s access ends;
            the learner keeps their own account, portfolio and badges.
          </p>
          <p>{LOG_RETENTION}</p>
        </Section>

        <Section id="deletion" title="Deleting data">
          <p>{DELETION.how}</p>
          <p>{DELETION.effect}</p>
          <p>{SELF_EXPORT}</p>
        </Section>

        <Section id="access" title="Who can see it">
          <Rows rows={ACCESS} />
        </Section>
      </main>
    </div>
  )
}
