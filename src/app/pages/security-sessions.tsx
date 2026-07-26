import { useMemo, useReducer, useState } from 'react'
import { AlertTriangle, Globe, KeyRound, Laptop, LogOut, MonitorSmartphone, Plane, Plus, Server, Settings2, Trash2 } from 'lucide-react'
import { LegacyView } from '@/app/pages/legacy'
import type { PageProps } from '@/app/router'
import { relTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toast } from '@/components/ui/toast'

interface SessionAction { label: string; secact: string; el: HTMLInputElement }
interface Session {
  created: string | null
  ip: string | null
  browser: string | null
  ua: string | null
  os: string | null
  lastAccess: string | null
  lastIp: string | null
  note: string | null
  info: string[]
  actions: SessionAction[]
  isCurrent: boolean
  isApi: boolean
}
interface SecData {
  warning: string | null
  sessions: Session[]
  create: {
    ipEl: HTMLInputElement
    asnRadios: HTMLInputElement[]
    dynRadios: HTMLInputElement[]
    labelEl: HTMLTextAreaElement | null
    form: HTMLFormElement
    help: { ip: string | null; asn: string | null; dyn: string | null }
    introHtml: string | null
  } | null
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || null

function extract(doc: Document): SecData | null {
  const main = doc.querySelector('#mainBody')
  const table = main?.querySelector('table.sessions')
  if (!main || !table) return null

  const sessions: Session[] = []
  for (const tr of table.querySelectorAll('tr[data-ssid]')) {
    const tds = [...tr.querySelectorAll(':scope > td')]
    if (tds.length < 7) continue
    const actions: SessionAction[] = [...tr.querySelectorAll<HTMLInputElement>('input[data-secact]')].map((b) => ({
      label: b.value,
      secact: b.dataset.secact ?? '',
      el: b,
    }))
    const actionCell = tds[6]
    const note = clean(actionCell?.querySelector('.note')?.textContent?.replace(/Label\/note:/i, ''))
    const info = [...(actionCell?.querySelectorAll(':scope > div') ?? [])]
      .filter((d) => !d.querySelector('input') && !d.classList.contains('note'))
      .map((d) => clean(d.textContent))
      .filter((t): t is string => !!t)
    const browserTd = tds[2]
    sessions.push({
      created: clean(tds[0]?.textContent),
      ip: clean(tds[1]?.childNodes[0]?.textContent),
      browser: clean(browserTd?.textContent),
      ua: browserTd?.getAttribute('title') ?? null,
      os: clean(tds[3]?.textContent),
      lastAccess: clean(tds[4]?.textContent),
      lastIp: clean(tds[5]?.textContent),
      note,
      info,
      actions,
      isCurrent: actions.some((a) => a.secact === 'logout'),
      isApi: info.some((t) => /API/i.test(t)),
    })
  }

  const form = main.querySelector<HTMLFormElement>('#prefForm')
  const ipEl = form?.querySelector<HTMLInputElement>('input[name="ip"]') ?? null
  let create: SecData['create'] = null
  if (form && ipEl) {
    const radios = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)]
    // Help texts live in the third cell of each create-form row.
    const helpFor = (el: Element | null) => clean(el?.closest('tr')?.querySelector(':scope > td:last-child')?.textContent)
    const asnRadios = radios('asn')
    const dynRadios = radios('dynSeed')
    // Intro copy above the create table ("Create session for downloading…", VPN advice).
    const createCell = ipEl.closest('td.row1')
    let introHtml: string | null = null
    if (createCell) {
      const c = createCell.cloneNode(true) as HTMLElement
      c.querySelectorAll('table, input, textarea').forEach((e) => e.remove())
      introHtml = c.innerHTML
    }
    create = {
      ipEl,
      asnRadios,
      dynRadios,
      labelEl: form.querySelector<HTMLTextAreaElement>('textarea[name="label"]'),
      form,
      help: { ip: helpFor(ipEl), asn: helpFor(asnRadios[0] ?? null), dyn: helpFor(dynRadios[0] ?? null) },
      introHtml,
    }
  }

  return {
    warning: clean(main.querySelector('.error_red')?.textContent),
    sessions,
    create,
  }
}

function deviceIcon(s: Session) {
  if (s.isApi || /prowlarr|sonarr|radarr|curl|api/i.test(s.ua ?? '')) return Server
  if (/mobile|iphone|android/i.test(s.ua ?? '')) return MonitorSmartphone
  return Laptop
}

function actionIcon(secact: string) {
  switch (secact) {
    case 'logout': return <LogOut />
    case 'rs': return <Trash2 />
    case 'ait': return <Plane />
    case 'ms': return <Settings2 />
    case 'vsc': return <KeyRound />
    default: return <Settings2 />
  }
}

