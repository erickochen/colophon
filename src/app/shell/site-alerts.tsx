// MAM prints its site notices in a strip above the news ticker. The four polled
// counters have their own badges, so what lands here is the rest.
import { Bell, ChevronRight, Info, TriangleAlert } from 'lucide-react'
import type { SiteAlert } from '@/lib/extract/shell'
import { cn } from '@/lib/utils'

const TONE_ICON: Record<SiteAlert['tone'], typeof Info> = {
  urgent: TriangleAlert,
  info: Info,
  ok: Bell,
}

const TONE_STYLE: Record<SiteAlert['tone'], { box: string; icon: string }> = {
  urgent: { box: 'bg-destructive/12', icon: 'text-destructive' },
  info: { box: 'bg-brand-soft', icon: 'text-brand' },
  ok: { box: 'bg-ok/15', icon: 'text-ok' },
}

function AlertRow({ alert }: { alert: SiteAlert }) {
  const Icon = TONE_ICON[alert.tone]
  const tone = TONE_STYLE[alert.tone]
  const body = (
    <>
      <Icon className={cn('mt-px size-4 shrink-0', tone.icon)} />
      <span className="min-w-0 flex-1">{alert.text}</span>
      {alert.href && <ChevronRight className="mt-px size-4 shrink-0 text-muted-foreground" />}
    </>
  )
  const box = cn('flex items-start gap-2.5 rounded-lg px-4 py-3 text-[13px]', tone.box)
  if (!alert.href) return <div className={box}>{body}</div>
  return (
    <a
      href={alert.href}
      className={cn(
        box,
        'transition-colors hover:brightness-[0.97] dark:hover:brightness-110',
        'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none'
      )}
    >
      {body}
    </a>
  )
}

export function SiteAlerts({ alerts }: { alerts: SiteAlert[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-2 px-4 pt-6 sm:px-6 lg:px-8">
      {alerts.map((a) => (
        <AlertRow key={`${a.href ?? ''}|${a.text}`} alert={a} />
      ))}
    </div>
  )
}
