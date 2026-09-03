'use client'

import React from 'react'
import { Check, ChevronRight, Moon, Palette, Search, Sun } from 'lucide-react'
import catalog from '@/design-system/catalog.json'
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Card } from '@components/ui/card'
import { Checkbox } from '@components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { Textarea } from '@components/ui/textarea'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'

const swatchStyles: Record<string, React.CSSProperties> = {
  '--background': { backgroundColor: 'hsl(var(--background))' },
  '--foreground': { backgroundColor: 'hsl(var(--foreground))' },
  '--card': { backgroundColor: 'hsl(var(--card))' },
  '--muted': { backgroundColor: 'hsl(var(--muted))' },
  '--border': { backgroundColor: 'hsl(var(--border))' },
  '--destructive': { backgroundColor: 'hsl(var(--destructive))' },
  '--org-primary-color': { backgroundColor: 'var(--org-primary-color)' },
  '--org-on-primary-color': { backgroundColor: 'var(--org-on-primary-color)' },
}

function onAccent(hex: string) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .179 ? '#000000' : '#ffffff'
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div className="mb-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{body}</p></div>
}

function Specimen({ title, source, children }: { title: string; source: string; children: React.ReactNode }) {
  return <Card size="none" className="overflow-hidden rounded-2xl"><div className="border-b border-border bg-muted/50 px-5 py-3"><p className="font-bold">{title}</p><p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{source}</p></div><div className="p-5 sm:p-7">{children}</div></Card>
}

function Foundations() {
  return <section><SectionHeading eyebrow="Foundations" title="Semantic first, tenant-aware" body="These swatches resolve the product's live CSS variables. Organization accents are an additional theme layer, not replacements for semantic surface and text tokens." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{catalog.foundations.map((item) => <Card key={item.token} size="sm" className="rounded-2xl"><div className="mb-4 h-20 rounded-xl border border-border" style={swatchStyles[item.token]} /><p className="font-bold">{item.name}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.token}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.role}</p></Card>)}</div>
    <div className="mt-10 grid gap-4 lg:grid-cols-2"><Specimen title="Type hierarchy" source="apps/web/styles/globals.css"><div className="space-y-5"><div><h1 className="text-4xl font-black">Page heading</h1><p className="text-xs text-muted-foreground">Wix Madefor Text · black</p></div><div><h2 className="text-2xl font-bold">Section heading</h2><p className="text-xs text-muted-foreground">Bold and direct</p></div><p className="leading-7">Body copy uses semantic foreground colors and a compact product rhythm.</p><p className="text-sm text-muted-foreground">Muted copy provides context without disappearing.</p></div></Specimen><Specimen title="Shape and elevation" source="components/ui/card.tsx"><div className="grid grid-cols-2 gap-4"><Card size="sm">Default card</Card><Card size="sm" variant="subtle">Subtle card</Card><Card size="sm" variant="interactive">Interactive card</Card><Card size="sm" variant="filled">Branded card</Card></div></Specimen></div>
  </section>
}

