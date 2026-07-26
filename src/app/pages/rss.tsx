import { useMemo, useState } from 'react'
import { Rss } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { MAIN_CATS, LANGUAGES, CONTENT_FLAGS } from '@/lib/mam-facets'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { toast } from '@/components/ui/toast'

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

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
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
    f.submit()
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="RSS feed builder" sub="Define a filter once; your reader gets every new match" />
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-[13px]">Search text (optional)</Label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. an author or series you follow" className="max-w-md" />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="pr-1 text-[12px] text-muted-foreground">in</span>
              {SRCH_FIELDS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFields(toggle(fields, key))}
                  className={
                    'rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                    (fields.includes(key) ? 'border-transparent bg-brand-soft text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[12.5px]">
                  Categories {cats.length > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px]">{cats.length}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-96 w-96 overflow-y-auto p-3">
                {MAIN_CATS.map((m) => (
                  <div key={m.id} className="pb-2">
                    <div className="py-1 text-[11.5px] font-semibold text-muted-foreground">{m.name}</div>
                    <div className="grid grid-cols-2">
                      {m.cats.map((c) => (
                        <Label key={c.id} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                          <Checkbox checked={cats.includes(c.id)} onCheckedChange={() => setCats(toggle(cats, c.id))} />
                          {c.name}
                        </Label>
                      ))}
                    </div>
                  </div>
                ))}
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[12.5px]">
                  Languages {langs.length > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px]">{langs.length}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <Command>
                  <CommandInput placeholder="Filter languages…" />
                  <CommandList className="max-h-64">
                    <CommandEmpty>No language found.</CommandEmpty>
                    <CommandGroup>
                      {LANGUAGES.map((l) => (
                        <CommandItem key={l.id} value={l.name} onSelect={() => setLangs(toggle(langs, l.id))}>
                          <Checkbox checked={langs.includes(l.id)} className="pointer-events-none" /> {l.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[12.5px]">
                  Flags {flags.length > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px]">{flags.length}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3">
                <button
                  type="button"
                  className="mb-2 w-full rounded-md bg-muted/60 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted"
                  onClick={() => setFlagsMode(flagsMode === 0 ? 1 : 0)}
                >
                  {flagsMode === 0 ? 'Hiding torrents that contain' : 'Showing only torrents that contain'} · switch
                </button>
                {CONTENT_FLAGS.map((fl) => (
                  <Label key={fl.bit} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                    <Checkbox checked={flags.includes(fl.bit)} onCheckedChange={() => setFlags(toggle(flags, fl.bit))} /> {fl.name}
                  </Label>
                ))}
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[12.5px]">
                  Advanced {advCount > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px]">{advCount}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="grid w-80 gap-3 p-3">
                <div className="grid gap-1.5">
                  <Label className="text-[12px] text-muted-foreground">Uploaded between</Label>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={adv.startDate ?? ''} onChange={(e) => setAdv((a) => ({ ...a, startDate: e.target.value }))} className="h-8 text-[12.5px]" />
                    <span className="text-[12px] text-muted-foreground">to</span>
                    <Input type="date" value={adv.endDate ?? ''} onChange={(e) => setAdv((a) => ({ ...a, endDate: e.target.value }))} className="h-8 text-[12.5px]" />
                  </div>
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
              </PopoverContent>
            </Popover>

            {searchInOpts.length > 0 && (
              <Select value={searchIn} onValueChange={setSearchIn}>
                <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>{searchInOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            )}

            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>{sortOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>

            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dl">Direct download links</SelectItem>
                <SelectItem value="web">Web page links</SelectItem>
              </SelectContent>
            </Select>

            <Select value={perpage} onValueChange={setPerpage}>
              <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>{['10', '20', '50', '100'].map((n) => <SelectItem key={n} value={n}>{n} items</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-3">
            <Button onClick={save}><Rss /> Save feed</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
