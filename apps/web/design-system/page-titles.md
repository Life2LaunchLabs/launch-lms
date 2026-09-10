# Page title standard

Authenticated product pages use **Feature | Detail**. A feature landing page uses **Feature**. Admin routes use
**Admin | Feature**, adding a stable subsection when useful. Dynamic IDs, slugs, loading text, and raw URLs never
appear as titles. Until an entity has loaded, the route's safe feature title is the fallback.

`services/routing/pageTitles.ts` owns the separator, order, 80-character bound, route vocabulary, formatting, and
fallback resolution. `PageTitleProvider` applies that resolver to every authenticated organization route. A surface
that has loaded a meaningful entity name registers `{ path, section, detail }`; registration only applies at that
exact path, which prevents a title surviving navigation. Consumers such as Hub use the resolved context title rather
than reading a heading or interpreting the URL.

The current inventory contains 65 learner page routes and 67 admin page routes. The resolver supplies a named feature
fallback for every family. Plans, learning badges, news articles, portfolio projects, timeline entries, podcasts,
playgrounds, offers, and organization profiles register their loaded entity names now. New entity detail pages render
`PageTitleRegistration`; feature landing pages need no registration. Redirect-only legacy routes inherit the
destination title.
Full Hub registers the active conversation title (`Hub | Finding my next step`); the companion deliberately leaves
the browser title owned by the app page beside it.

To change the product convention later, update `PAGE_TITLE_FORMAT` and `formatAppPageTitle`, then update its tests.
Add route vocabulary to the central label map. Do not add isolated `document.title` effects.
