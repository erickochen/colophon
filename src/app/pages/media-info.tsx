import { useMemo, type ReactNode } from 'react'
import { AudioLines, Captions, ChevronLeft, FileAudio, FileText, Film, Info, ListTree } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { parseMediaTree, type MediaNode } from '@/lib/extract/torrent'
import { PageHeader } from '@/app/shell/bits'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/* --------------------------- value & label format -------------------------- */

const prettyLabel = (s: string) =>
  s.replace(/^@/, '').replace(/_/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase())

function humanBytes(n: number): string {
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${i ? n.toFixed(2) : n} ${u[i]}`
}

function humanDuration(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** Humanise the well-known numeric MediaInfo fields; leave anything else raw. */
function fmtValue(key: string, val: string): string {
  const k = key.toLowerCase().replace(/^@/, '')
  const num = Number(val)
  if (val === '' || Number.isNaN(num)) return val
  if (k.endsWith('filesize') || k.endsWith('streamsize')) return humanBytes(num)
  if (k === 'duration') return humanDuration(num)
  if (k.includes('bitrate') && !k.includes('mode')) return num >= 1e6 ? `${(num / 1e6).toFixed(1).replace(/\.0$/, '')} Mbps` : `${Math.round(num / 1000)} kbps`
  if (k === 'samplingrate') return `${(num / 1000).toString().replace(/\.0+$/, '')} kHz`
  if (k === 'framerate') return `${num} fps`
  if (k.endsWith('count')) return num.toLocaleString('en-US')
  return val
}

/* ------------------------------ normalization ------------------------------ */

interface Section { title: string; type: string; fields: { k: string; v: string; raw: string }[]; extra: MediaNode[] }

const leaf = (n: MediaNode) => n.children.length === 0 && n.value != null

function sectionFromTrack(t: MediaNode): Section {
  const typeNode = t.children.find((c) => c.label === '@type')
  const type = typeNode?.value ?? ''
  return {
    title: type || prettyLabel(t.label),
    type,
    fields: t.children
      .filter((c) => c !== typeNode && leaf(c))
      .map((c) => ({ k: prettyLabel(c.label), v: fmtValue(c.label, c.value!), raw: c.value! })),
    extra: t.children.filter((c) => c.children.length > 0),
  }
}

/** Fold the `media > track > N` tree into track sections and gather the rest
 * (tool metadata) into a footer line, so nothing on the page is dropped. */
function normalize(nodes: MediaNode[]): { sections: Section[]; meta: { k: string; v: string }[] } {
  const sections: Section[] = []
  const meta: { k: string; v: string }[] = []
  const collectLeaves = (n: MediaNode) => {
    for (const c of n.children) {
      if (leaf(c)) meta.push({ k: prettyLabel(c.label), v: c.value! })
      else collectLeaves(c)
    }
  }
  for (const node of nodes) {
    if (node.label === 'media') {
      for (const c of node.children) {
        if (c.label === 'track') for (const t of c.children) sections.push(sectionFromTrack(t))
        else if (!leaf(c)) sections.push(sectionFromTrack(c)) // media's @ref (leaf) is shown as the file line
      }
    } else if (node.label === 'track') {
      for (const t of node.children) sections.push(sectionFromTrack(t))
    } else if (leaf(node)) {
      meta.push({ k: prettyLabel(node.label), v: node.value! })
    } else {
      collectLeaves(node)
    }
  }
  return { sections, meta }
}

/* -------------------------------- rendering -------------------------------- */

function typeIcon(type: string) {
  const t = type.toLowerCase()
  if (t === 'audio') return AudioLines
  if (t === 'video') return Film
  if (t === 'general') return FileAudio
  if (t === 'text') return Captions
  if (t === 'menu') return ListTree
  return Info
}

function Field({ k, v, raw }: { k: string; v: string; raw: string }) {
  return (
    <div className="min-w-0">
      <div className="text-10-5 uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="pt-0.5 font-mono text-13 tabular-nums [overflow-wrap:anywhere]" title={raw !== v ? raw : undefined}>{v}</div>
    </div>
  )
}

function nodeText(n: MediaNode): string {
  return n.value ?? n.children.map(nodeText).join(' ')
}

function SectionCard({ s }: { s: Section }) {
  const Icon = typeIcon(s.type)
  const dense = s.fields.length > 16
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 !py-3.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft"><Icon className="size-4 text-accent-foreground" /></span>
        <CardTitle>{s.title}</CardTitle>
        {s.fields.length > 0 && <span className="ml-auto text-11 text-muted-foreground">{s.fields.length} fields</span>}
      </CardHeader>
      <CardContent className="px-6 py-4">
        {s.fields.length > 0 &&
          (dense ? (
            <div className="grid max-h-72 gap-x-6 gap-y-1.5 overflow-y-auto sm:grid-cols-2">
              {s.fields.map((f, i) => (
                <div key={f.k + i} className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 text-12-5">
                  <span className="text-muted-foreground">{f.k}</span>
                  <span className="font-mono tabular-nums [overflow-wrap:anywhere]" title={f.raw !== f.v ? f.raw : undefined}>{f.v}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {s.fields.map((f, i) => <Field key={f.k + i} {...f} />)}
            </div>
          ))}
        {s.extra.map((e, i) => (
          <div key={e.label + i} className={s.fields.length ? 'mt-4' : ''}>
            <div className="text-10-5 uppercase tracking-wide text-brand">{prettyLabel(e.label)}</div>
            <div className="mt-1 max-h-64 overflow-y-auto rounded-lg bg-muted/40 p-2.5">
              {e.children.map((c, j) => (
                <div key={c.label + j} className="grid grid-cols-[minmax(72px,auto)_1fr] gap-x-3 text-12 leading-relaxed">
                  <span className="text-muted-foreground">{prettyLabel(c.label)}</span>
                  <span className="font-mono [overflow-wrap:anywhere]">{nodeText(c) || '–'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Standalone full MediaInfo report (/t/m/<id>), styled to match the site. */
export function MediaInfoPageView(props: PageProps) {
  const data = useMemo(() => {
    const body = document.querySelector('#mainBody .blockBodyCon') ?? document.querySelector('.blockBodyCon')
    const nodes = parseMediaTree(body)
    return {
      ...normalize(nodes),
      title: document.querySelector('#mainBody h1')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      fileRef: nodes.find((n) => n.label === 'media')?.children.find((c) => c.label === '@ref')?.value ?? null,
      id: location.pathname.match(/\/t\/m\/(\d+)/)?.[1] ?? null,
    }
  }, [])
  if (!data.sections.length) {
    // MAM's standalone /t/m/<id> page returns "Invalid torrent to look for";
    // the full MediaInfo already renders inline on the torrent page.
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-5">
        <PageHeader title="Media info" sub={data.title ?? undefined} />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft">
              <Info className="size-5 text-accent-foreground" />
            </span>
            <div className="grid gap-1">
              <p className="font-display text-17">No media info to show here</p>
              <p className="text-13 leading-relaxed text-muted-foreground">
                The complete MediaInfo is listed inline on the torrent page.
              </p>
            </div>
            {data.id && (
              <a href={`/t/${data.id}`} className="inline-flex items-center gap-1 text-13 text-brand underline underline-offset-2">
                <ChevronLeft className="size-4" /> Back to the torrent
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <PageHeader title="Media info" sub={data.title ?? undefined} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-13">
        {data.id && (
          <a href={`/t/${data.id}`} className="inline-flex items-center gap-1 text-brand underline underline-offset-2">
            <ChevronLeft className="size-4" /> Back to the torrent
          </a>
        )}
        {data.fileRef && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <FileText className="size-3.5" /> <span className="font-mono text-12 [overflow-wrap:anywhere]">{data.fileRef}</span>
          </span>
        )}
      </div>

      <div className="grid gap-4">
        {data.sections.map((s, i) => <SectionCard key={s.title + i} s={s} />)}
      </div>

      {data.meta.length > 0 && (
        <p className="text-11-5 text-muted-foreground">
          {data.meta.map((m) => `${m.k}: ${m.v}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
