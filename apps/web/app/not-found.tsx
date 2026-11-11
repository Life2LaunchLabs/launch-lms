import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import appIcon from 'public/app_icon.svg'

// Theme tokens, not fixed black: in the dark theme the background turns dark, so the
// text has to turn light with it.
export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted to-background px-4 text-foreground">
      <div className="pb-20">
        <Image quality={100} width={270} height={100} src={appIcon} alt="logo" />
      </div>
      <div className="space-y-6 text-center">
        <h1 className="text-8xl leading-7 font-bold text-foreground drop-shadow-md">404!</h1>
        <p className="text-lg pt-8 text-foreground tracking-tight font-medium leading-normal">
          We are very sorry for the inconvenience. It looks like you&apos;re trying to
          <span className="block">access a page that has been deleted or never existed before</span>
        </p>
      </div>
      <div className="pt-8 flex flex-col items-center">
        <Link
          href="/"
          className="flex w-fit h-[50px] text-xl bg-foreground px-6 py-2 rounded-lg font-bold text-background items-center shadow-md gap-2"
        >
          Go back to homepage
          <ArrowRight className="ml-1" />
        </Link>
      </div>
    </div>
  )
}
