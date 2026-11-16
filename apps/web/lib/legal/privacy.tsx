import Link from 'next/link'
import type { LegalSection } from '@components/Legal/LegalPage'

// The Privacy Policy's text, in one place (DEV-23). Draft pending legal review; the Product lead
// approves each change. The outside services that handle data are listed once, on the student data
// page (/data, lib/legal/subprocessors.ts), and this policy points there so the two never disagree.
// When what Life2Launch collects or who sees it changes, change this file in the same pull request
// and move PRIVACY_UPDATED.

export const PRIVACY_UPDATED = '2026-11-16'

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
      <li>When a school uses Life2Launch, the school controls its students&rsquo; education records, and we act on its behalf (FERPA).</li>
      <li>Life2Launch does not allow accounts for anyone under 13 (COPPA).</li>
      <li>You can ask to see, correct or delete your data.</li>
    </ul>,
  },
  {
    id: 'collected',
    title: 'What we collect',
    body: <>
      <ul>
        <li><strong>Account:</strong> your legal first and last name, the name you go by, email address, a username, your password (stored only as a one-way hash) and confirmation that you are 13 or older. A profile photo and bio if you add them.</li>
        <li><strong>Membership:</strong> which organizations you belong to, your role there (learner, staff or admin) and your groups.</li>
        <li><strong>Plans and work:</strong> goals, steps, answers, write-ups, decisions, files and photos you hand in, badges, portfolio entries and progress toward requirements.</li>
        <li><strong>School records:</strong> when you agree to a support link with your school, the course and credit information it uses for your Education Plan and Profile.</li>
        <li><strong>Messages:</strong> your conversations in Connect. Staff can also keep notes about a learner that the learner does not see.</li>
        <li><strong>Coach:</strong> what you ask Coach and its answers.</li>
        <li><strong>Imported work:</strong> if your school brings over your work from Oregon CIS, that work is held for you until you accept the invitation, and is deleted if you don&rsquo;t.</li>
        <li><strong>Technical data:</strong> server logs (the page, the time and your IP address) and error reports, to keep the service running and secure. Sign-in uses cookies only to keep you signed in; we use no advertising or tracking cookies.</li>
      </ul>
      <p>We do not collect your date of birth beyond confirming your age, your location, or anything from your contacts.</p>
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
      <li><strong>Your organization&rsquo;s staff:</strong> admins see the organization&rsquo;s learners and their work there. Other staff see only what the admin lets them. Staff see school records, such as an Education Plan and Profile, only through a support link you agreed to.</li>
      <li><strong>People you choose:</strong> helpers you invite to a plan, and anyone you send a portfolio or badge link to. Uploaded files can be opened by anyone who has their link, so share those links with care.</li>
      <li><strong>Life2Launch staff:</strong> a small number of people who run the service, only to run it, support you and fix problems.</li>
      <li><strong>Outside services:</strong> the services that run parts of Life2Launch (hosting, email, the AI model behind Coach, error reports and a few features). Each receives only what it needs. They are listed, with what each receives, on <Link href="/data">How Life2Launch handles student data</Link>.</li>
      <li><strong>When the law requires it:</strong> we share data if a valid legal process requires us to, and tell the school or person affected when we are allowed to.</li>
    </ul>,
  },
  {
    id: 'ferpa',
    title: 'Schools and FERPA',
    body: <>
      <p>When a school or district uses Life2Launch, the student information it puts in, or that students create as part of their schooling, can be part of their education records under the Family Educational Rights and Privacy Act (FERPA).</p>
      <ul>
        <li>The school owns and controls those records. Life2Launch acts as a school official with a legitimate educational interest, under the school&rsquo;s direct control, and uses the records only to provide Life2Launch to the school.</li>
        <li>We do not disclose them to anyone else except as the school directs, as described here, or as the law requires.</li>
        <li>Parents and eligible students ask their school to see or correct education records. We help the school answer.</li>
        <li>When a school stops using Life2Launch, it can ask us to delete its students&rsquo; records.</li>
      </ul>
    </>,
  },
  {
    id: 'coppa',
    title: 'Children under 13 (COPPA)',
    body: <>
      <p>Life2Launch does not allow accounts for anyone under 13. Sign-up asks for your age and refuses anyone younger, and we do not knowingly collect personal information from children under 13.</p>
      <p>If we learn that an account belongs to a child under 13, we delete it and its data. A parent who thinks their child under 13 has an account can tell us (see <a href="#contact">Contact us</a>) and we will delete it.</p>
    </>,
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: <>
      <p>As long as your account exists. When an organization removes you, its access to your work ends; you keep your own account, portfolio and badges. Error reports and logs are kept for a limited time and then deleted.</p>
    </>,
  },
  {
    id: 'rights',
    title: 'Seeing, correcting and deleting your data',
    body: <>
      <p>You can see and change most of your data in Life2Launch yourself. You, a parent of a learner under 18, or your school can ask us to give you a copy of your data, correct it or delete your account and its data. We confirm who is asking first. An organization can ask us to delete the organization and everything in it.</p>
    </>,
  },
  {
    id: 'security',
    title: 'Keeping it safe',
    body: <p>Every connection to Life2Launch is encrypted (HTTPS). Passwords are stored only as one-way hashes. Each organization sees only its own people and their work, and staff see what their admin allows. Accounts lock after repeated failed sign-ins. No system is perfectly secure; if a breach affects your data, we will tell you and your school as the law requires.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <p>We will update this page when what we collect or how we use it changes, and change the date at the top. For a significant change we will tell organizations, and people with accounts, before it takes effect.</p>,
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <p>Students and parents can start with their school or organization&rsquo;s Life2Launch admin. Anyone signed in can also reach us with the Feedback button in Life2Launch.</p>,
  },
]
