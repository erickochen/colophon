import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, BookImage, BookOpen, Headphones, Loader2, Music, Newspaper, Radio, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PageProps } from '@/app/router'
import { extractFreeleech, type FlItem } from '@/lib/extract/freeleech'
import { coverShape } from '@/lib/cover-shape'
import { coverThumbUrl } from '@/lib/mam-api'
import { useCollapsed } from '@/lib/collapsed'
import { useFeature } from '@/lib/settings'
import { cachedSnatchIndex, loadSnatchIndex, type SnatchIndex } from '@/lib/snatch-index'
import { pileBadge, readPile } from '@/lib/snatch-status'
import { Book } from '@/components/book'
import { CollapsibleSection } from '@/components/section'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { SnatchBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  FacetOptions,
  FilterBar,
  FilterFacet,
  FilterRow,
  FilterSaved,
  FilterSavedActions,
  FilterSearch,
  FilterSegments,
  FilterSelect,
  FilterSummary,
  QUIET_LINK,
  toggleValue,
  useSavedViews,
  type FacetOption,
  type FilterChip,
} from '@/components/filters'

const FREELEECH_PAGE = 'freeleech'

const MEDIA_ICONS: Record<string, ReactNode> = {
  '1': <Headphones className="size-4" />,
  '2': <BookOpen className="size-4" />,
  '3': <Music className="size-4" />,
  '4': <Radio className="size-4" />,
  '5': <BookImage className="size-4" />,
  '6': <BookImage className="size-4" />,
  '7': <Newspaper className="size-4" />,
  '8': <AudioLines className="size-4" />,
}

const GROUP_BY: FacetOption[] = [
  { value: 'media', label: 'By media type' },
  { value: 'category', label: 'By category' },
]

/** Which picks to show, measured against your own snatches. */
type Owned = 'all' | 'new' | 'have'

interface Section {
  key: string
  label: string
  icon: ReactNode
  items: FlItem[]
}

