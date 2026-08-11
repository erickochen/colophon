import { useMemo, useReducer, useState, type ReactNode } from 'react'
import { AlertTriangle, Ticket } from 'lucide-react'
import { parseForm, type MirrorRow } from '@/lib/form-mirror'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { MirrorCards } from '@/app/shell/form-mirror-view'
import { MirrorSelect, PrefCard, SaveBar, SettingRow } from '@/app/pages/prefs-bits'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// MAM ships this tab as six named jQuery panels. They come back as real tabs,
// with one exception: the automatic-wedge rules spend FL wedges on their own
// and can block a download, so that panel is hoisted to a card above the tabs
// instead of sitting behind the last one.
interface Check { name: string; el: HTMLInputElement; img?: string }
interface CatGroup { id: string; name: string; cats: Check[] }

const PANEL_TABS = [
  { id: 'main', label: 'Main' },
  { id: 'home', label: 'Homepage' },
  { id: 'def', label: 'Search defaults' },
  { id: 'old', label: 'Browse categories' },
  { id: 'new', label: 'New search (WIP)' },
]

/** The six content-tag checkboxes beside the hide/show select. */
const TAG_FLAGS = ['crudeLang', 'violence', 'sSex', 'eSex', 'abridged', 'lgbt']

/** Fields with a bespoke rendering, kept out of the generic leftover cards. */
const BESPOKE_FIELDS = new Set([
  'cats[]', 'browse_lang[]',
  'def[mediaType][]', 'def[main_cat][]', 'def[sva]',
  'def[categories][]', 'def[exclude_categories][]',
  'quickSearch[searchIn][]', 'search[searchIn][]',
  'tagHideVsShow', ...TAG_FLAGS,
  'downloadWedge[requireWedge]', 'downloadWedge[requireWedgeRatio]',
  'downloadWedge[autoWedge]', 'downloadWedge[autoWedgeRatio]', 'downloadWedge[apply_gfl]',
])

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

/** url("/pic/flags/nl.svg") -> /pic/flags/nl.svg */
function bgUrl(el: HTMLElement | null | undefined): string | undefined {
  const m = el?.getAttribute('style')?.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/)
  return m?.[1] || undefined
}

