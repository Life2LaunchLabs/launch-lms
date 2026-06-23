import { Metadata } from 'next'
import WelcomeClient from './WelcomeClient'

export const metadata: Metadata = {
  title: 'Welcome',
}

export default function WelcomePage() {
  return <WelcomeClient />
}
