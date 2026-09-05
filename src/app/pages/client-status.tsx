import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, BookOpen, CheckCircle2, Globe, Radio, RefreshCcw, Server, ShieldCheck } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, protocolNote, protocolWord, RichHtml } from '@/app/shell/bits'
import type { ProtocolStatus } from '@/lib/extract/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

// MAM's LoadTest has no error branch, so nothing else ends a request that stays
// unanswered.
const TEST_TIMEOUT_MS = 30_000

type Family = 'IPv4' | 'IPv6'

// The column heads MAM writes above each client table. The IPv6 table has no
// mean announce column, so a row is read by its head rather than by position.
const COLUMNS = {
  ip: /ip address/i,
  agent: /^agent/i,
  torrents: /# tor/i,
  tls: /tls/i,
  connectable: /^connectable/i,
  tested: /last tested/i,
  test: /test connectivity/i,
  announce: /mean announce/i,
} as const
type ColumnKey = keyof typeof COLUMNS

interface Client {
  family: Family
  ip: string
  port: string | null
  agent: string | null
  torrents: string | null
  peersHref: string | null
  uptime: string | null
  tls: string | null
  connectable: string | null
  connectResponse: string | null
  connectDetail: string | null
  lastTested: string | null
  responseMs: string | null
  meanAnnounce: string | null
  testEl: HTMLAnchorElement | null
}

interface Address {
  label: string
  value: string
}

interface ClientData {
  addresses: Address[]
  clients: Client[]
  guideHref: string | null
  errorsHtml: string | null
  noErrors: boolean
}

const lines = (td: Element | null | undefined): string[] => {
  if (!td) return []
  const clone = td.cloneNode(true) as HTMLElement
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  return (clone.textContent ?? '').split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function columnIndex(table: Element): Partial<Record<ColumnKey, number>> {
  const index: Partial<Record<ColumnKey, number>> = {}
  table.querySelectorAll(':scope > thead td, :scope > thead th').forEach((td, i) => {
    const label = (td.textContent ?? '').replace(/\s+/g, ' ').trim()
    for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
      if (index[key] == null && COLUMNS[key].test(label)) index[key] = i
    }
  })
  return index
}

function extract(doc: Document): ClientData | null {
  const main = doc.querySelector('#mainBody')
  const tables = main ? [...main.querySelectorAll('table.main')] : []
  if (!main || tables.length === 0) return null

  // One table per address family, each in its own block. MAM names the IPv6
  // block in its heading; the address itself says the same.
  const clients: Client[] = []
  for (const table of tables) {
    const index = columnIndex(table)
    // A head without an address column is a shape this reader does not know,
    // so MAM's own page shows instead of an empty list.
    if (index.ip == null) return null
    const blockHead = table.closest('.blockCon')?.querySelector('h4')?.textContent ?? ''
    for (const tr of table.querySelectorAll(':scope > tr, :scope > tbody > tr')) {
      if (tr.closest('thead')) continue
      const tds = [...tr.querySelectorAll(':scope > td')]
      const cell = (key: ColumnKey) => {
        const i = index[key]
        return i == null ? null : (tds[i] ?? null)
      }
      const [ip, port] = lines(cell('ip'))
      if (!ip) continue
      const torL = cell('torrents')
      const conL = cell('connectable')
      const testedL = cell('tested')
      const torLines = lines(torL)
      const responseMs = testedL?.querySelector('.important')?.textContent?.trim() ?? null
      clients.push({
        family: /ipv6/i.test(blockHead) || ip.includes(':') ? 'IPv6' : 'IPv4',
        ip,
        port: port ?? null,
        agent: lines(cell('agent'))[0] ?? null,
        torrents: torL?.querySelector('a')?.textContent?.trim() ?? torLines[0] ?? null,
        peersHref: torL?.querySelector('a')?.getAttribute('href') ?? null,
        uptime: torLines[1] ?? null,
        tls: lines(cell('tls'))[0] ?? null,
        connectable: lines(conL)[0] ?? null,
        connectResponse: conL?.querySelector('.important')?.textContent?.trim() || null,
        connectDetail: conL?.querySelector('.important')?.getAttribute('title')?.trim() || null,
        lastTested: lines(testedL)[0] ?? null,
        // An untested row carries a zero here, which is no measurement.
        responseMs: responseMs && Number(responseMs) > 0 ? responseMs : null,
        meanAnnounce: lines(cell('announce'))[0] ?? null,
        testEl: cell('test')?.querySelector<HTMLAnchorElement>('a[href^="javascript:LoadTest"]') ?? null,
      })
    }
  }

  // The block the page opens with, one named address per line. Reading it as
  // lines keeps every family MAM lists there, IPv6 among them. The blocks nest,
  // so the one that holds nothing else is the addresses on their own.
  const infoDiv = [...main.querySelectorAll<HTMLElement>('div')].find(
    (d) => /(^|\s)IP:/.test(d.textContent ?? '') && !d.querySelector('div, table')
  )
  const addresses = lines(infoDiv)
    .map((line) => line.match(/^(.+?):\s*(\S.*)$/))
    .filter((m): m is RegExpMatchArray => m != null)
    .map((m) => ({ label: m[1].trim(), value: m[2].trim() }))

  const errBlock = main.querySelector('#errors')?.closest('.blockCon')
  return {
    addresses,
    clients,
    guideHref: main.querySelector<HTMLAnchorElement>('a[href*="/guides/"]')?.getAttribute('href') ?? null,
    errorsHtml: errBlock ? cleanHtml(errBlock.querySelector('.blockBodyCon')) : null,
    noErrors: /No recent errors/i.test(errBlock?.textContent ?? ''),
  }
}