function Components() {
  const [buttonVariant, setButtonVariant] = React.useState('brand')
  const [disabled, setDisabled] = React.useState(false)
  const [checked, setChecked] = React.useState(true)
  return <section><SectionHeading eyebrow="Components" title="Rendered from shared product code" body="Each specimen imports the component shown in its source label. Controls change supported props rather than reproducing the component's styles here." />
    <div className="space-y-4"><Specimen title="Actions" source="apps/web/components/ui/button.tsx"><div className="mb-5 flex flex-wrap items-center gap-3"><Select value={buttonVariant} onValueChange={setButtonVariant}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{['default','brand','surface','cta','ctaSecondary','outline','secondary','ghost','link','destructive'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><div className="flex items-center gap-2"><Switch checked={disabled} onCheckedChange={setDisabled} id="disabled" /><Label htmlFor="disabled">Disabled</Label></div></div><div className="flex flex-wrap gap-3"><Button variant={buttonVariant as React.ComponentProps<typeof Button>['variant']} disabled={disabled}>Continue</Button><Button variant={buttonVariant as React.ComponentProps<typeof Button>['variant']} size="sm" disabled={disabled}>Small</Button><Button variant={buttonVariant as React.ComponentProps<typeof Button>['variant']} size="icon" aria-label="Search" disabled={disabled}><Search /></Button></div></Specimen>
      <Specimen title="Form controls" source="apps/web/components/ui/input.tsx · select.tsx · switch.tsx · checkbox.tsx"><div className="grid max-w-2xl gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="example-title">Title</Label><Input id="example-title" placeholder="Name this learning plan" /></div><div className="grid gap-2"><Label>Visibility</Label><Select defaultValue="organization"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Private</SelectItem><SelectItem value="organization">Organization</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent></Select></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="example-description">Description</Label><Textarea id="example-description" placeholder="Describe the intended outcome" /></div><div className="flex items-center gap-2"><Checkbox id="example-check" checked={checked} onCheckedChange={(value) => setChecked(Boolean(value))} /><Label htmlFor="example-check">Include completion evidence</Label></div><div className="flex items-center gap-2"><Switch id="example-switch" defaultChecked /><Label htmlFor="example-switch">Notify participants</Label></div></div></Specimen>
      <Specimen title="Feedback and overlays" source="apps/web/components/ui/alert.tsx · badge.tsx · dialog.tsx"><div className="space-y-5"><div className="flex flex-wrap gap-2"><Badge>Published</Badge><Badge variant="secondary">Draft</Badge><Badge variant="outline">Optional</Badge><Badge variant="destructive">Blocked</Badge></div><Alert><Palette className="h-4 w-4" /><AlertTitle>Organization theme applied</AlertTitle><AlertDescription>Brand emphasis changes while semantic structure remains stable.</AlertDescription></Alert><Dialog><DialogTrigger asChild><Button variant="outline">Open real dialog</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Publish this framework?</DialogTitle><DialogDescription>Participants will receive the published version. Future edits create a new draft.</DialogDescription></DialogHeader><DialogFooter className="mt-6"><Button variant="outline">Keep editing</Button><Button variant="brand">Publish</Button></DialogFooter></DialogContent></Dialog></div></Specimen>
    </div>
  </section>
}

function Inventory() {
  const [filter, setFilter] = React.useState('all')
  const entries = catalog.components.filter((item) => filter === 'all' || item.status === filter)
  return <section><SectionHeading eyebrow="Inventory" title="What exists, before what comes next" body="Usage is a discovery snapshot, not a quality score. Candidate and legacy classifications make alternate paths visible so new work can choose deliberately." /><div className="mb-4 flex gap-2"><Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All</Button><Button size="sm" variant={filter === 'adopted' ? 'default' : 'outline'} onClick={() => setFilter('adopted')}>Adopted</Button><Button size="sm" variant={filter === 'candidate' ? 'default' : 'outline'} onClick={() => setFilter('candidate')}>Candidates</Button></div><Card size="none" className="overflow-hidden rounded-2xl"><div className="divide-y divide-border">{entries.map((item) => <div key={item.source} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(140px,.7fr)_minmax(240px,1.5fr)_auto] sm:items-center"><div><p className="font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{item.category} · {item.usage} imports</p></div><p className="truncate font-mono text-[11px] text-muted-foreground">{item.source}</p><Badge variant={item.status === 'adopted' ? 'default' : 'outline'}>{item.status}</Badge>{'notes' in item && item.notes ? <p className="text-xs text-muted-foreground sm:col-span-3">{item.notes}</p> : null}</div>)}</div></Card>
    <h3 className="mt-10 text-xl font-black">Shared and overlapping patterns</h3><div className="mt-4 grid gap-3 lg:grid-cols-2">{catalog.patterns.map((item) => <Card key={item.source} size="sm" className="rounded-2xl"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{item.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.role}</p></div><Badge variant={item.status === 'adopted' ? 'default' : 'destructive'}>{item.status}</Badge></div><p className="mt-4 break-all font-mono text-[11px] text-muted-foreground">{item.source}</p></Card>)}</div>
  </section>
}

function Layouts() {
  return <section><SectionHeading eyebrow="Layouts" title="Recurring product compositions" body="These specimens use the actual shared wrapper and product primitives. The inventory beneath them identifies established headers and the legacy overlaps that still need deliberate migration." />
    <div className="space-y-4">
      <Specimen title="General content wrapper" source="apps/web/components/Objects/StyledElements/Wrappers/GeneralWrapper.tsx"><div className="overflow-hidden rounded-xl border border-dashed border-border bg-muted/30"><GeneralWrapperStyled><div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Contained product page</p><h3 className="mt-2 text-2xl font-black">A bounded reading and working area</h3><p className="mt-2 max-w-xl text-sm text-muted-foreground">The wrapper supplies the established maximum width, padding, and tracking.</p></div></GeneralWrapperStyled></div></Specimen>
      <Specimen title="Master–detail workspace" source="apps/web/components/ui/card.tsx · tabs.tsx · button.tsx"><div className="grid min-h-72 gap-4 rounded-2xl bg-muted/50 p-4 md:grid-cols-[minmax(220px,32%)_1fr]"><Card size="sm" className="rounded-xl"><p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Plans</p><div className="mt-3 space-y-2">{['Career launch', 'College readiness', 'Community project'].map((item, index) => <button key={item} className={`w-full rounded-lg p-3 text-left text-sm font-bold ${index === 0 ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>{item}</button>)}</div></Card><Card size="default" className="rounded-xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><Badge variant="secondary">Active plan</Badge><h3 className="mt-3 text-2xl font-black">Career launch</h3><p className="mt-1 text-sm text-muted-foreground">A focused detail surface using the current product rhythm.</p></div><Button variant="brand" size="sm">Add objective</Button></div><div className="mt-7 grid gap-3"><Card variant="subtle" size="sm" className="rounded-xl"><p className="font-bold">Build a portfolio</p><p className="mt-1 text-xs text-muted-foreground">In progress</p></Card><Card variant="subtle" size="sm" className="rounded-xl"><p className="font-bold">Practice an interview</p><p className="mt-1 text-xs text-muted-foreground">Up next</p></Card></div></Card></div></Specimen>
      <Specimen title="Tabbed content surface" source="apps/web/components/ui/tabs.tsx · card.tsx"><Card size="default" className="rounded-xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Badge</p><h3 className="mt-1 text-2xl font-black">Community builder</h3></div><Badge>Published</Badge></div><Tabs defaultValue="overview" className="mt-6"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="criteria">Criteria</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList><TabsContent value="overview" className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Overview content follows the shared tab and card language.</TabsContent><TabsContent value="criteria" className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Criteria content remains in the same stable shell.</TabsContent><TabsContent value="activity" className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Activity content remains in the same stable shell.</TabsContent></Tabs></Card></Specimen>
    </div>
  </section>
}

function Standards() {
  return <section><SectionHeading eyebrow="Standards" title="A lightweight contribution contract" body="The catalog becomes authoritative through the delivery loop: search, justify, share, document, and review." /><div className="grid gap-3">{catalog.standards.map((item, index) => <Card key={item} size="sm" className="rounded-2xl"><div className="flex gap-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-black text-background">{index + 1}</span><p className="text-sm font-semibold leading-6">{item}</p></div></Card>)}</div><h3 className="mt-10 text-xl font-black">Pre-review evidence</h3><Card size="sm" className="mt-4 rounded-2xl"><div className="space-y-3">{['Existing shared components and patterns were evaluated first.','Applicable interaction, theme, and responsive states were exercised.','New shared work is represented in the manifest and preview.'].map((item, index) => <label key={item} className="flex items-start gap-3"><Checkbox defaultChecked={index === 0} /><span className="text-sm">{item}</span></label>)}</div><p className="mt-5 text-xs text-muted-foreground">Specimen only—record the actual result on the delivery task.</p></Card></section>
}

export default function DesignSystemCatalog() {
  const [themeMode, setThemeMode] = React.useState<'light' | 'dark'>('light')
  const [accent, setAccent] = React.useState('#8b5cf6')
  const themeStyle = { '--org-primary-color': accent, '--org-on-primary-color': onAccent(accent) } as React.CSSProperties
  return <div className={themeMode}><div data-org-theme style={themeStyle} className="min-h-screen bg-background text-foreground"><header className="sticky top-0 z-[var(--z-nav)] border-b border-border bg-background/95 backdrop-blur"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Launch LMS</p><h1 className="text-xl font-black">Design system</h1></div><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold"><span>Accent</span><input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-card p-1" /></label><Button variant="outline" size="icon" aria-label="Toggle color theme" onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}>{themeMode === 'dark' ? <Sun /> : <Moon />}</Button></div></div></header><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12"><div className="mb-8 rounded-3xl bg-foreground p-7 text-background sm:p-10"><Badge variant="secondary">Actual product components</Badge><h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Use what the product has. Make the next choice deliberate.</h2><p className="mt-4 max-w-2xl text-sm leading-6 opacity-70 sm:text-base">This catalog imports Launch LMS tokens and components directly. The inventory is honest about adopted, candidate, legacy, and feature-local paths.</p></div><Tabs defaultValue="foundations"><TabsList className="mb-8 h-auto max-w-full justify-start overflow-x-auto"><TabsTrigger value="foundations">Tokens</TabsTrigger><TabsTrigger value="components">Components</TabsTrigger><TabsTrigger value="layouts">Layouts</TabsTrigger><TabsTrigger value="inventory">Inventory</TabsTrigger><TabsTrigger value="standards">Standards</TabsTrigger></TabsList><TabsContent value="foundations"><Foundations /></TabsContent><TabsContent value="components"><Components /></TabsContent><TabsContent value="layouts"><Layouts /></TabsContent><TabsContent value="inventory"><Inventory /></TabsContent><TabsContent value="standards"><Standards /></TabsContent></Tabs><footer className="mt-16 flex items-center gap-2 border-t border-border py-8 text-xs text-muted-foreground"><Check className="h-4 w-4" />Catalog schema {catalog.schema_version}<ChevronRight className="h-3 w-3" />Owned by {catalog.owner}</footer></main></div></div>
}
