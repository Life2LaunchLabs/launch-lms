// The one list of outside services that handle Life2Launch data. The student data page (/data, DEV-25)
// and the Privacy Policy (/privacy, DEV-23) both read it, so they cannot disagree.
//
// Built from the code (apps/api config and services, apps/web) and the deploy configuration in
// launch-lms-infra, not from memory. When a service is added, removed or starts receiving different
// data, change this file in the same pull request and update CHECKED_ON.

export const CHECKED_ON = '2026-11-16'

/** When the service receives anything. */
export type SubprocessorUse =
  | 'always' // every Life2Launch site uses it
  | 'feature' // only when someone uses the feature named in `when`

export interface Subprocessor {
  name: string
  purpose: string
  /** What it receives, in plain words. */
  data: string
  /** Where it processes the data. */
  location: string
  use: SubprocessorUse
  /** For `feature`: what has to happen for it to receive anything. */
  when?: string
  website: string
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: 'DigitalOcean',
    purpose: 'Runs the servers, the database and file storage.',
    data: 'Everything stored in Life2Launch: accounts, plans and work, messages, uploads and Coach conversations.',
    location: 'United States',
    use: 'always',
    website: 'https://www.digitalocean.com',
  },
  {
    name: 'Resend',
    purpose: 'Sends email: invitations, sign-in and password codes, and notifications.',
    data: "The recipient's name and email address and the text of the email.",
    location: 'United States',
    use: 'always',
    website: 'https://resend.com',
  },
  {
    name: 'OpenAI and Anthropic',
    purpose: 'The AI models behind Coach and translation of plans (Coach settings choose which answers), and captions for videos (OpenAI).',
    data: 'What a person types to Coach, with the plan, steps and work Coach needs to answer, and text being translated. The audio of a video being captioned (OpenAI). Neither trains on it; see Coach and AI.',
    location: 'United States',
    use: 'feature',
    when: 'Someone uses Coach, translates content or adds captions.',
    website: 'https://openai.com',
  },
  {
    name: 'Sentry',
    purpose: 'Reports errors so we can fix them.',
    data: 'The error, the page address and the browser type. No names, email addresses, IP addresses, cookies or screen recordings.',
    location: 'United States',
    use: 'always',
    website: 'https://sentry.io',
  },
  {
    name: 'Atlassian (Jira)',
    purpose: 'Holds the feedback people send from the Feedback button.',
    data: "The feedback text, any screenshots attached to it, the page it was sent from, and the sender's username.",
    location: 'United States',
    use: 'feature',
    when: 'Someone sends feedback.',
    website: 'https://www.atlassian.com',
  },
  {
    name: 'Judge0',
    purpose: 'Runs code in coding activities.',
    data: 'The code a learner runs and its input. No name or account details.',
    location: 'United States',
    use: 'feature',
    when: 'A learner runs code in a coding activity.',
    website: 'https://judge0.com',
  },
  {
    name: 'WorkOS',
    purpose: "Single sign-on with a school's own accounts.",
    data: "The person's name and email address from the school's sign-in.",
    location: 'United States',
    use: 'feature',
    when: 'An organization turns on single sign-on.',
    website: 'https://workos.com',
  },
  {
    name: 'Stripe',
    purpose: 'Takes payments.',
    data: "The payer's name, email address and payment details (entered with Stripe, never stored by Life2Launch).",
    location: 'United States',
    use: 'feature',
    when: 'An organization that sells access takes a payment. Schools using Life2Launch for free never use it.',
    website: 'https://stripe.com',
  },
  {
    name: 'Pexels',
    purpose: 'Finds free stock photos and videos for staff building plans.',
    data: 'The search words staff type. No learner data.',
    location: 'Germany',
    use: 'feature',
    when: 'Staff search for a stock photo or video.',
    website: 'https://www.pexels.com',
  },
]
