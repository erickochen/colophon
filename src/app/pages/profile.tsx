import { useMemo, useState } from 'react'
import { Ban, Gift, HeartHandshake, Mail, Ticket, UserPlus, UserRound } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractProfile, type Donations } from '@/lib/extract/profile'
import { openGiftDialog } from '@/lib/gift-dialog'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CollapsibleSection } from '@/components/section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

export function ProfileView(props: PageProps) {
  const data = useMemo(() => extractProfile(document), [])
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
