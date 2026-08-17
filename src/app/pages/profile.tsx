import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Gift, HeartHandshake, Mail, NotebookPen, Ticket, UserPlus, UserRound } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractProfile, type Donations } from '@/lib/extract/profile'
import { openGiftDialog } from '@/lib/gift-dialog'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { fmtInt, initials, localDateTime, utcTitle } from '@/lib/format'
import { useFeature, useUserNotes } from '@/lib/settings'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CollapsibleSection } from '@/components/section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { mamFetch } from '@/lib/mam-fetch'

const GROUPS: { title: string; match: RegExp }[] = [
  { title: 'Transfer', match: /^(uploaded|downloaded|share ratio|real uploaded|real downloaded|real share ratio)/i },
  { title: 'Activity', match: /^(join date|last seen|class|points earning|uploads|fl wedges|requests)/i },
  { title: 'Community', match: /^(forum posts|torrent comments|invites|invited by|staff tickets|total donated)/i },
  { title: 'Connection', match: /^(address|vpn|seedbox|agent)/i },
]

/** Sections in a card line up on px-4, the way the foldable list does. */
const EDGE = '[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4'

/** A column of plain numbers, with or without a unit, reads better right up
 * against the next one. */
const NUMERIC = /^[\d.,]+(\s*[A-Za-z]{1,3})?$/

/** The donation record: shut it shows how many there are, open it is the table
 * MAM keeps behind its own plus sign. */
function DonationsCard({ d }: { d: Donations }) {
  const [open, setOpen] = useState(false)
  const numeric = d.headers.map(
    (_, i) => d.rows.length > 0 && d.rows.every((r) => NUMERIC.test(r[i] ?? ''))
  )
  // The total carries no unit of its own. Naming it is only safe while every
  // row agrees on one currency.
  const curAt = d.headers.findIndex((h) => /currency/i.test(h))
  const currency =
    curAt >= 0 && d.rows.length > 0 && new Set(d.rows.map((r) => r[curAt])).size === 1
      ? d.rows[0][curAt]
      : null
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b !py-3">
        <CardTitle className="flex items-center gap-2">
          <HeartHandshake className="size-4 text-brand" /> Donations
        </CardTitle>
        {d.total && (
          <CardAction className="self-center text-[13px] font-medium tabular-nums">
            {currency ? `${d.total} ${currency}` : d.total}
          </CardAction>
        )}
      </CardHeader>
      <CollapsibleSection title={d.label} count={d.rows.length} open={open} onOpenChange={setOpen}>
        {d.rows.length > 0 ? (
          <Table className={EDGE}>
            {d.headers.some(Boolean) && (
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {d.headers.map((h, i) => (
                    <TableHead key={i} className={numeric[i] ? 'text-right' : undefined}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
            )}
            <TableBody>
              {d.rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell
                      key={j}
                      className={numeric[j] ? 'text-right text-[13px] tabular-nums' : 'text-[13px] tabular-nums'}
                    >
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nothing recorded yet.</p>
        )}
      </CollapsibleSection>
    </Card>
  )
}

// Typing pauses this long before the note lands in storage.
const NOTE_SAVE_DEBOUNCE_MS = 600
// How long the saved confirmation stays readable.
const NOTE_SAVED_FLASH_MS = 1500

/** Private free-text note about this member, stored only in this browser. */
function NotesCard({ uid }: { uid: string }) {
  const { notes, setNote } = useUserNotes()
  const [text, setText] = useState(() => notes[uid]?.text ?? '')
  const [savedFlash, setSavedFlash] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  function onChange(v: string) {
    setText(v)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      setNote(uid, v)
      setSavedFlash(true)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setSavedFlash(false), NOTE_SAVED_FLASH_MS)
    }, NOTE_SAVE_DEBOUNCE_MS)
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3">
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="size-4 text-brand" /> Your notes
        </CardTitle>
        <CardAction className="self-center text-[11.5px] text-muted-foreground">
          {savedFlash ? 'Saved' : 'Private, stored in this browser'}
        </CardAction>
      </CardHeader>
      <CardContent className="px-6 py-4">
        <Textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Who is this? Trades, promises, book tips…"
          aria-label="Private notes about this member"
          className="min-h-20"
        />
      </CardContent>
    </Card>
  )
}

const GIFT_TYPES = new Set(['giftPoints', 'giftWedge'])

interface GiftRow {
  at: string
  sent: boolean
  what: string
}

