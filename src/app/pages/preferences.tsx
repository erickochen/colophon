import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { parseForm, type MirrorRow } from '@/lib/form-mirror'
import { cleanHtml } from '@/lib/sanitize'
import { useUnsavedGuard } from '@/lib/form-dirty'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { LegacyView } from '@/app/pages/legacy'
import { SecuritySessions } from '@/app/pages/security-sessions'
import { SearchPrefsView } from '@/app/pages/search-prefs'
import { AccountPrefsView } from '@/app/pages/account-prefs'
import { StylePrefsView } from '@/app/pages/style-prefs'
import { ForumsPrefsView } from '@/app/pages/forums-prefs'
import { LinksPrefsView } from '@/app/pages/links-prefs'
import { ColophonPrefsView } from '@/app/pages/colophon-prefs'
import { PageHeader } from '@/app/shell/bits'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { cn } from '@/lib/utils'

/** MAM sends the General tab as one flat list with no sections of its own, so
 * the cards are ours. Keyed by input name, in MAM's own row order, with a
 * catch-all so a field MAM adds later still shows up somewhere. Control-less
 * status rows (Tracker HTTPS) are keyed by their MAM label instead. */
const GENERAL_GROUPS: { title: string; names: string[]; labels?: string[]; note?: RegExp }[] = [
  { title: 'Your account', names: ['parked', 'disableWysiwyg', 'displayVIPexpire'], labels: ['Tracker HTTPS'] },
  { title: 'Private messages', names: ['acceptpms', 'deletepms', 'savepms', 'pmnotif'] },
  { title: 'What others can send you', names: ['receiveGift[points]', 'receiveGift[wedges]'] },
  { title: 'Profile', names: ['country', 'avatarUrl', 'avatar', 'deleteAvatar', 'info'] },
  {
    title: 'Date and time format',
    names: ['dateOnlyFormat', 'dateAndTimeFormat', 'timeOnlyFormat'],
    note: /date and time format/i,
  },
]

/** The two send-screen defaults read as one setting, so they share a row. */
const PM_PAIR = ['deletepms', 'savepms']

/** MAM's response to a rejected save: the form is replaced by an "Error"
 * heading plus the reason in a table cell. Any .error_red outside the form
 * counts too; standing warnings (the 2FA note on Account, the password note
 * on Security) live inside the form and stay out of this list. */
function saveErrors(form: HTMLFormElement | null): string[] {
  const out: string[] = []
  const main = document.querySelector('#mainBody')
  const h2 = [...(main?.querySelectorAll('h2') ?? [])].find((h) => /^error$/i.test(h.textContent?.trim() ?? ''))
  if (h2) {
    for (const td of main!.querySelectorAll('td.text')) {
      const text = td.textContent?.replace(/\s+/g, ' ').trim()
      if (text) out.push(text)
    }
  }
  for (const el of main?.querySelectorAll('.error_red') ?? []) {
    if (form?.contains(el)) continue
    const text = el.textContent?.replace(/\s+/g, ' ').trim()
    if (text) out.push(text)
  }
  return [...new Set(out)]
}

/** The copy MAM puts in a heading row that carries no control of its own. */
function headingNote(match: RegExp): string | null {
  for (const tr of document.querySelectorAll('#prefForm tr')) {
    const cells = [...tr.querySelectorAll(':scope > td')]
    if (cells.length < 2 || cells.some((c) => c.querySelector('input, select, textarea'))) continue
    if (match.test(cells[0].textContent ?? '')) return cleanHtml(cells[1] as HTMLElement)
  }
  return null
}

function groupGeneral(rows: MirrorRow[]): MirrorRow[] {
  const buckets = new Map<string, MirrorRow[]>()
  const rest: MirrorRow[] = []
  for (const row of rows) {
    if (row.kind === 'section') continue
    // A heading row already lifted into a card note is not a fact to repeat.
    if (row.kind === 'static' && GENERAL_GROUPS.some((g) => g.note?.test(row.label))) continue
    const names = row.controls.map((c) => c.name)
    const group = GENERAL_GROUPS.find((g) =>
      row.kind === 'static' ? g.labels?.includes(row.label) : g.names.some((n) => names.includes(n))
    )
    if (!group) {
      rest.push(row)
      continue
    }
    const list = buckets.get(group.title) ?? []
    list.push(row)
    buckets.set(group.title, list)
  }

  // The delete/save defaults become one labelled pair instead of two rows.
  const pms = buckets.get('Private messages')
  if (pms) {
    const pair = PM_PAIR.map((n) => pms.find((r) => r.controls.some((c) => c.name === n))).filter(
      (r): r is MirrorRow => !!r
    )
    if (pair.length === PM_PAIR.length) {
      const merged: MirrorRow = {
        kind: 'field',
        label: 'Message defaults',
        noteHtml: 'Starting values for the matching options when you send or reply.',
        controls: pair.flatMap((r) => r.controls),
      }
      const at = pms.indexOf(pair[0])
      buckets.set(
        'Private messages',
        pms.flatMap((r, i) => (i === at ? [merged] : pair.includes(r) ? [] : [r]))
      )
    }
  }

  const out: MirrorRow[] = []
  const section = (label: string, noteHtml: string | null): MirrorRow => ({ kind: 'section', label, noteHtml, controls: [] })
  for (const g of GENERAL_GROUPS) {
    const list = buckets.get(g.title)
    if (!list?.length) continue
    out.push(section(g.title, g.note ? headingNote(g.note) : null))
    out.push(...list)
  }
  if (rest.length) {
    out.push(section('Other settings', null))
    out.push(...rest)
  }
  return out
}