// A break opportunity after each group, so an IPv6 address wraps between its
// groups (never inside a "::") while an IPv4 address stays whole where it fits.
function breakable(address: string): ReactNode {
  return address.split(':').map((part, i) => (i === 0 ? part : part ? <Fragment key={i}>:<wbr />{part}</Fragment> : ':'))
}

function Stat({ label, value, sub, href }: { label: string; value: ReactNode; sub?: string | null; href?: string | null }) {
  const inner = (
    <>
      <div className="text-10-5 uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="pt-0.5 font-mono text-13-5 font-medium wrap-break-word tabular-nums">{value ?? '–'}</div>
      {sub && <div className="text-11 text-muted-foreground">{sub}</div>}
    </>
  )
  return href ? <a href={href} className="rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50">{inner}</a> : <div className="px-1 py-0.5">{inner}</div>
}

type TestOutcome = { html: string; text: string } | { timedOut: true }

// MAM fills #testreturn twice: first a heading that names the signed token it
// posts, then the answer. Only the second one carries a result.
function testAnswer(el: HTMLElement): TestOutcome | null {
  const c = el.cloneNode(true) as HTMLElement
  for (const h of c.querySelectorAll('h1, h2, h3')) {
    if (/^\s*testing\b/i.test(h.textContent ?? '')) h.remove()
  }
  const html = cleanHtml(c)
  const text = (c.textContent ?? '').replace(/\s+/g, ' ').trim()
  return html && text ? { html, text } : null
}

const TEST_TONE = {
  ok: { box: 'bg-ok/15', icon: 'text-ok', Icon: CheckCircle2 },
  warn: { box: 'bg-warn/15', icon: 'text-warn', Icon: AlertTriangle },
  plain: { box: 'bg-muted', icon: 'text-muted-foreground', Icon: Activity },
} as const

/* The wording is MAM's, so a verdict only gets a color where it is plain. */
function testTone(text: string): keyof typeof TEST_TONE {
  if (/\b(?:not|un)\s*connectable\b|\binvalid\b|\berror|\bfail/i.test(text)) return 'warn'
  if (/\bconnectable\b/i.test(text)) return 'ok'
  return 'plain'
}

function TestOutcomeStrip({ outcome }: { outcome: TestOutcome }) {
  const tone = TEST_TONE['timedOut' in outcome ? 'warn' : testTone(outcome.text)]
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-4 py-3 text-13', tone.box)}>
      <tone.Icon className={cn('mt-0.5 size-4 shrink-0', tone.icon)} />
      {'timedOut' in outcome ? (
        <p className="leading-normal">The tracker did not answer. Test again to retry.</p>
      ) : (
        <RichHtml html={outcome.html} className="min-w-0 flex-1 text-13 leading-normal" />
      )}
    </div>
  )
}