export function FreeleechView(props: PageProps) {
  const data = useMemo(() => extractFreeleech(document), [])
  const [q, setQ] = useState('')
  const [mainCat, setMainCat] = useState('all')
  const [media, setMedia] = useState<string[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState(GROUP_BY[0].value)
  const [owned, setOwned] = useState<Owned>('all')
  const [checkOn] = useFeature('snatchCheck')
  // A warm cache paints the badges in the first frame; a cold one arrives while
  // the list is already readable.
  const [index, setIndex] = useState<SnatchIndex | null>(() => (checkOn ? cachedSnatchIndex() : null))
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const fold = useCollapsed('freeleech')
  // While a filter runs, every matching section opens: folds made now are
  // temporary so the reader's own layout returns once the filter clears.
  const [tempClosed, setTempClosed] = useState<string[]>([])

  const groups = data?.groups ?? []
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

  // Fiction and Non-Fiction spelling follows the section headings MAM renders.
  const mainCatOptions = useMemo<FacetOption[]>(() => {
    const seen = new Map<string, string>()
    for (const g of groups) if (g.mainCatId !== '0' && g.mainCat) seen.set(g.mainCatId, g.mainCat)
    return [
      { value: 'all', label: 'All' },
      ...[...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, label]) => ({ value, label })),
    ]
  }, [groups])

  const mediaOptions = useMemo(() => {
    const seen = new Map<string, FacetOption>()
    for (const g of groups) {
      if (!g.mediaTypeId) continue
      const hit = seen.get(g.mediaTypeId)
      if (hit) hit.count = (hit.count ?? 0) + g.items.length
      else seen.set(g.mediaTypeId, { value: g.mediaTypeId, label: g.mediaType, count: g.items.length })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [groups])

  const catOptions = useMemo(() => {
    const seen = new Map<string, FacetOption>()
    for (const i of allItems) {
      for (const c of i.cats) {
        if (!c.id) continue
        const hit = seen.get(c.id)
        if (hit) hit.count = (hit.count ?? 0) + 1
        else seen.set(c.id, { value: c.id, label: c.name, count: 1 })
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [allItems])

  const needle = q.trim().toLowerCase()
  const have = index?.have ?? null
  const owns = (tid: string) => have?.has(Number(tid)) ?? false
  // The reject handler runs outside this render, so it reads the map from here.
  const haveRef = useRef(have)
  haveRef.current = have
  // The split only counts as filtering while it can answer, so a choice that
  // narrows nothing leaves the reader's own folds alone.
  const filtering =
    needle.length > 0 || mainCat !== 'all' || media.length > 0 || cats.length > 0 || (owned !== 'all' && !!have)

  useEffect(() => {
    if (!filtering && tempClosed.length > 0) setTempClosed([])
  }, [filtering, tempClosed.length])

  useEffect(() => {
    if (!checkOn) return
    let live = true
    setChecking(true)
    setCheckFailed(false)
    void loadSnatchIndex().then(
      (next) => {
        if (!live) return
        setIndex(next)
        setChecking(false)
      },
      () => {
        if (!live) return
        setCheckFailed(true)
        setChecking(false)
        // Only where nothing can answer the split: a cached map still can, so
        // taking the choice away there would throw away a working filter.
        if (!haveRef.current) setOwned('all')
      }
    )
    return () => {
      live = false
    }
  }, [checkOn, attempt])

  const matches = useMemo(() => {
    const keep = (i: FlItem) =>
      (mainCat === 'all' || i.mainCatId === mainCat) &&
      (media.length === 0 || media.includes(i.mediaTypeId)) &&
      (cats.length === 0 || i.cats.some((c) => c.id && cats.includes(c.id))) &&
      // Without an index the split cannot answer, so it filters nothing rather
      // than emptying the list. A saved view plus the switch off both land here.
      (owned === 'all' || !have || (owned === 'have' ? owns(i.tid) : !owns(i.tid))) &&
      (needle.length === 0 ||
        `${i.title} ${i.author ?? ''} ${i.cats.map((c) => c.name).join(' ')} ${i.language ?? ''}`
          .toLowerCase()
          .includes(needle))
    return allItems.filter(keep)
  }, [allItems, mainCat, media, cats, needle, owned, have])

  const sections = useMemo<Section[]>(() => {
    const kept = new Set(matches.map((i) => i.tid))
    if (groupBy === 'media') {
      return groups
        .map((g) => ({
          key: g.key,
          label: g.label,
          icon: MEDIA_ICONS[g.mediaTypeId] ?? <BookOpen className="size-4" />,
          items: g.items.filter((i) => kept.has(i.tid)),
        }))
        .filter((s) => s.items.length > 0)
    }
    const byCat = new Map<string, Section>()
    for (const i of matches) {
      const list = i.cats.length > 0 ? i.cats : [{ id: 'none', name: 'No category' }]
      // With categories picked, a book only opens the sections it was picked
      // for. Its other genres are not what the reader asked to see.
      const shown = cats.length > 0 ? list.filter((c) => c.id && cats.includes(c.id)) : list
      for (const c of shown) {
        const key = `cat-${c.id ?? c.name}`
        const hit = byCat.get(key)
        if (hit) hit.items.push(i)
        else byCat.set(key, { key, label: c.name, icon: <Tag className="size-4" />, items: [i] })
      }
    }
    return [...byCat.values()]
      .map((s) => ({ ...s, items: [...s.items].sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [groupBy, groups, matches, cats])

  const isOpen = (key: string) => (filtering ? !tempClosed.includes(key) : fold.isOpen(key))
  const setOpen = (key: string, open: boolean) => {
    if (filtering) setTempClosed((prev) => (open ? prev.filter((k) => k !== key) : [...prev, key]))
    else fold.setOpen(key, open)
  }
  const allOpen = sections.every((s) => isOpen(s.key))
  const toggleAll = () => {
    if (filtering) setTempClosed(allOpen ? sections.map((s) => s.key) : [])
    else if (allOpen) fold.closeAll(sections.map((s) => s.key))
    else fold.openAll()
  }

  const chips: FilterChip[] = [
    ...(mainCat !== 'all'
      ? [{ key: 'main', label: mainCatOptions.find((m) => m.value === mainCat)?.label ?? mainCat, onRemove: () => setMainCat('all') }]
      : []),
    ...media.map((m) => ({
      key: `m${m}`,
      label: mediaOptions.find((o) => o.value === m)?.label ?? m,
      onRemove: () => setMedia((prev) => toggleValue(prev, m)),
    })),
    ...cats.map((c) => ({
      key: `c${c}`,
      label: catOptions.find((o) => o.value === c)?.label ?? c,
      onRemove: () => setCats((prev) => toggleValue(prev, c)),
    })),
    ...(owned !== 'all'
      ? [{ key: 'owned', label: owned === 'have' ? 'Already have' : 'New to me', onRemove: () => setOwned('all') }]
      : []),
  ]
  const clearAll = () => {
    setMainCat('all')
    setMedia([])
    setCats([])
    setOwned('all')
    setQ('')
  }

  const savedName = [q.trim(), ...chips.map((c) => c.label)].filter(Boolean).join(' · ')
  const views = useSavedViews({
    page: FREELEECH_PAGE,
    state: { q, mainCat, media, cats, groupBy, owned },
    name: savedName,
    filtered: savedName.length > 0,
    onApply: (saved) => {
      if (typeof saved.q === 'string') setQ(saved.q)
      if (typeof saved.mainCat === 'string') setMainCat(saved.mainCat)
      if (Array.isArray(saved.media)) setMedia(saved.media.filter((v): v is string => typeof v === 'string'))
      if (Array.isArray(saved.cats)) setCats(saved.cats.filter((v): v is string => typeof v === 'string'))
      if (GROUP_BY.some((o) => o.value === saved.groupBy)) setGroupBy(saved.groupBy as string)
      if (saved.owned === 'all' || saved.owned === 'new' || saved.owned === 'have') setOwned(saved.owned)
    },
    // The grouping rides along in a set, so it comes back with the rest.
    onClear: () => {
      clearAll()
      setGroupBy(GROUP_BY[0].value)
    },
  })

  if (!data) return <LegacyView {...props} />

  const total = allItems.length
  const ownedCount = have ? allItems.filter((i) => owns(i.tid)).length : 0
  const ownership: FacetOption[] = [
    { value: 'all', label: 'All' },
    { value: 'new', label: 'New to me', count: have ? total - ownedCount : undefined },
    { value: 'have', label: 'Already have', count: have ? ownedCount : undefined },
  ]
  const period = data.periods.find((p) => p.selected)?.value ?? data.periods[0]?.value
  // Grouping by genre files a book under each genre it carries, so the sections
  // together can hold more rows than there are books. Only that grouping can,
  // which is what the line below says out loud.
  const placements = groupBy === 'category' ? sections.reduce((n, s) => n + s.items.length, 0) : matches.length

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Freeleech picks"
        sub={data.heading ?? undefined}
        action={
          data.periods.length > 0 && (
            <FilterSelect
              value={period ?? ''}
              onChange={(v) => location.assign(`/freeleech.php?past=${v}`)}
              options={data.periods.map((p) => ({ value: p.value, label: p.label }))}
              align="end"
              ariaLabel="Freeleech period"
            />
          )
        }
      />
      {data.seedNote && <p className="text-[12.5px] text-muted-foreground">{data.seedNote}</p>}
      {checkFailed && (
        <p className="text-[12.5px] text-muted-foreground">
          {have
            ? 'Could not refresh your snatch list, so these marks are the ones from last time.'
            : 'Could not read your snatch list, so the picks you already have are not marked.'}{' '}
          <Button variant="link" className={QUIET_LINK} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </p>
      )}

      <FilterBar>
        <FilterSaved views={views} />
        <FilterSearch value={q} onChange={setQ} placeholder={`Filter ${total.toLocaleString()} picks by title, author or category…`} />
        <FilterRow>
          <FilterSegments ariaLabel="Fiction or non-fiction" options={mainCatOptions} value={mainCat} onChange={setMainCat} />
          {/* Only once the index is in: without it every pick would read as new,
              so the split would answer with a number it cannot know. */}
          {checkOn && have && (
            <FilterSegments
              ariaLabel="Picks you already have"
              options={ownership}
              value={owned}
              onChange={(v) => setOwned(v as Owned)}
            />
          )}
          {checking && (
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Checking your snatches
            </span>
          )}
          <FilterFacet label="Media types" count={media.length}>
            <FacetOptions
              options={mediaOptions}
              selected={media}
              onToggle={(v) => setMedia((prev) => toggleValue(prev, v))}
              onClear={() => setMedia([])}
              emptyText="No media types in this period."
            />
          </FilterFacet>
          <FilterFacet label="Categories" count={cats.length} width="w-80">
            <FacetOptions
              options={catOptions}
              selected={cats}
              onToggle={(v) => setCats((prev) => toggleValue(prev, v))}
              onClear={() => setCats([])}
              searchable
              searchPlaceholder="Filter categories…"
              emptyText="No category found."
            />
          </FilterFacet>
          <FilterSelect value={groupBy} onChange={setGroupBy} options={GROUP_BY} ariaLabel="Group picks by" />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 text-[12.5px]" onClick={toggleAll}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </Button>
            {data.searchHref && (
              <Button variant="ghost" size="sm" className="h-8 text-[12.5px]" asChild>
                <a href={data.searchHref}>Open in search</a>
              </Button>
            )}
          </div>
        </FilterRow>
      </FilterBar>

      <FilterSummary chips={chips} onClearAll={clearAll} actions={views.hasActions ? <FilterSavedActions views={views} /> : undefined} />

      {sections.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nothing matches. Loosen a filter or{' '}
          <Button variant="link" onClick={clearAll} className="h-auto p-0 text-brand">
            clear them all
          </Button>
          .
        </p>
      )}

      {sections.length > 0 && (
      <Card className="gap-0 divide-y overflow-hidden py-0">
      {/* The count sits on the list it counts, the same head the other lists use. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-muted/25 px-6 py-2">
        {/* Filtering never reloads, so the count is what reports the outcome. */}
        <span role="status" className="text-[12.5px] tabular-nums text-muted-foreground">
          {filtering
            ? `${matches.length.toLocaleString()} of ${total.toLocaleString()} picks`
            : `${total.toLocaleString()} picks in ${sections.length} ${sections.length === 1 ? 'group' : 'groups'}`}
        </span>
        {placements > matches.length && (
          <span className="text-[12px] text-muted-foreground">A book with more than one genre sits under each of them.</span>
        )}
        {index?.partial && (
          <span className="text-[12px] text-muted-foreground">Your snatch list is long, so its tail is unchecked.</span>
        )}
      </div>
      {sections.map((s) => (
        <CollapsibleSection
          key={s.key}
          title={s.label}
          icon={s.icon}
          count={s.items.length}
          open={isOpen(s.key)}
          onOpenChange={(open) => setOpen(s.key, open)}
        >
          {/* Explicit column counts keep every track at minmax(0,1fr), which is
              what lets the titles truncate. */}
          <div className="grid grid-cols-1 items-start gap-x-6 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
            {s.items.map((i) => (
              <a key={i.tid} href={`/t/${i.tid}`} className="group flex min-w-0 items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50">
                {/* The thumbnail is six times this slot, so the small path beats
                    pulling a thousand originals for one page. */}
                <Book poster={coverThumbUrl(Number(i.tid))} title={i.title} shape={coverShape({ mediatype: i.mediaTypeId })} size="mini" plain className="w-12 shrink-0" />
                <span className="min-w-0">
                  <span className="font-display block truncate text-[13px] font-medium group-hover:underline">{i.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {i.author && <span className="truncate text-[11.5px] text-muted-foreground">{i.author}</span>}
                    {(() => {
                      const pile = have?.get(Number(i.tid))
                      if (!pile) return null
                      const read = pileBadge(readPile(pile))
                      return <SnatchBadge text={read.text} tone={read.tone} title={pile} dense />
                    })()}
                    {i.language && <Badge variant="outline" className="h-4 px-1 text-[9.5px]">{i.language}</Badge>}
                    {i.cats.slice(0, 2).map((c) => (
                      <Badge key={c.name} variant="secondary" className="h-4 px-1 text-[9.5px] font-normal">{c.name}</Badge>
                    ))}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </CollapsibleSection>
      ))}
      </Card>
      )}
    </div>
  )
}
