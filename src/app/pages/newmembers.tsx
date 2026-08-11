import { useMemo, useRef, useState } from 'react'
import { Gift, Mail, UserPlus } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { fmtInt, initials } from '@/lib/format'
import { giftPoints, MIN_GIFT } from '@/lib/mam-api'
import { applyPointsUpdate, useLiveBonus } from '@/lib/bonus'
import { syncPanelBalance, useGiftedSet } from '@/lib/giftmam'
import { readDefaultAmount, resolveAmount, useFeature, useGiftedMembers } from '@/lib/settings'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FilterSearch } from '@/components/filters'
import { toast } from '@/components/ui/toast'
import { mutedUserColor } from '@/lib/colors'

interface Member { uid: string; name: string; color: string | null; href: string }

// MAM+ bounds for gifting on this page.
const BULK_GIFT_MIN = MIN_GIFT
const BULK_GIFT_MAX = 100
const BULK_GIFT_DEFAULT = 100
// The pace MAM+ uses to stay polite to the server.
const GIFT_THROTTLE_MS = 3000
// Three failures in a row means the run cannot succeed, whatever the reason.
const FAIL_STREAK_LIMIT = 3

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

function extract(doc: Document): Member[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const members = [...main.querySelectorAll<HTMLInputElement>('input[name="sendGiftTo[]"]')].map((cb) => {
    const label = cb.closest('label')
    const a = label?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const span = a?.querySelector<HTMLElement>('span')
    return {
      uid: cb.value,
      name: (span?.textContent ?? a?.textContent ?? '').trim(),
      color: span?.style.color || null,
      href: a?.getAttribute('href') ?? `/u/${cb.value}`,
    }
  }).filter((m) => m.name)
  return members.length ? members : null
}

const toNumber = (value: string | null) => {
  if (!value) return null
  const num = Number(value.replace(/,/g, ''))
  return Number.isNaN(num) ? null : num
}

interface RunState {
  done: number
  failed: number
  total: number
}

