import { useMemo, useReducer, useState, type ReactNode } from 'react'
import { parseForm } from '@/lib/form-mirror'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

// The Torrent-search preferences form is a wall of multi-value checkbox groups
// (90 categories, 65 languages, 61+61 new-search categories) behind MAM's own
// toggle widgets. Rendered flat that is hundreds of switches; here each group is
// a proper facet (grouped / searchable, with select-all), FormMirror the rest.
interface Check { name: string; el: HTMLInputElement }
interface CatGroup { id: string; name: string; cats: Check[] }

const FACET_FIELDS = ['cats[]', 'browse_lang[]', 'def[categories][]', 'def[exclude_categories][]']

const label = (el: Element, wrapSel: string) => {
  const w = el.closest(wrapSel)
  return (w?.querySelector('div')?.textContent ?? w?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function collect(form: HTMLElement, name: string, wrapSel: string): Check[] {
  return [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)]
    .map((el) => ({ el, name: label(el, wrapSel) }))
    .filter((c) => c.name)
}

function parseCategories(form: HTMLElement): CatGroup[] {
  const groups: CatGroup[] = []
  for (const holder of form.querySelectorAll('.categoryHolder')) {
    const h4 = holder.querySelector('h4.torMainCatSel')
    const name = (h4?.querySelector('div')?.textContent ?? h4?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cats: Check[] = []
    for (const a of holder.querySelectorAll('a.torCatSel')) {
      const el = a.querySelector<HTMLInputElement>('input[name="cats[]"]')
      const nm = a.querySelector('div')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (el && nm) cats.push({ el, name: nm })
    }
    if (cats.length) groups.push({ id: h4?.id ?? name, name, cats })
  }
  return groups
}

function FacetShell({
  title, note, count, total, onClear, children,
}: { title: string; note?: string; count: number; total: number; onClear: () => void; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <span className="flex items-center gap-3 text-[12px] text-muted-foreground">
            {count} / {total} selected
            {count > 0 && <button onClick={onClear} className="text-brand hover:underline">Clear</button>}
          </span>
        </div>
        {note && <p className="pt-0.5 text-[12px] text-muted-foreground">{note}</p>}
      </CardHeader>
      <CardContent className="grid gap-4 pb-5">{children}</CardContent>
    </Card>
  )
}

function CheckGrid({ items, onChange }: { items: Check[]; onChange: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((c, i) => (
        <label key={i} className="flex items-center gap-2 text-[13px] leading-snug">
          <Checkbox checked={c.el.checked} onCheckedChange={(v) => { c.el.checked = v === true; onChange() }} />
          <span className="min-w-0 truncate" title={c.name}>{c.name}</span>
        </label>
      ))}
    </div>
  )
}

/** Categories grouped by main category, each with a select-all. */
function CategoryFacet({ groups, onChange }: { groups: CatGroup[]; onChange: () => void }) {
  const all = groups.flatMap((g) => g.cats)
  const sel = all.filter((c) => c.el.checked).length
  return (
    <FacetShell
      title="Default search categories"
      note="Nothing selected means every category is searched by default."
      count={sel} total={all.length}
      onClear={() => { all.forEach((c) => (c.el.checked = false)); onChange() }}
    >
      {groups.map((g) => {
        const s = g.cats.filter((c) => c.el.checked).length
        const state: boolean | 'indeterminate' = s === 0 ? false : s === g.cats.length ? true : 'indeterminate'
        return (
          <div key={g.id}>
            <label className="flex items-center gap-2 pb-2.5 text-[13.5px] font-medium">
              <Checkbox checked={state} onCheckedChange={(v) => { g.cats.forEach((c) => (c.el.checked = v === true)); onChange() }} />
              {g.name}
              <span className="text-[12px] font-normal text-muted-foreground">{s}/{g.cats.length}</span>
            </label>
            <div className="pl-6"><CheckGrid items={g.cats} onChange={onChange} /></div>
          </div>
        )
      })}
    </FacetShell>
  )
}

/** Flat multi-select with a filter box, for long lists (languages, categories). */
function SearchableFacet({ title, note, items, onChange }: { title: string; note?: string; items: Check[]; onChange: () => void }) {
  const [q, setQ] = useState('')
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())) : items
  const sel = items.filter((i) => i.el.checked).length
  return (
    <FacetShell title={title} note={note} count={sel} total={items.length} onClear={() => { items.forEach((i) => (i.el.checked = false)); onChange() }}>
      {items.length > 12 && (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-8 max-w-56 text-[13px]" />
      )}
      <CheckGrid items={shown} onChange={onChange} />
    </FacetShell>
  )
}

export function SearchPrefsView(props: PageProps) {
  const form = useMemo(
    () =>
      document.querySelector<HTMLFormElement>('#prefForm') ??
      document.querySelector<HTMLFormElement>('#mainBody form[method="post" i]'),
    []
  )
  const [, bump] = useReducer((x: number) => x + 1, 0)

  const facets = useMemo(() => {
    if (!form) return null
    return {
      cats: parseCategories(form),
      langs: collect(form, 'browse_lang[]', '.searchIn'),
      include: collect(form, 'def[categories][]', 'label.category'),
      exclude: collect(form, 'def[exclude_categories][]', 'label.category'),
    }
  }, [form])

  // FormMirror handles everything except the big multi-value groups (owning the
  // Save footer, which submits the whole form - facets included).
  const other = useMemo(() => {
    if (!form) return null
    const m = parseForm(form, document.querySelector('#mainBody h1'))
    return {
      ...m,
      rows: m.rows
        .map((r) => ({ ...r, controls: r.controls.filter((c) => !FACET_FIELDS.includes(c.name)) }))
        .filter((r) => r.kind === 'section' || r.controls.length > 0),
    }
  }, [form])

  if (!form || !facets || !other) return <LegacyView {...props} />

  return (
    <div className="grid gap-4">
      {facets.cats.length > 0 && <CategoryFacet groups={facets.cats} onChange={bump} />}
      {facets.langs.length > 0 && <SearchableFacet title="Search languages" note="Languages to include by default. Empty = all languages." items={facets.langs} onChange={bump} />}
      {facets.include.length > 0 && <SearchableFacet title="New search: default categories" note="Categories the WIP search includes by default." items={facets.include} onChange={bump} />}
      {facets.exclude.length > 0 && <SearchableFacet title="New search: excluded categories" note="Categories the WIP search hides by default." items={facets.exclude} onChange={bump} />}
      {other.rows.length > 0 && <FormMirrorView form={other} />}
    </div>
  )
}