function ClientCard({
  c,
  testing,
  busy,
  outcome,
  onTest,
}: {
  c: Client
  testing: boolean
  busy: boolean
  outcome: TestOutcome | undefined
  onTest: (el: HTMLAnchorElement) => void
}) {
  const ok = /accepts incoming/i.test(c.connectable ?? '') || /^connect$/i.test(c.connectResponse ?? '')
  return (
    <Card className="@container gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2.5 !py-3.5">
        <span className={cn('flex size-9 items-center justify-center rounded-lg', ok ? 'bg-ok/15' : 'bg-warn/15')}>
          <Server className={cn('size-4.5', ok ? 'text-ok' : 'text-warn')} />
        </span>
        {/* The basis keeps the title readable on a narrow card: the actions
            wrap under it instead of squeezing it. */}
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{c.agent ?? 'Torrent client'}</CardTitle>
            <Badge variant="outline" className="text-10-5">{c.family}</Badge>
          </div>
          <p className="pt-0.5 text-11-5 text-muted-foreground">{c.connectable}</p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <Badge variant="secondary" className={cn('text-10-5', ok ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')} title={c.connectDetail ?? undefined}>
            {c.connectResponse ?? (ok ? 'Connectable' : 'Unknown')}
          </Badge>
          {c.testEl && (
            <Button size="sm" variant="outline" className="h-7 text-12" disabled={busy} onClick={() => onTest(c.testEl!)}>
              {testing ? <><Spinner /> Testing…</> : <><RefreshCcw /> Test now</>}
            </Button>
          )}
        </div>
      </CardHeader>
      {/* Columns follow the card's own width, so a mono address keeps a column
          it fits in whether the sidebar is open or not. */}
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 @lg:grid-cols-3 @5xl:grid-cols-6">
        <Stat label="Address" value={breakable(c.ip)} sub={c.port ? `port ${c.port}` : null} />
        <Stat label="Seeding" value={c.torrents} sub="torrents" href={c.peersHref} />
        <Stat label="Uptime" value={c.uptime} />
        <Stat label="TLS" value={c.tls} />
        <Stat label="Last test" value={c.lastTested} sub={c.responseMs ? `${c.responseMs} ms` : null} />
        {c.meanAnnounce != null && <Stat label="Announce" value={c.meanAnnounce} sub="mean interval" />}
      </CardContent>
      {outcome && (
        <CardContent className="px-6 pb-4">
          <TestOutcomeStrip outcome={outcome} />
        </CardContent>
      )}
    </Card>
  )
}

/* Connectability per protocol, from the shell status. MAM's own menu calls
 * these "Client IPv4" plus "Client IPv6". That word separates them from the
 * address this browser reaches the site on. */
function ProtocolDot({ label, status }: { label: string; status: ProtocolStatus }) {
  const dot =
    status.connectable == null
      ? 'bg-transparent ring-1 ring-muted-foreground/50'
      : status.connectable
        ? 'bg-ok-fill ring-1 ring-foreground/20'
        : 'bg-transparent ring-2 ring-warn'
  return (
    <span className="flex items-center gap-1.5" title={protocolNote(status)}>
      <span className={'size-1.5 shrink-0 rounded-full ' + dot} />
      Client {label} {protocolWord(status)}
    </span>
  )
}

export function ClientStatusView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  // MAM shares one #testreturn block between every client, so one test runs at
  // a time and its answer belongs to the row that started it.
  const [testing, setTesting] = useState<number | null>(null)
  const [outcomes, setOutcomes] = useState<Record<number, TestOutcome>>({})
  const running = useRef<number | null>(null)

  const settle = useCallback((i: number, outcome: TestOutcome) => {
    running.current = null
    setOutcomes((prev) => ({ ...prev, [i]: outcome }))
    setTesting(null)
  }, [])

  // The block is watched from mount on, because MAM writes its answer a tenth
  // of a second after the click and an observer attached from an effect can
  // arrive later than that.
  useEffect(() => {
    const target = document.getElementById('testreturn')
    if (!target) return
    const obs = new MutationObserver(() => {
      const i = running.current
      if (i == null) return
      const answer = testAnswer(target)
      if (answer) settle(i, answer)
    })
    obs.observe(target, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [settle])

  useEffect(() => {
    if (testing == null) return
    const timer = window.setTimeout(() => settle(testing, { timedOut: true }), TEST_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [testing, settle])

  if (!data) return <LegacyView {...props} />

  function runTest(i: number, el: HTMLAnchorElement) {
    setOutcomes((prev) => {
      const next = { ...prev }
      delete next[i]
      return next
    })
    running.current = i
    setTesting(i)
    el.click()
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Client status"
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            How the tracker sees your torrent clients right now.
            <span className="flex items-center gap-3 text-12-5">
              <ProtocolDot label="IPv4" status={props.page.client.ipv4} />
              <ProtocolDot label="IPv6" status={props.page.client.ipv6} />
            </span>
          </span>
        }
        action={
          data.guideHref && (
            <Button asChild variant="outline" size="sm" className="h-8">
              <a href={data.guideHref}><BookOpen /> What does connectable mean?</a>
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {data.addresses.map((a) => {
          const Icon = /seedbox/i.test(a.label) ? Radio : Globe
          return (
            <Card key={a.label} className="py-4">
              <CardContent className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft"><Icon className="size-5 text-accent-foreground" /></span>
                <div className="min-w-0">
                  <div className="font-mono text-lg font-semibold wrap-break-word tabular-nums">{breakable(a.value)}</div>
                  <div className="text-11-5 text-muted-foreground">{/^ip$/i.test(a.label) ? 'Your IP' : a.label}</div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {data.clients.map((c, i) => (
        <ClientCard
          key={i}
          c={c}
          testing={testing === i}
          busy={testing != null}
          outcome={outcomes[i]}
          onTest={(el) => runTest(i, el)}
        />
      ))}
      {data.clients.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active clients announced to the tracker.</CardContent></Card>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Tracker errors</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          {data.noErrors || !data.errorsHtml ? (
            <p className="text-13 text-muted-foreground">No recent errors logged. Errors disappear 48 hours after they last occurred.</p>
          ) : (
            <RichHtml html={data.errorsHtml} className="text-13" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