export function NewMembersView(props: PageProps) {
  const members = useMemo(() => extract(document), [])
  const [q, setQ] = useState('')
  const gifted = useGiftedSet()
  const marks = useGiftedMembers()
  const [bulkOn] = useFeature('giftNewest')
  const bonus = useLiveBonus(props.page.stats.bonus)
  const [amount, setAmount] = useState(() =>
    String(resolveAmount(readDefaultAmount('gift'), BULK_GIFT_MIN, BULK_GIFT_MAX) ?? BULK_GIFT_DEFAULT)
  )
  const [confirming, setConfirming] = useState(false)
  const [run, setRun] = useState<RunState | null>(null)
  const stopRef = useRef(false)
  if (!members) return <LegacyView {...props} />

  const isGifted = (uid: string) => gifted.has(uid) || marks.has(uid)

  const needle = q.trim().toLowerCase()
  const shown = needle ? members.filter((m) => m.name.toLowerCase().includes(needle)) : members
  const targets = shown.filter((m) => !isGifted(m.uid))

  const points = Number(amount)
  const amountValid = Number.isInteger(points) && points >= BULK_GIFT_MIN && points <= BULK_GIFT_MAX
  const total = amountValid ? targets.length * points : 0
  const balance = toNumber(bonus)
  const short = balance != null && total > balance

  async function runGiftAll() {
    const batch = targets
    stopRef.current = false
    let done = 0
    let failed = 0
    let streak = 0
    setRun({ done, failed, total: batch.length })
    for (const [i, m] of batch.entries()) {
      if (stopRef.current) break
      if (i > 0) {
        await sleep(GIFT_THROTTLE_MS)
        if (stopRef.current) break
      }
      try {
        const res = await giftPoints(m.uid, points)
        applyPointsUpdate(res)
        const left = Number(res.seedbonus)
        if (!Number.isNaN(left)) syncPanelBalance(left)
        marks.add(m.uid)
        done += 1
        streak = 0
      } catch (e) {
        failed += 1
        streak += 1
        // Out of points ends the run; any other refusal skips one member,
        // until a streak shows the run cannot succeed at all.
        const outOfPoints = e instanceof Error && /enough|insufficient|afford/i.test(e.message)
        if (outOfPoints || streak >= FAIL_STREAK_LIMIT) {
          toast.error(
            outOfPoints ? 'Not enough points to keep going.' : 'Sends keep failing, so the run stopped.',
            { description: e instanceof Error ? e.message : undefined }
          )
          break
        }
      }
      setRun({ done, failed, total: batch.length })
    }
    setRun(null)
    const summary = `Gifted ${done} of ${batch.length}`
    if (failed > 0) toast.warning(summary, { description: `${failed} did not go through.` })
    else if (done < batch.length) toast(summary, { description: 'Stopped early.' })
    else toast.success(summary)
  }

  const bulkControls = run ? (
    <div role="status" className="flex items-center gap-2.5">
      <Progress value={((run.done + run.failed) / run.total) * 100} className="w-36" />
      <span className="text-[12.5px] tabular-nums text-muted-foreground">{run.done} of {run.total} gifted</span>
      <Button variant="outline" size="sm" className="h-8" onClick={() => { stopRef.current = true }}>Stop</Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={BULK_GIFT_MIN}
        max={BULK_GIFT_MAX}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Points per member"
        aria-invalid={!amountValid}
        className="h-8 w-20 text-[12.5px] tabular-nums"
      />
      <span className="text-[12.5px] text-muted-foreground">pts</span>
      <Button size="sm" className="h-8" disabled={targets.length === 0 || !amountValid} onClick={() => setConfirming(true)}>
        <Gift /> Gift {fmtInt(targets.length)} ungifted
      </Button>
    </div>
  )

  return (
    <div className="grid gap-5">
      <PageHeader
        title="New members"
        sub={`${members.length} mice joined recently. Say hello and make them feel at home.`}
        action={bulkOn ? bulkControls : undefined}
      />

      <FilterSearch value={q} onChange={setQ} placeholder="Find a new member…" className="max-w-md" />
      {needle && <p className="-mt-2 text-[12.5px] text-muted-foreground">{shown.length} of {members.length} match</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((m) => (
          <Card key={m.uid} className="group py-0 transition-colors hover:border-brand/40">
            <CardContent className="flex items-center gap-3 py-3">
              <a href={m.href} className="shrink-0">
                <Avatar className="size-10 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-brand-soft text-[12px] font-semibold text-accent-foreground">{initials(m.name)}</AvatarFallback>
                </Avatar>
              </a>
              <a href={m.href} className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold hover:underline" style={{ color: mutedUserColor(m.color) }}>{m.name}</span>
                {isGifted(m.uid) ? (
                  <span className="flex items-center gap-1 text-[11.5px] text-gifted" title="Already gifted">
                    <Gift className="size-3" /> gifted
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground"><UserPlus className="size-3" /> new mouse</span>
                )}
              </a>
              <Button asChild size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
                <a href={`/sendmessage.php?receiver=${m.uid}`} title={`Welcome ${m.name}`}><Mail className="size-4" /></a>
              </Button>
            </CardContent>
          </Card>
        ))}
        {shown.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No new member matches “{q.trim()}”.</CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {fmtInt(total)} points?</AlertDialogTitle>
            <AlertDialogDescription>
              {fmtInt(targets.length)} members get {fmtInt(points)} points each, {fmtInt(total)} points total.{' '}
              {balance != null && (short
                ? `You have ${fmtInt(balance)} points, so this run does not fit.`
                : `You have ${fmtInt(balance)} points now, ${fmtInt(balance - total)} after the run.`)}{' '}
              One gift goes out every {GIFT_THROTTLE_MS / 1000} seconds; you can stop between sends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={short}
              onClick={() => {
                setConfirming(false)
                void runGiftAll()
              }}
            >
              Send {fmtInt(total)} points
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