const TABS = [
  { view: 'general', label: 'General' },
  { view: 'privacy', label: 'Privacy' },
  { view: 'account', label: 'Account' },
  { view: 'forums', label: 'Forum & shoutbox' },
  { view: 'uploading', label: 'Uploading' },
  { view: 'search', label: 'Torrent search' },
  { view: 'security', label: 'Security' },
  { view: 'style', label: 'Style' },
  { view: 'links', label: 'Tiny URL' },
  // Colophon's own tab: client-side settings, no MAM form behind it. The server
  // answers the unknown view param with the general page, which stays unused.
  { view: 'colophon', label: 'Colophon' },
]

export function PreferencesView(props: PageProps) {
  const current = new URLSearchParams(location.search).get('view') ?? 'general'
  const active = TABS.some((t) => t.view === current) ? current : 'general'
  const form = useMemo(
    () =>
      document.querySelector<HTMLFormElement>('#prefForm') ??
      document.querySelector<HTMLFormElement>('#mainBody form[method="post" i]'),
    []
  )
  const mirror = useMemo(() => {
    if (!form) return null
    const parsed = parseForm(form, document.querySelector('#mainBody h1'))
    return active === 'general' ? { ...parsed, rows: groupGeneral(parsed.rows) } : parsed
  }, [form, active])

  // Each tab is its own form with its own POST, so switching tabs throws away
  // whatever was typed here.
  const { isDirty, leave } = useUnsavedGuard(form)
  const [pending, setPending] = useState<string | null>(null)
  const rejected = useMemo(() => saveErrors(form), [form])

  const nav = (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 xl:sticky xl:top-20 xl:mx-0 xl:flex-col xl:gap-0.5 xl:self-start xl:overflow-visible xl:px-0 xl:pb-0">
      {TABS.map((t) => {
        const isActive = active === t.view
        const href = `/preferences/index.php?view=${t.view}`
        return (
          <a
            key={t.view}
            href={href}
            onClick={(e) => {
              if (isActive || !isDirty()) return
              e.preventDefault()
              setPending(href)
            }}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition-colors',
              'xl:py-2',
              isActive
                ? 'bg-brand-soft font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground xl:hover:text-foreground'
            )}
          >
            {t.view === 'colophon' && <span aria-hidden="true" className="mr-1.5 size-1.5 rounded-full bg-brand" />}
            {t.label}
          </a>
        )
      })}
    </nav>
  )

  return (
    <div className="grid gap-5">
      <PageHeader title="Preferences" sub={`${TABS.find((t) => t.view === active)?.label ?? 'General'} settings`} />
      <div className="grid gap-6 xl:grid-cols-[180px_minmax(0,1fr)]">
        {nav}
        <div className="min-w-0 max-w-3xl">
          {rejected.length > 0 && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-destructive/10 px-4 py-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="grid gap-1">
                <span className="font-medium">These changes were not saved</span>
                {rejected.map((t, i) => (
                  <span key={i} className="leading-normal">{t}</span>
                ))}
              </div>
            </div>
          )}
          {/* A rejected save replaces the whole form with MAM's error page, so
              there is nothing to edit here until the reader goes back. */}
          {active === 'colophon' ? (
            <ColophonPrefsView {...props} />
          ) : rejected.length > 0 && !form ? (
            <a
              href={`/preferences/index.php?view=${active}`}
              className="inline-flex h-8 items-center rounded-md bg-brand-soft px-3 text-[12.5px] font-medium text-accent-foreground transition-colors hover:opacity-90"
            >
              Back to {TABS.find((t) => t.view === active)?.label ?? 'settings'}
            </a>
          ) : /* Bespoke views own the tabs whose forms the generic FormMirror
              mangles (matrix tables, nested widgets, live meters). The rest
              stay plain FormMirror. */
          active === 'security' ? (
            <SecuritySessions {...props} />
          ) : active === 'search' ? (
            <SearchPrefsView {...props} />
          ) : active === 'account' ? (
            <AccountPrefsView {...props} />
          ) : active === 'style' ? (
            <StylePrefsView {...props} />
          ) : active === 'forums' ? (
            <ForumsPrefsView {...props} />
          ) : active === 'links' ? (
            <LinksPrefsView {...props} />
          ) : mirror && mirror.rows.length > 0 ? (
            <FormMirrorView form={mirror} />
          ) : (
            <LegacyView {...props} />
          )}
        </div>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Every tab here saves on its own, so what you changed on this one is lost the moment you switch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const to = pending
                setPending(null)
                if (to) leave(to)
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