function collect(form: HTMLElement, name: string, wrapSel: string): Check[] {
  return [...form.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`)]
    .map((el) => {
      const wrap = el.closest<HTMLElement>(wrapSel)
      const inner = wrap?.querySelector<HTMLElement>('div')
      return {
        el,
        name: clean(inner?.textContent ?? wrap?.textContent),
        img: inner?.querySelector('img')?.getAttribute('src') ?? bgUrl(inner),
      }
    })
    .filter((c) => c.name)
}

function parseCategories(form: HTMLElement): CatGroup[] {
  const groups: CatGroup[] = []
  for (const holder of form.querySelectorAll('.categoryHolder')) {
    const h4 = holder.querySelector('h4.torMainCatSel')
    const name = clean(h4?.querySelector('div')?.textContent ?? h4?.textContent)
    const cats: Check[] = []
    for (const a of holder.querySelectorAll('a.torCatSel')) {
      const el = a.querySelector<HTMLInputElement>('input[name="cats[]"]')
      const nm = clean(a.querySelector('div')?.textContent)
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
          {c.img && <img src={c.img} alt="" className="size-4 shrink-0 rounded-[3px] object-cover" />}
          <span className="min-w-0 truncate" title={c.name}>{c.name}</span>
        </label>
      ))}
    </div>
  )
}

/** Selectable chips, for short lists that deserve more presence than a grid of
 * checkboxes: media types with their icons, text-search fields. */
function ChipChecks({ items, onChange }: { items: Check[]; onChange: () => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c, i) => {
        const active = c.el.checked
        return (
          <button
            key={i}
            type="button"
            aria-pressed={active}
            onClick={() => { c.el.checked = !active; onChange() }}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] shadow-xs transition-colors',
              'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
              active ? 'bg-brand-soft text-accent-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {c.img && <img src={c.img} alt="" className="size-4 shrink-0" />}
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

/** Categories grouped by main category, each with a select-all. */
function CategoryFacet({
  title, note, groups, onChange,
}: { title: string; note?: string; groups: CatGroup[]; onChange: () => void }) {
  const all = groups.flatMap((g) => g.cats)
  const sel = all.filter((c) => c.el.checked).length
  return (
    <FacetShell
      title={title}
      note={note}
      count={sel} total={all.length}
      onClear={() => { all.forEach((c) => (c.el.checked = false)); onChange() }}
    >
      {groups.map((g) => {
        const s = g.cats.filter((c) => c.el.checked).length
        const state: boolean | 'indeterminate' = s === 0 ? false : s === g.cats.length ? true : 'indeterminate'
        return (
          <div key={g.id}>
            <label className="flex items-center gap-2 pb-2.5 text-[13.5px] font-medium">
              <Checkbox checked={state === true} indeterminate={state === 'indeterminate'} onCheckedChange={(v) => { g.cats.forEach((c) => (c.el.checked = v === true)); onChange() }} />
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
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-8 max-w-56 text-[12.5px]" />
      )}
      <CheckGrid items={shown} onChange={onChange} />
    </FacetShell>
  )
}

// --- automatic wedge rules -------------------------------------------------

interface WedgeData {
  requireSize: HTMLInputElement | null
  requireRatio: HTMLInputElement | null
  autoSize: HTMLInputElement | null
  autoRatio: HTMLInputElement | null
  gfl: HTMLInputElement | null
}

function wedgeFields(form: HTMLElement): WedgeData | null {
  const q = (n: string) => form.querySelector<HTMLInputElement>(`input[name="${CSS.escape(n)}"]`)
  const d: WedgeData = {
    requireSize: q('downloadWedge[requireWedge]'),
    requireRatio: q('downloadWedge[requireWedgeRatio]'),
    autoSize: q('downloadWedge[autoWedge]'),
    autoRatio: q('downloadWedge[autoWedgeRatio]'),
    gfl: q('downloadWedge[apply_gfl]'),
  }
  return d.requireSize || d.autoSize ? d : null
}

function WedgeInput({ el, suffix, label }: { el: HTMLInputElement; suffix?: string; label: string }) {
  const [v, setV] = useState(el.value)
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      {label}
      <Input
        type="number"
        min={0}
        step={1}
        value={v}
        onChange={(e) => { setV(e.target.value); el.value = e.target.value }}
        className="h-8 w-24 text-[12.5px]"
      />
      {suffix}
    </label>
  )
}

function WedgeRule({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div>
        <div className="text-[13.5px] font-medium leading-snug">{title}</div>
        <p className="pt-0.5 text-[12px] leading-normal text-muted-foreground">{note}</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
    </div>
  )
}

function WedgeCard({ w, onChange }: { w: WedgeData; onChange: () => void }) {
  return (
    <PrefCard
      title={<span className="flex items-center gap-2"><Ticket className="size-4" /> Automatic FL wedges</span>}
      note="A rule applies to a download when it matches either threshold. Empty fields do not apply."
    >
      <div className="flex items-start gap-2.5 rounded-lg bg-warn/15 px-4 py-3 text-[13px]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
        <p className="leading-normal">
          These rules spend your FL wedges on their own. The first one can even block a download.
          MAM marks the feature as in development: verify a wedge really applied.
        </p>
      </div>

      {w.requireSize && w.requireRatio && (
        <WedgeRule
          title="Require a wedge"
          note="Applies a wedge on its own. Out of wedges? The download is blocked."
        >
          <WedgeInput el={w.requireSize} label="Size above" suffix="MiB" />
          <WedgeInput el={w.requireRatio} label="Ratio would fall below" />
        </WedgeRule>
      )}

      {w.autoSize && w.autoRatio && (
        <WedgeRule
          title="Auto-apply a wedge"
          note="Applies a wedge on its own. Out of wedges? The download continues and counts against your ratio."
        >
          <WedgeInput el={w.autoSize} label="Size above" suffix="MiB" />
          <WedgeInput el={w.autoRatio} label="Ratio would fall below" />
        </WedgeRule>
      )}

      {w.gfl && (
        <SettingRow title="Also apply to global freeleech torrents" dense>
          <Switch
            defaultChecked={w.gfl.checked}
            onCheckedChange={(v) => { w.gfl!.checked = v === true; onChange() }}
          />
        </SettingRow>
      )}
    </PrefCard>
  )
}

// --- the view --------------------------------------------------------------

export function SearchPrefsView(props: PageProps) {
  const form = useMemo(
    () =>
      document.querySelector<HTMLFormElement>('#prefForm') ??
      document.querySelector<HTMLFormElement>('#mainBody form[method="post" i]'),
    []
  )
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [rev, setRev] = useState(0)

  const data = useMemo(() => {
    if (!form) return null
    const parsed = parseForm(form, document.querySelector('#mainBody h1'))

    // Generic leftovers per panel, so a field MAM adds later still shows up.
    const leftovers = new Map<string, MirrorRow[]>()
    for (const row of parsed.rows) {
      if (row.kind !== 'field') continue
      const first = row.controls[0]
      if (!first || row.controls.some((c) => BESPOKE_FIELDS.has(c.name))) continue
      const anchor = first.kind === 'radio' ? first.options[0]?.el : first.el
      const panel = anchor?.closest('.tabs > div[id]')?.id ?? 'main'
      const list = leftovers.get(panel) ?? []
      list.push(row)
      leftovers.set(panel, list)
    }

    return {
      form,
      leftovers,
      wedge: wedgeFields(form),
      cats: parseCategories(form),
      langs: collect(form, 'browse_lang[]', '.searchIn'),
      quickIn: collect(form, 'quickSearch[searchIn][]', 'td.searchIn'),
      fullIn: collect(form, 'search[searchIn][]', 'td.searchIn'),
      tagSelect: form.querySelector<HTMLSelectElement>('select[name="tagHideVsShow"]'),
      tagFlags: TAG_FLAGS.map((n) => {
        const el = form.querySelector<HTMLInputElement>(`input[name="${n}"]`)
        const label = clean(el?.id ? form.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '')
        return el && label ? { el, name: label } : null
      }).filter((f): f is Check => !!f),
      mediaTypes: collect(form, 'def[mediaType][]', 'label.mediaTypes'),
      mainCats: collect(form, 'def[main_cat][]', 'label.mainCategories'),
      sva: form.querySelector<HTMLSelectElement>('select[name="def[sva]"]'),
      include: collect(form, 'def[categories][]', 'label.category'),
      exclude: collect(form, 'def[exclude_categories][]', 'label.category'),
    }
  }, [form])

  if (!form || !data) return <LegacyView {...props} />

  const leftoverCards = (panel: string) => {
    const rows = data.leftovers.get(panel)
    if (!rows?.length) return null
    return <MirrorCards rows={rows} />
  }

  return (
    <div className="grid gap-4">
      <div key={rev} className="grid gap-4">
        {data.wedge && <WedgeCard w={data.wedge} onChange={bump} />}

        <Tabs defaultValue="main">
          <TabsList className="h-auto flex-wrap">
            {PANEL_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="main" className="grid gap-4 pt-1">
            {leftoverCards('main')}
          </TabsContent>

          <TabsContent value="home" className="grid gap-4 pt-1">
            {leftoverCards('home')}
          </TabsContent>

          <TabsContent value="def" className="grid gap-4 pt-1">
            {(data.quickIn.length > 0 || data.fullIn.length > 0) && (
              <PrefCard
                title="Text search looks in"
                note="What a search scans by default. Pick more fields on the search page any time."
              >
                {data.quickIn.length > 0 && (
                  <div className="grid gap-2">
                    <span className="text-[13px] font-medium leading-snug">Quick search</span>
                    <ChipChecks items={data.quickIn} onChange={bump} />
                  </div>
                )}
                {data.fullIn.length > 0 && (
                  <div className="grid gap-2">
                    <span className="text-[13px] font-medium leading-snug">Full search</span>
                    <ChipChecks items={data.fullIn} onChange={bump} />
                  </div>
                )}
              </PrefCard>
            )}
            {data.langs.length > 0 && (
              <SearchableFacet
                title="Search languages"
                note="Applies to search, not to browse. Empty means all languages."
                items={data.langs}
                onChange={bump}
              />
            )}
            {data.tagFlags.length > 0 && (
              <PrefCard title="Content tags" note="Applies to search, not to browse.">
                {data.tagSelect && (
                  <SettingRow title="Results carrying a checked tag are" dense>
                    <MirrorSelect el={data.tagSelect} onChange={bump} className="min-w-52" />
                  </SettingRow>
                )}
                <ChipChecks items={data.tagFlags} onChange={bump} />
              </PrefCard>
            )}
            {leftoverCards('def')}
          </TabsContent>

          <TabsContent value="old" className="grid gap-4 pt-1">
            {data.cats.length > 0 && (
              <CategoryFacet
                title="Default search and browse categories"
                note="The categories browse opens with. Nothing selected means all of them."
                groups={data.cats}
                onChange={bump}
              />
            )}
            {leftoverCards('old')}
          </TabsContent>

          <TabsContent value="new" className="grid gap-4 pt-1">
            {data.mediaTypes.length > 0 && (
              <PrefCard title="Media types" note="What the new search includes by default. Empty means all of them.">
                <ChipChecks items={data.mediaTypes} onChange={bump} />
                {data.mainCats.length > 0 && (
                  <div className="grid gap-2 pt-1">
                    <span className="text-[13px] font-medium leading-snug">Fiction or nonfiction</span>
                    <ChipChecks items={data.mainCats} onChange={bump} />
                  </div>
                )}
              </PrefCard>
            )}
            {data.include.length > 0 && (
              <SearchableFacet
                title="Default categories"
                note="Categories the new search includes by default."
                items={data.include}
                onChange={bump}
              />
            )}
            {data.sva && (
              <PrefCard title="Category matching">
                <SettingRow title="Show a result when it contains" dense>
                  <MirrorSelect el={data.sva} onChange={bump} className="min-w-56" />
                </SettingRow>
              </PrefCard>
            )}
            {data.exclude.length > 0 && (
              <SearchableFacet
                title="Excluded categories"
                note="Categories the new search hides by default."
                items={data.exclude}
                onChange={bump}
              />
            )}
            {leftoverCards('new')}
          </TabsContent>
        </Tabs>
      </div>

      <SaveBar form={form} onAfterRevert={() => setRev((r) => r + 1)} />
    </div>
  )
}