/** Gifts between the reader and this profile, from the recent bonus log. */
function GiftHistoryCard({ uid, name }: { uid: string; name: string }) {
  const [rows, setRows] = useState<GiftRow[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    mamFetch('/json/userBonusHistory.php', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { timestamp: number; amount: number; type: string; other_userid: number | null }[]) => {
        if (!live || !Array.isArray(j)) return
        setRows(
          j
            .filter((e) => GIFT_TYPES.has(e.type) && e.other_userid != null && String(e.other_userid) === uid)
            .map((e) => ({
              at: new Date(e.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' '),
              sent: e.amount < 0,
              what: e.type === 'giftWedge' ? (Math.abs(e.amount) === 1 ? 'FL wedge' : `${fmtInt(Math.abs(e.amount))} FL wedges`) : `${fmtInt(Math.abs(e.amount))} points`,
            }))
        )
      })
      .catch(() => {
        // no data, no card
      })
    return () => {
      live = false
    }
  }, [uid])

  if (rows == null) return null
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b !py-3">
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-4 text-brand" /> Gifts between you two
        </CardTitle>
        <CardAction className="self-center text-[11.5px] text-muted-foreground">recent history</CardAction>
      </CardHeader>
      <CollapsibleSection title={`With ${name}`} count={rows.length} open={open} onOpenChange={setOpen}>
        {rows.length > 0 ? (
          <Table className={EDGE}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>When</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Gift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[13px] tabular-nums" title={utcTitle(r.at)}>{localDateTime(r.at)}</TableCell>
                  <TableCell className="text-[13px]">{r.sent ? `You gave ${name}` : `${name} gave you`}</TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">{r.what}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No gifts between you two yet.</p>
        )}
      </CollapsibleSection>
    </Card>
  )
}

export function ProfileView(props: PageProps) {
  const data = useMemo(() => extractProfile(document), [])
  const [notesOn] = useFeature('profileNotes')
  const [giftsOn] = useFeature('giftHistory')
  if (!data) return <LegacyView {...props} />

  const grouped = GROUPS.map((g) => ({
    title: g.title,
    fields: data.fields.filter((f) => g.match.test(f.label)),
  })).filter((g) => g.fields.length > 0)
  const rest = data.fields.filter((f) => !GROUPS.some((g) => g.match.test(f.label)) && !/^the "real" info/i.test(f.label))

  const isSelf = props.page.user.uid != null && String(props.page.user.uid) === data.uid

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-20 rounded-xl border shadow-sm">
          {data.avatar && <AvatarImage src={data.avatar} alt="" />}
          <AvatarFallback className="rounded-xl font-display text-2xl">{initials(data.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2.5 font-display text-[26px] font-semibold tracking-tight">
            {data.name}
            {data.country && <img src={data.country.flag} alt={data.country.name} title={data.country.name} className="h-4 rounded-[3px]" />}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {data.fields.find((f) => f.label === 'Class')?.text ?? 'Member'}
            {data.uid && <> · #{data.uid}</>}
          </p>
        </div>
        {/* Own row on a phone: beside a long name these would sit on top of it. */}
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {!isSelf && data.uid && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openGiftDialog({ kind: 'points', uid: data.uid!, name: data.name, surface: 'profile' })}
              >
                <Gift /> Gift points
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openGiftDialog({ kind: 'wedge', uid: data.uid!, name: data.name, surface: 'profile' })}
              >
                <Ticket /> Send wedge
              </Button>
            </>
          )}
          {isSelf ? (
            <Button asChild variant="outline" size="sm">
              <a href="/preferences/index.php"><UserRound /> Edit preferences</a>
            </Button>
          ) : data.actions.length > 0 ? (
            data.actions.map((a) => (
              <Button
                key={a.href}
                asChild
                variant={a.kind === 'pm' ? 'default' : 'outline'}
                size="sm"
                className={a.kind === 'block' ? 'text-muted-foreground hover:text-destructive' : undefined}
              >
                <a href={a.href}>
                  {a.kind === 'friend' ? <UserPlus /> : a.kind === 'block' ? <Ban /> : <Mail />}
                  {a.label.charAt(0).toUpperCase() + a.label.slice(1)}
                </a>
              </Button>
            ))
          ) : (
            data.uid && (
              <Button asChild variant="default" size="sm">
                <a href={`/sendmessage.php?receiver=${data.uid}`}><Mail /> Message</a>
              </Button>
            )
          )}
        </div>
      </div>

      {data.bioHtml && (
        <Card className="border-brand/20 bg-brand-soft/20 py-0">
          <CardContent className="py-4">
            <RichHtml html={data.bioHtml} className="font-display text-[15px] leading-relaxed" />
          </CardContent>
        </Card>
      )}

      {!isSelf && data.uid && notesOn && <NotesCard uid={data.uid} />}
      {!isSelf && data.uid && giftsOn && <GiftHistoryCard uid={data.uid} name={data.name} />}

      {data.donations && <DonationsCard d={data.donations} />}

      <div className="grid items-start gap-4 md:grid-cols-2">
        {[...grouped, ...(rest.length ? [{ title: 'More', fields: rest }] : [])].map((g) => (
          <Card key={g.title} className="gap-0 py-0">
            <CardHeader className="!py-3">
              <CardTitle>{g.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 py-1">
              {g.fields.map((f) => (
                <div key={f.label} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-6 py-2 text-[13px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <RichHtml html={f.html} className="text-[13px] [&_a]:no-underline [&_a:hover]:underline" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
