import { useMemo, useState } from 'react'
import { Rss } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { MAIN_CATS, LANGUAGES, CONTENT_FLAGS } from '@/lib/mam-facets'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { submitNative } from '@/lib/form-submit'
import {
  FacetMode, FacetOptions, FacetSection, FilterDateRange, FilterFacet, FilterHint, FilterRow,
  FilterSearch, FilterSegments, FilterSelect, toggleValue,
} from '@/components/filters'

const SRCH_FIELDS = [
  ['title', 'Title'], ['author', 'Author'], ['narrator', 'Narrator'], ['series', 'Series'],
  ['description', 'Description'], ['tags', 'Tags'], ['fileTypes', 'Filetype'], ['filenames', 'Filenames'],
] as const

/** Feed builder: our facet UI writes into the ORIGINAL getrss form, then submits it. */
export function RssView(props: PageProps) {
  const form = useMemo(() => document.querySelector<HTMLFormElement>('#mainBody form[action="/getrss.php"], #mainBody form#torSearch, #mainBody form[method="post" i]'), [])
  const [text, setText] = useState('')
  const [fields, setFields] = useState<string[]>(['title', 'author'])
  const [cats, setCats] = useState<number[]>([])
  const [langs, setLangs] = useState<number[]>([])
  const [sort, setSort] = useState('dateDesc')
  const [searchIn, setSearchIn] = useState('torrents')
  const [linkType, setLinkType] = useState('dl')
  const [perpage, setPerpage] = useState('20')
  const [flags, setFlags] = useState<number[]>([])
  const [flagsMode, setFlagsMode] = useState<0 | 1>(0)
  const [adv, setAdv] = useState<Record<string, string>>({})
  const unitOpts = useMemo(
    () => (form ? [...form.querySelectorAll<HTMLOptionElement>('select[name="tor[unit]"] option')].map((o) => ({ value: o.value, label: o.textContent?.trim() ?? '' })) : []),
    [form]
  )
  // getrss.php has its own sort + collection lists; read them off the real form so we never offer a value it ignores.
  const sortOpts = useMemo(
    () => (form ? [...form.querySelectorAll<HTMLOptionElement>('select[name="tor[sortType]"] option')].map((o) => ({ value: o.value, label: o.textContent?.trim() ?? '' })) : []),
    [form]
  )
  const searchInOpts = useMemo(
    () => (form ? [...form.querySelectorAll<HTMLOptionElement>('select[name="tor[searchIn]"] option')].map((o) => ({ value: o.value, label: o.textContent?.trim() ?? '' })) : []),
    [form]
  )
  if (!form) return <LegacyView {...props} />

  const advCount = Object.values(adv).filter((v) => v && v.trim()).length

  function save() {
    const f = form!
    const setVal = (sel: string, v: string) => {
      const el = f.querySelector<HTMLInputElement | HTMLSelectElement>(sel)
      if (el) el.value = v
    }
    setVal('input[name="tor[text]"]', text)
    for (const [key] of SRCH_FIELDS) {
      const cb = f.querySelector<HTMLInputElement>(`input[name="tor[srchIn][${key}]"]`)
      if (cb) cb.checked = fields.includes(key)
    }
    for (const cb of f.querySelectorAll<HTMLInputElement>('input[name="tor[cat][]"]')) {
      cb.checked = cats.includes(Number(cb.value))
    }
    for (const cb of f.querySelectorAll<HTMLInputElement>('input[name="tor[browse_lang][]"]')) {
      cb.checked = langs.includes(Number(cb.value))
    }
    // Content flags (hide vs show only), same fields as the browse filter.
    for (const cb of f.querySelectorAll<HTMLInputElement>('input[name="tor[browseFlags][]"]')) {
      cb.checked = flags.includes(Number(cb.value))
    }
    setVal('input[name="tor[browseFlagsHideVsShow]"], select[name="tor[browseFlagsHideVsShow]"]', String(flagsMode))
    // Advanced ranges write straight into the original named inputs.
    for (const [name, v] of Object.entries(adv)) setVal(`input[name="tor[${name}]"], select[name="tor[${name}]"]`, v)
    setVal('select[name="tor[sortType]"], input[name="tor[sortType]"]', sort)
    setVal('select[name="tor[searchIn]"]', searchIn)
    setVal('select[name="tor[linkType]"]', linkType)
    setVal('input[name="tor[perpage]"], select[name="tor[perpage]"]', perpage)
    toast.success('Saving feed…')
    submitNative(f)
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="RSS feed builder" sub="Define a filter once; your reader gets every new match" />
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-[13px]">Search text (optional)</Label>
            <FilterSearch value={text} onChange={setText} placeholder="e.g. an author or series you follow" className="max-w-md" />
            <FilterRow className="gap-1.5 pt-1">
              <FilterHint>in</FilterHint>
              <FilterSegments
                type="multiple"
                options={SRCH_FIELDS.map(([value, label]) => ({ value, label }))}
                value={fields}
                onChange={setFields}
              />
            </FilterRow>
          </div>

          <FilterRow>
            <FilterFacet label="Categories" count={cats.length} width="w-96">
              <FacetSection title="Categories">
                <div className="grid max-h-80 grid-cols-2 gap-x-3 overflow-y-auto">
                  {MAIN_CATS.map((m) => (
                    <div key={m.id} className="pb-1.5">
                      <div className="py-1 text-[11.5px] font-medium text-muted-foreground">{m.name}</div>
                      {m.cats.map((c) => (
                        <Label key={c.id} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                          <Checkbox checked={cats.includes(c.id)} onCheckedChange={() => setCats(toggleValue(cats, c.id))} />
                          {c.name}
                        </Label>
                      ))}
                    </div>
                  ))}
                </div>
              </FacetSection>
            </FilterFacet>

            <FilterFacet label="Languages" count={langs.length} width="w-64">
              <FacetOptions
                options={LANGUAGES.map((l) => ({ value: String(l.id), label: l.name }))}
                selected={langs.map(String)}
                onToggle={(v) => setLangs(toggleValue(langs, Number(v)))}
                onClear={() => setLangs([])}
                searchable
                searchPlaceholder="Filter languages…"
                emptyText="No language found."
              />
            </FilterFacet>

            <FilterFacet label="Flags" count={flags.length} width="w-72">
              <FacetMode
                value={String(flagsMode)}
                onChange={(v) => setFlagsMode(Number(v) as 0 | 1)}
                options={[{ value: '0', label: 'Hide these' }, { value: '1', label: 'Only these' }]}
                ariaLabel="Hide or show torrents carrying these flags"
              />
              <FacetSection title="Content flags">
                {CONTENT_FLAGS.map((fl) => (
                  <Label key={fl.bit} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                    <Checkbox checked={flags.includes(fl.bit)} onCheckedChange={() => setFlags(toggleValue(flags, fl.bit))} /> {fl.name}
                  </Label>
                ))}
              </FacetSection>
            </FilterFacet>

            <FilterFacet label="Advanced" count={advCount} width="w-80">
              <div className="grid gap-3 p-3">
                <div className="grid gap-1.5">
                  <Label className="text-[12px] text-muted-foreground">Uploaded between</Label>
                  <FilterDateRange
                    from={adv.startDate ?? ''}
                    to={adv.endDate ?? ''}
                    onChange={(startDate, endDate) => setAdv((a) => ({ ...a, startDate, endDate }))}
                    ariaLabel="Uploaded between"
                    placeholder="Any day"
                    className="w-full"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[12px] text-muted-foreground">Size</Label>
                  <div className="flex items-center gap-2">
                    <Input placeholder="min" value={adv.minSize ?? ''} onChange={(e) => setAdv((a) => ({ ...a, minSize: e.target.value }))} className="h-8 text-[12.5px]" />
                    <Input placeholder="max" value={adv.maxSize ?? ''} onChange={(e) => setAdv((a) => ({ ...a, maxSize: e.target.value }))} className="h-8 text-[12.5px]" />
                    {unitOpts.length > 0 && (
                      <Select value={adv.unit ?? unitOpts[0]?.value} onValueChange={(v) => setAdv((a) => ({ ...a, unit: v }))}>
                        <SelectTrigger size="sm" className="h-8 w-20 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{unitOpts.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                {([['Seeders', 'minSeeders', 'maxSeeders'], ['Leechers', 'minLeechers', 'maxLeechers'], ['Snatched', 'minSnatched', 'maxSnatched']] as const).map(([label, lo, hi]) => (
                  <div key={label} className="grid gap-1.5">
                    <Label className="text-[12px] text-muted-foreground">{label}</Label>
                    <div className="flex items-center gap-2">
                      <Input placeholder="min" value={adv[lo] ?? ''} onChange={(e) => setAdv((a) => ({ ...a, [lo]: e.target.value }))} className="h-8 text-[12.5px]" />
                      <Input placeholder="max" value={adv[hi] ?? ''} onChange={(e) => setAdv((a) => ({ ...a, [hi]: e.target.value }))} className="h-8 text-[12.5px]" />
                    </div>
                  </div>
                ))}
              </div>
            </FilterFacet>

            {searchInOpts.length > 0 && (
              <FilterSelect value={searchIn} onChange={setSearchIn} options={searchInOpts} ariaLabel="What the feed covers" />
            )}
            <FilterSelect value={sort} onChange={setSort} options={sortOpts} ariaLabel="Sort order" />
            <FilterSelect
              value={linkType}
              onChange={setLinkType}
              options={[
                { value: 'dl', label: 'Direct download links' },
                { value: 'web', label: 'Web page links' },
              ]}
              ariaLabel="Link type"
            />
            <FilterSelect
              value={perpage}
              onChange={setPerpage}
              options={['10', '20', '50', '100'].map((n) => ({ value: n, label: `${n} items` }))}
              ariaLabel="Items per feed"
            />
          </FilterRow>

          <div className="flex justify-end pt-3">
            <Button onClick={save}><Rss /> Save feed</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
