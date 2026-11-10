/**
 * Home's two-column layout: the main column and, when Home has one, the side column (This week,
 * Requirements). `lg:` here is a container query on the admin page frame (styles/globals.css), so the
 * side column joins once the content area is 64rem wide. That covers a 1440px window with the admin
 * menu open; `xl:` (80rem of content) only showed it on windows wider than about 1600px.
 */
export const homeColumns = 'lg:grid-cols-[minmax(0,1fr)_340px]'
