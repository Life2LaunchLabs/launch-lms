# Launch LMS design system

This directory is the canonical inventory for the Launch LMS product interface. `catalog.json` is deliberately
machine-readable. The shared `DesignSystemCatalog` imports real product primitives and is rendered both at the
Launch LMS `/design-system` route and as an isolated Product Operations build entry. Product Operations therefore
does not recreate component styles or require a second development server.

The catalog describes the product as it exists. `adopted` means a component is the current shared choice;
`candidate` means it exists but needs evaluation or broader proof; `legacy` identifies an overlapping path that
must remain visible until it is deliberately migrated. Classification does not imply that every product surface
already conforms.

## Contribution loop

1. Search `catalog.json`, `components/ui`, and shared product patterns before adding UI.
2. Prefer an adopted component when it supports the required behavior.
3. Record the missing behavior on the delivery task when no current component fits.
4. Add reusable work to shared product code rather than leaving it feature-local.
5. Add or update its catalog entry and live specimen.
6. Record a design-system conformance check before product review.

Relevant manual checks include keyboard and focus behavior, narrow and wide layouts, light and dark modes,
organization accent colors, and applicable loading, empty, populated, disabled, and error states.

## Scope boundary

This first catalog does not migrate legacy components or feature-local markup. Progressive consolidation is
tracked separately in the Product Operations task system.
