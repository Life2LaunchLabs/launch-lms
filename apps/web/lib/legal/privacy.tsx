import Link from 'next/link'
import { AGE_CHECK, AI_PROVIDERS, BIRTH_DATE, COACH_MEMORY, COACH_RETENTION, COACH_RETENTION_LEAD, DELETION, LOG_RETENTION, OPERATOR, OWNERSHIP, SELF_EXPORT, UPLOAD_LINKS } from '@/lib/legal/facts'
import type { LegalSection } from '@components/Legal/LegalPage'

// The Privacy Policy's text, in one place (DEV-23). Henry set it as final for v0.10.0 (DEV-50); the Product lead
// approves each change. The outside services that handle data are listed once, on the student data
// page (/data, lib/legal/subprocessors.ts), and this policy points there so the two never disagree.
// When what Life2Launch collects or who sees it changes, change this file in the same pull request
// and move PRIVACY_UPDATED.

export const PRIVACY_UPDATED = '2026-11-17'

export const PRIVACY_LEDE = <p>
  Life2Launch helps people plan their future and helps schools and programs support them. This policy says what
  we collect, why, who can see it, how long we keep it and how to ask us to change or delete it. It applies to
  life2launch.app and every organization&rsquo;s Life2Launch address.
</p>

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'summary',
    title: 'The short version',
    body: <ul>
      <li>We collect what you and your organization put into Life2Launch, and what we need to keep it running and secure.</li>
      <li>We use it only to provide Life2Launch. We never sell or rent personal data, show ads, or use it to advertise to you.</li>
      <li>Learners own their account, plans, work and portfolio, and keep them after they leave a school or program.</li>
      <li>A school sees school records only through a support link the learner accepts and can end. The school stays responsible for its own official records (FERPA).</li>
      <li>Life2Launch does not allow accounts for anyone under 13 (COPPA).</li>
      <li>You can ask to see, correct or delete your data.</li>
    </ul>,
  },
  {
    id: 'collected',
    title: 'What we collect',
    body: <>
      <ul>
        <li><strong>Account:</strong> your legal first and last name, the name you go by, email address, a username, your password (stored only as a one-way hash), and the date of birth you give when you sign up. A profile photo and bio if you add them. {BIRTH_DATE}</li>
        <li><strong>Membership:</strong> which organizations you belong to, your role there (learner, staff or admin) and your groups.</li>
        <li><strong>Plans and work:</strong> goals, steps, answers, write-ups, decisions, files and photos you hand in, badges, portfolio entries and progress toward requirements.</li>
        <li><strong>School records:</strong> when you agree to a support link with your school, the course and credit information it uses for your Education Plan and Profile.</li>
        <li><strong>Messages:</strong> your conversations in Connect. Staff can also keep notes about a learner that the learner does not see.</li>
        <li><strong>Coach:</strong> what you ask Coach and its answers. {AI_PROVIDERS.summary} {AI_PROVIDERS.terms} {COACH_MEMORY}</li>
        <li><strong>Imported work:</strong> if your school brings over your work from Oregon CIS, that work is held for you until you accept the invitation, and is deleted if you don&rsquo;t.</li>
        <li><strong>Technical data:</strong> server logs (the page, the time and your IP address) and error reports, to keep the service running and secure. Sign-in uses cookies only to keep you signed in; we use no advertising or tracking cookies.</li>
      </ul>
      <p>We do not collect your location or anything from your contacts.</p>
    </>,
  },
  {
    id: 'use',
    title: 'How we use it',
    body: <>
      <p>To provide Life2Launch to you and your organization: show your plans and progress, let you work with the people you choose, send the emails you need (invitations, sign-in codes, notifications you can switch off), answer support requests, keep accounts secure and fix problems.</p>
      <p>We do not sell or rent personal data, use it for advertising, or build profiles of students for any purpose other than their education and planning.</p>
    </>,
  },
  {
    id: 'who-sees',
    title: 'Who can see it',
    body: <ul>
      <li><strong>You:</strong> everything in your own account.</li>
      <li><strong>Your organization&rsquo;s staff:</strong> {OWNERSHIP.staff} Admins see the organization&rsquo;s learners and their work on those plans; other staff see only what the admin lets them. Staff see school records, such as an Education Plan and Profile, only through a support link you accepted.</li>
      <li><strong>People you choose:</strong> helpers you invite to a plan, and anyone you send a portfolio or badge link to.</li>
      <li><strong>Uploaded files:</strong> {UPLOAD_LINKS}</li>
      <li><strong>Life2Launch staff:</strong> a small number of people who run the service, only to run it, support you and fix problems.</li>
      <li><strong>Outside services:</strong> the services that run parts of Life2Launch (hosting, email, the AI model behind Coach, error reports and a few features). Each receives only what it needs. They are listed, with what each receives, on <Link href="/data">How Life2Launch handles student data</Link>.</li>
      <li><strong>When the law requires it:</strong> we share data if a valid legal process requires us to, and tell the school or person affected when we are allowed to.</li>
    </ul>,
  },
  {
    id: 'ferpa',
    title: 'Schools and FERPA',
    body: <>
      <p>When a school or district uses Life2Launch, the school records it uses, such as course and credit information for an Education Plan and Profile, can be part of students&rsquo; education records under the Family Educational Rights and Privacy Act (FERPA).</p>
      <ul>
        <li>{OWNERSHIP.learners}</li>
        <li>{OWNERSHIP.schools}</li>
        <li>For those school records, Life2Launch acts as a school official with a legitimate educational interest and uses them only to provide Life2Launch to the school and the learner. We do not disclose them to anyone else except with the learner&rsquo;s agreement, as described here, or as the law requires.</li>
        <li>Parents and eligible students ask their school to see or correct the school&rsquo;s records. We help the school answer.</li>
        <li>When a school stops using Life2Launch, its access ends. Its learners keep their own accounts and work.</li>
      </ul>
    </>,
  },
  {
    id: 'coppa',
    title: 'Children under 13 (COPPA)',
    body: <>
      <p>Life2Launch does not allow accounts for anyone under 13. We do not knowingly collect personal information from children under 13.</p>
      <p>{AGE_CHECK}</p>
      <p>If we learn that an account belongs to a child under 13, we delete it and its data. A parent who thinks their child under 13 has an account can email <a href="mailto:team@life2launch.com">team@life2launch.com</a> and we will delete it.</p>
    </>,
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: <>
      <p>As long as your account exists. When an organization removes you, its access to your work ends; you keep your own account, portfolio and badges.</p>
      <p>{COACH_RETENTION_LEAD}</p>
      <ul>
        {COACH_RETENTION.map(([kind, period]) => <li key={kind}><strong>{kind}:</strong> {period}</li>)}
      </ul>
      <p>The full retention schedule is on <Link href="/data#retention">How Life2Launch handles student data</Link>.</p>
      <p>{LOG_RETENTION}</p>
    </>,
  },
  {
    id: 'rights',
    title: 'Seeing, correcting and deleting your data',
    body: <>
      <p>You can see and change most of your data in Life2Launch yourself. {SELF_EXPORT} You or a parent of a learner under 18 can ask us to give you a copy of your data or correct it.</p>
      <p>{DELETION.how}</p>
      <p>{DELETION.effect}</p>
    </>,
  },
  {
    id: 'security',
    title: 'Keeping it safe',
    body: <p>Every connection to Life2Launch is encrypted (HTTPS). Passwords are stored only as one-way hashes. Each organization sees only its own people and their work on the plans it manages, and staff see what their admin allows. Accounts lock after repeated failed sign-ins. No system is perfectly secure; if a breach affects your data, we will tell you and your school as the law requires.</p>,
  },
  {
    id: 'operator',
    title: 'Who we are',
    body: <p>{OPERATOR}</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <p>We will update this page when what we collect or how we use it changes, and change the date at the top. For a significant change we will tell organizations, and people with accounts, before it takes effect.</p>,
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <p>Email us at <a href="mailto:team@life2launch.com">team@life2launch.com</a> with any privacy question or request, including asking to see, correct or delete data. Students and parents can also start with their school or organization&rsquo;s Life2Launch admin. Our mailing address is Life2Launch, LLC, PO Box 12163, Portland, Oregon 97212.</p>,
  },
]
