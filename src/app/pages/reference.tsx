import { useMemo, useState } from 'react'
import { Check, Copy, Search, Smile, Type } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { bbToHtml } from '@/components/bb-composer'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FilterSearch } from '@/components/filters'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

/** Copy-on-click with a short confirmation on the button itself. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  return {
    copied,
    copy(text: string, what: string) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(text)
          window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1400)
          toast.success(`${what} copied`)
        },
        () => toast.error('Could not copy to the clipboard.')
      )
    },
  }
}

/* ------------------------------- BB code tags ------------------------------- */

interface BbTag {
  name: string
  description: string
  syntax: string
  example: string
  remarks: string | null
}

function extractTags(doc: Document): BbTag[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const tags: BbTag[] = []
  for (const p of main.querySelectorAll('p.sub')) {
    const table = p.nextElementSibling
    if (!table || table.tagName !== 'TABLE') continue
    const row = (key: string) =>
      [...table.querySelectorAll('tr')]
        .map((tr) => [...tr.querySelectorAll('td')])
        .find((tds) => clean(tds[0]?.textContent).toLowerCase().startsWith(key))?.[1]
    tags.push({
      name: clean(p.textContent),
      description: clean(row('description')?.textContent),
      syntax: clean(row('syntax')?.textContent),
      example: clean(row('example')?.textContent),
      remarks: clean(row('remarks')?.textContent) || null,
    })
  }
  return tags.length ? tags : null
}

function TagCard({ tag, copy, copied }: { tag: BbTag; copy: (t: string, w: string) => void; copied: string | null }) {
  const isCopied = copied === tag.example
  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid gap-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold">{tag.name}</div>
            {tag.description && <p className="pt-0.5 text-[12.5px] leading-normal text-muted-foreground">{tag.description}</p>}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-[12px]"
            onClick={() => copy(tag.example || tag.syntax, tag.name)}
          >
            {isCopied ? <Check className="text-ok" /> : <Copy />} {isCopied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">You type</span>
            <code className="block rounded-md bg-muted px-2.5 py-2 font-mono text-[12px] [overflow-wrap:anywhere]">
              {tag.example || tag.syntax}
            </code>
          </div>
          <div className="grid gap-1">
            <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">You get</span>
            {/* Rendered with the same BBCode renderer as the composer preview,
             * so what you see here is exactly what the editor will show. */}
            <div
              className="rounded-md border px-2.5 py-2 text-[13px] [overflow-wrap:anywhere] [&_a]:text-brand [&_a]:underline [&_.quote]:rounded [&_.quote]:bg-muted [&_.quote]:px-2 [&_.quote]:py-1.5 [&_.quote>span]:mb-1 [&_.quote>span]:block [&_.quote>span]:text-[11.5px] [&_.quote>span]:font-semibold [&_.quote>span]:text-muted-foreground [&_img]:max-h-16 [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:bg-muted [&_pre]:p-1.5 [&_pre]:font-mono [&_pre]:text-[11.5px] [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: bbToHtml(tag.example || tag.syntax) }}
            />
          </div>
        </div>

        {tag.remarks && <p className="text-[11.5px] leading-normal text-muted-foreground">{tag.remarks}</p>}
      </CardContent>
    </Card>
  )
}

export function TagsView(props: PageProps) {
  const tags = useMemo(() => extractTags(document), [])
  const [q, setQ] = useState('')
  const { copy, copied } = useCopy()
  if (!tags) return <LegacyView {...props} />

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? tags.filter((t) => (t.name + ' ' + t.description + ' ' + t.syntax).toLowerCase().includes(needle))
    : tags

  return (
    <div className="grid gap-5">
      <PageHeader title="BB codes" sub={`${tags.length} tags you can use in posts, comments and messages`} />

      <FilterSearch value={q} onChange={setQ} placeholder="Search a tag, like bold or quote…" className="max-w-md" />

      {shown.length > 0 ? (
        // Columns, not a grid: cards differ in height and a grid leaves holes.
        <div className="gap-3 [column-fill:balance] lg:columns-2">
          {shown.map((t) => (
            <div key={t.name} className="mb-3 break-inside-avoid">
              <TagCard tag={t} copy={copy} copied={copied} />
            </div>
          ))}
        </div>
      ) : (
        <Card><CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Type /></EmptyMedia>
              <EmptyTitle>No tag matches “{q.trim()}”</EmptyTitle>
              <EmptyDescription>Try the effect you want, like colour, list or image.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent></Card>
      )}
    </div>
  )
}

/* --------------------------------- Smilies --------------------------------- */

interface Smilie { code: string; src: string }

function extractSmilies(doc: Document): Smilie[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const out: Smilie[] = []
  for (const tr of main.querySelectorAll('tr')) {
    const tds = [...tr.querySelectorAll('td')]
    const code = clean(tds[0]?.textContent)
    const src = tds[1]?.querySelector('img')?.getAttribute('src')
    if (code && src) out.push({ code, src })
  }
  return out.length ? out : null
}

export function SmiliesView(props: PageProps) {
  const smilies = useMemo(() => extractSmilies(document), [])
  const [q, setQ] = useState('')
  const { copy, copied } = useCopy()
  if (!smilies) return <LegacyView {...props} />

  const needle = q.trim().toLowerCase()
  const shown = needle ? smilies.filter((s) => s.code.toLowerCase().includes(needle)) : smilies

  return (
    <div className="grid gap-5">
      <PageHeader title="Smilies" sub={`${smilies.length} smilies. Click one to copy its code.`} />

      <FilterSearch value={q} onChange={setQ} placeholder="Search a smilie, like wave or party…" className="max-w-md" />
      {needle && <p className="-mt-2 text-[12.5px] text-muted-foreground">{shown.length} of {smilies.length} match</p>}

      {shown.length > 0 ? (
        <Card className="py-0">
          <CardContent className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5 py-5">
            {shown.map((s) => {
              const isCopied = copied === s.code
              return (
                <button
                  key={s.code + s.src}
                  onClick={() => copy(s.code, s.code)}
                  title={`Copy ${s.code}`}
                  className={cn(
                    'group grid justify-items-center gap-1.5 rounded-lg px-2 py-3 transition-colors',
                    isCopied ? 'bg-ok/15' : 'hover:bg-accent/60'
                  )}
                >
                  <img src={s.src} alt={s.code} loading="lazy" className="h-6 object-contain" />
                  <span className={cn('truncate font-mono text-[10.5px]', isCopied ? 'text-ok' : 'text-muted-foreground')}>
                    {isCopied ? 'copied' : s.code}
                  </span>
                </button>
              )
            })}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Smile /></EmptyMedia>
              <EmptyTitle>No smilie matches “{q.trim()}”</EmptyTitle>
              <EmptyDescription>Codes look like :wave: or :-), so try a word or a face.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent></Card>
      )}
    </div>
  )
}
