import Link from 'next/link'
import type { LegalSection } from '@components/Legal/LegalPage'

// The Terms of Use's text, in one place (DEV-23). Henry set it as final for v0.10.0 (DEV-50); the Product lead approves
// each change. When the terms change, change this file in one pull request and move TERMS_UPDATED.

export const TERMS_UPDATED = '2026-11-16'

export const TERMS_LEDE = <p>
  These terms are the agreement between Life2Launch and everyone who uses it: the schools, programs and other
  organizations that set it up, their staff, and the students and other learners who use it with them or on
  their own. By creating an account or using Life2Launch, you agree to them.
</p>

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'service',
    title: 'What Life2Launch is',
    body: <p>Life2Launch is a place to plan your future: set goals, work through plans, earn badges, build a portfolio and get help from the people supporting you. Organizations such as schools use it to give their learners plans, review their work and see their progress.</p>,
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: <ul>
      <li>You must be 13 or older to create an account.</li>
      <li>Give your real legal name and an email address you use. Keep your password to yourself, and tell your organization or us if you think someone else has used your account.</li>
      <li>You are responsible for what happens in your account.</li>
      <li>One person per account. Don&rsquo;t share an account or sign in as someone else.</li>
    </ul>,
  },
  {
    id: 'organizations',
    title: 'Schools and other organizations',
    body: <>
      <p>An organization that sets up Life2Launch (for example a school, district or program) agrees, for itself and its staff, to:</p>
      <ul>
        <li>use Life2Launch for its learners&rsquo; education, planning and support, and give staff access only to what their work needs;</li>
        <li>have the right to invite the people it invites and to add the information it adds, including any consent its rules or the law require;</li>
        <li>keep control of its students&rsquo; education records, which we handle on its behalf as described in the <Link href="/privacy">Privacy Policy</Link>;</li>
        <li>not invite or enroll anyone under 13.</li>
      </ul>
      <p>An organization&rsquo;s admins decide who belongs to it, what its staff can do, and when a learner becomes an alumnus or is removed.</p>
    </>,
  },
  {
    id: 'students',
    title: 'Students and other learners',
    body: <>
      <p>If you use Life2Launch through a school or program, your organization can see your work there and help you with it, as the <Link href="/privacy">Privacy Policy</Link> describes. Your school&rsquo;s own rules apply to how you use it for school.</p>
      <p>If you are under 18, make sure a parent or guardian knows you are using Life2Launch.</p>
    </>,
  },
  {
    id: 'acceptable-use',
    title: 'Using Life2Launch well',
    body: <>
      <p>Don&rsquo;t use Life2Launch to:</p>
      <ul>
        <li>bully, harass, threaten or impersonate anyone, or share anything sexual, hateful or violent;</li>
        <li>share someone else&rsquo;s private information without their permission;</li>
        <li>upload anything you don&rsquo;t have the right to share, or anything illegal;</li>
        <li>break into accounts or parts of Life2Launch you aren&rsquo;t allowed in, test its security without our written permission, or overload it;</li>
        <li>copy Life2Launch data in bulk, or use it to send spam.</li>
      </ul>
      <p>You can report a message or block someone in Connect. We, or your organization, may remove content or limit an account that breaks these rules.</p>
    </>,
  },
  {
    id: 'content',
    title: 'Your content',
    body: <>
      <p>What you create in Life2Launch (your plans, answers, write-ups, uploads and portfolio) stays yours. You let Life2Launch store, show and process it only to provide the service: to you, to the people you share it with, and to your organization as described in the <Link href="/privacy">Privacy Policy</Link>.</p>
      <p>Plans, activities and badges that an organization builds belong to that organization. Life2Launch itself, its design and its software belong to Life2Launch.</p>
    </>,
  },
  {
    id: 'coach',
    title: 'Coach',
    body: <p>Coach uses an AI model to suggest ideas and answer questions. It can be wrong. Check anything important with a person you trust, such as a counselor or teacher, before you rely on it.</p>,
  },
  {
    id: 'ending',
    title: 'Leaving, and ending access',
    body: <>
      <p>You can stop using Life2Launch at any time and ask us to delete your account. An organization can remove its members or ask us to delete the organization.</p>
      <p>We may suspend or close an account or organization that breaks these terms or puts others at risk. Where we can, we will tell you first and give you a chance to take a copy of your own work.</p>
    </>,
  },
  {
    id: 'disclaimers',
    title: 'What we promise, and what we don’t',
    body: <p>We work to keep Life2Launch available, accurate and secure, but we provide it as it is, without guarantees that it will always be available or free of errors. Plans, requirement tallies and reports help you and your school keep track; your school&rsquo;s own records are what count for graduation and credit. To the extent the law allows, Life2Launch is not liable for indirect or consequential losses from using it.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: <p>We will update this page when the terms change and change the date at the top. For a significant change we will tell organizations, and people with accounts, before it takes effect. If you keep using Life2Launch after that, the new terms apply.</p>,
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <p>Questions about these terms? Email us at <a href="mailto:team@life2launch.com">team@life2launch.com</a>, or start with your organization&rsquo;s Life2Launch admin.</p>,
  },
]