function SessionCard({ s }: { s: Session }) {
  const Icon = deviceIcon(s)
  return (
    <div className="flex items-start gap-3.5 px-6 py-4">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[14px] font-semibold" title={s.ua ?? undefined}>{s.browser}</span>
          {s.os && s.os !== 'unknown' && <span className="text-[12.5px] text-muted-foreground">on {s.os}</span>}
          {s.isCurrent && <Badge className="bg-ok/15 text-[10.5px] text-ok" variant="secondary">This session</Badge>}
          {s.isApi && <Badge variant="secondary" className="text-[10.5px]">API</Badge>}
          {s.info.filter((t) => !/^API/i.test(t)).map((t) => (
            <Badge key={t} variant="outline" className="text-[10.5px] text-muted-foreground">{t}</Badge>
          ))}
          {s.note && <Badge className="bg-brand-soft text-[10.5px] text-accent-foreground" variant="secondary">{s.note}</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 text-[12px] text-muted-foreground">
          {s.ip && <span className="flex items-center gap-1"><Globe className="size-3" /> {s.ip}</span>}
          {s.created && <span>Signed in {relTime(s.created)}</span>}
          {s.lastAccess && <span>Active {relTime(s.lastAccess)}</span>}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {s.actions.map((a) => (
            <Button
              key={a.secact + a.label}
              size="sm"
              variant="outline"
              className={'h-7 text-[12px] ' + (a.secact === 'rs' || a.secact === 'logout' ? 'text-destructive hover:text-destructive' : '')}
              onClick={() => a.el.click()}
            >
              {actionIcon(a.secact)} {a.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CreateSession({ c }: { c: NonNullable<SecData['create']> }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [ip, setIp] = useState('')
  const asnLocked = c.asnRadios.find((r) => r.value === 'yes')?.checked ?? false
  const dynOn = c.dynRadios.find((r) => r.value === 'yes')?.checked ?? false

  function submit() {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip.trim())) {
      toast.warning('Enter a valid IPv4 address first (like 10.2.3.4).')
      return
    }
    c.ipEl.value = ip.trim()
    c.form.requestSubmit()
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <CardTitle className="flex items-center gap-2"><Plus className="size-4" /> Create a session</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 px-6 py-5">
        <p className="text-[12.5px] leading-normal text-muted-foreground">
          Sessions let scripts and seedboxes download .torrent files or call API endpoints without your password.
          Seeing “Unrecognized Host/passkey”? Create a session here, then call the dynamic seedbox API with it to authorize the new IP.
        </p>

        <div className="grid gap-1.5">
          <Label className="text-[13px]">Initial IP address</Label>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.2.3.4" className="max-w-56 font-mono" />
          {c.help.ip && <p className="max-w-xl text-[11.5px] leading-normal text-muted-foreground">{c.help.ip}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-[13px]">Lock the session to</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={asnLocked ? 'yes' : 'no'}
            onValueChange={(v) => {
              if (!v) return
              for (const r of c.asnRadios) r.checked = r.value === v
              bump()
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="no" className="px-3 text-[12.5px]">This IP only</ToggleGroupItem>
            <ToggleGroupItem value="yes" className="px-3 text-[12.5px]">The whole provider (ASN)</ToggleGroupItem>
          </ToggleGroup>
          {c.help.asn && <p className="max-w-xl text-[11.5px] leading-normal text-muted-foreground">{c.help.asn}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label className="flex items-center justify-between gap-3 text-[13px]">
            Allow this session to set the dynamic seedbox IP
            <Switch
              checked={dynOn}
              onCheckedChange={(v) => {
                for (const r of c.dynRadios) r.checked = (r.value === 'yes') === (v === true)
                bump()
              }}
            />
          </Label>
          {c.help.dyn && <p className="max-w-xl text-[11.5px] leading-normal text-muted-foreground">{c.help.dyn}</p>}
        </div>

        {c.labelEl && (
          <div className="grid gap-1.5">
            <Label className="text-[13px]">Label / note <span className="font-normal text-muted-foreground">(optional, max 150)</span></Label>
            <Textarea
              defaultValue={c.labelEl.value}
              maxLength={150}
              placeholder="What is this session for? e.g. Seedbox at Hetzner"
              className="min-h-16 max-w-xl"
              onChange={(e) => { c.labelEl!.value = e.target.value }}
            />
          </div>
        )}

        <div>
          <Button onClick={submit}><Plus /> Create session</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SecuritySessions(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-4">
      {data.warning && (
        <div className="flex items-start gap-2.5 rounded-lg bg-warn/15 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>{data.warning}</span>
        </div>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle>
            Active sessions <span className="text-[12px] font-normal text-muted-foreground">{data.sessions.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {data.sessions.length > 0 ? (
            data.sessions.map((s, i) => <SessionCard key={i} s={s} />)
          ) : (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No sessions found.</p>
          )}
        </CardContent>
      </Card>

      {data.create && <CreateSession c={data.create} />}
    </div>
  )
}
