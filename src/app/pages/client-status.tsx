import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, BookOpen, Globe, Radio, RefreshCcw, Server, ShieldCheck } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

interface Client {
  ip: string | null
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

interface ClientData {
  ip: string | null
  seedbox: string | null
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

function extract(doc: Document): ClientData | null {
  const main = doc.querySelector('#mainBody')
  const table = main?.querySelector('table.main')
  if (!main || !table) return null

  const clients: Client[] = []
  for (const tr of table.querySelectorAll(':scope > tr, :scope > tbody > tr')) {
    const tds = [...tr.querySelectorAll(':scope > td')]
    if (tds.length < 8 || tr.closest('thead')) continue
    const [ipL, agentL, torL, tlsL, conL, testedL, testL, annL] = tds
    const [ip, port] = lines(ipL)
    const torLines = lines(torL)
    const conLines = lines(conL)
    const testedLines = lines(testedL)
    clients.push({
      ip: ip ?? null,
      port: port ?? null,
      agent: lines(agentL)[0] ?? null,
      torrents: torL?.querySelector('a')?.textContent?.trim() ?? torLines[0] ?? null,
      peersHref: torL?.querySelector('a')?.getAttribute('href') ?? null,
      uptime: torLines[1] ?? null,
      tls: lines(tlsL)[0] ?? null,
      connectable: conLines[0] ?? null,
      connectResponse: conL?.querySelector('.important')?.textContent?.trim() ?? null,
      connectDetail: conL?.querySelector('.important')?.getAttribute('title') ?? null,
      lastTested: testedLines[0] ?? null,
      responseMs: testedL?.querySelector('.important')?.textContent?.trim() ?? null,
      meanAnnounce: lines(annL)[0] ?? null,
      testEl: testL?.querySelector<HTMLAnchorElement>('a[href^="javascript:LoadTest"]') ?? null,
    })
  }

  const ips = (main.textContent ?? '').match(/IP:\s*([\d.]+)[\s\S]*?Seedbox IP:\s*([\d.]+)/)
  const errBlock = main.querySelector('#errors')?.closest('.blockCon')
  return {
    ip: ips?.[1] ?? null,
    seedbox: ips?.[2] ?? null,
    clients,
    guideHref: main.querySelector<HTMLAnchorElement>('a[href*="/guides/"]')?.getAttribute('href') ?? null,
    errorsHtml: errBlock ? cleanHtml(errBlock.querySelector('.blockBodyCon')) : null,
    noErrors: /No recent errors/i.test(errBlock?.textContent ?? ''),
  }
}

function Stat({ label, value, sub, href }: { label: string; value: ReactNode; sub?: string | null; href?: string | null }) {
  const inner = (
    <>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="pt-0.5 font-mono text-[13.5px] font-medium tabular-nums">{value ?? '–'}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </>
  )
  return href ? <a href={href} className="rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50">{inner}</a> : <div className="px-1 py-0.5">{inner}</div>
}

function ClientCard({ c, testing, onTest }: { c: Client; testing: boolean; onTest: (el: HTMLAnchorElement) => void }) {
  const ok = /accepts incoming/i.test(c.connectable ?? '') || /^connect$/i.test(c.connectResponse ?? '')
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2.5 !py-3.5">
        <span className={cn('flex size-9 items-center justify-center rounded-lg', ok ? 'bg-ok/15' : 'bg-warn/15')}>
          <Server className={cn('size-4.5', ok ? 'text-ok' : 'text-warn')} />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle>{c.agent ?? 'Torrent client'}</CardTitle>
          <p className="pt-0.5 text-[11.5px] text-muted-foreground">{c.connectable}</p>
        </div>
        <Badge variant="secondary" className={cn('text-[10.5px]', ok ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')} title={c.connectDetail ?? undefined}>
          {c.connectResponse ?? (ok ? 'Connectable' : 'Unknown')}
        </Badge>
        {c.testEl && (
          <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={testing} onClick={() => onTest(c.testEl!)}>
            <RefreshCcw className={testing ? 'animate-spin' : ''} /> Test now
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Address" value={c.ip} sub={c.port ? `port ${c.port}` : null} />
        <Stat label="Seeding" value={c.torrents} sub="torrents" href={c.peersHref} />
        <Stat label="Uptime" value={c.uptime} />
        <Stat label="TLS" value={c.tls} />
        <Stat label="Last test" value={c.lastTested} sub={c.responseMs ? `${c.responseMs} ms` : null} />
        <Stat label="Announce" value={c.meanAnnounce} sub="mean interval" />
      </CardContent>
    </Card>
  )
}

/* Sitewide connectability per protocol, from the shell status. */
function ProtocolDot({ label, state }: { label: string; state: boolean | null }) {
  const dot = state == null ? 'bg-muted-foreground/40' : state ? 'bg-ok' : 'bg-warn'
  const word = state == null ? 'unknown' : state ? 'connectable' : 'offline'
  return (
    <span className="flex items-center gap-1.5">
      <span className={'size-1.5 rounded-full ' + dot} />
      {label} {word}
    </span>
  )
}

export function ClientStatusView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    if (!testing) return
    const target = document.getElementById('testreturn')
    if (!target) return
    const obs = new MutationObserver(() => {
      const t = target.textContent?.trim()
      if (t) {
        setTestResult(t)
        setTesting(false)
      }
    })
    obs.observe(target, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [testing])

  if (!data) return <LegacyView {...props} />

  function runTest(el: HTMLAnchorElement) {
    setTestResult(null)
    setTesting(true)
    el.click()
    toast.info('Testing connectivity…')
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Client status"
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            How the tracker sees your torrent clients right now.
            <span className="flex items-center gap-3 text-[12.5px]">
              <ProtocolDot label="IPv4" state={props.page.client.ipv4} />
              <ProtocolDot label="IPv6" state={props.page.client.ipv6} />
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
        {[
          { label: 'Your IP', v: data.ip, Icon: Globe },
          { label: 'Seedbox IP', v: data.seedbox, Icon: Radio },
        ].filter((x) => x.v).map(({ label, v, Icon }) => (
          <Card key={label} className="py-4">
            <CardContent className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft"><Icon className="size-5 text-accent-foreground" /></span>
              <div>
                <div className="font-mono text-lg font-semibold tabular-nums">{v}</div>
                <div className="text-[11.5px] text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.clients.map((c, i) => <ClientCard key={i} c={c} testing={testing} onTest={runTest} />)}
      {data.clients.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active clients announced to the tracker.</CardContent></Card>
      )}

      {testResult && (
        <Card className="border-ok/40 py-4">
          <CardContent className="flex items-center gap-2 text-[13px]">
            <Badge className="bg-ok/15 text-ok" variant="secondary"><Activity className="size-3" /> Test result</Badge> {testResult}
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Tracker errors</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          {data.noErrors || !data.errorsHtml ? (
            <p className="text-[13px] text-muted-foreground">No recent errors logged. Errors disappear 48 hours after they last occurred.</p>
          ) : (
            <RichHtml html={data.errorsHtml} className="text-[13px]" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
