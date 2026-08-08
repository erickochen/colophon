import { useMemo, useState } from 'react'
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
import { PageHeader } from '@/app/shell/bits'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { cn } from '@/lib/utils'

/** MAM sends the General tab as one flat list with no sections of its own, so
 * the cards are ours. Keyed by input name, in MAM's own row order, with a
 * catch-all so a field MAM adds later still shows up somewhere. */
const GENERAL_GROUPS: { title: string; names: string[]; note?: RegExp }[] = [
  { title: 'Your account', names: ['parked', 'displayVIPexpire'] },
  { title: 'Editor', names: ['disableWysiwyg'] },
  { title: 'Private messages', names: ['acceptpms', 'deletepms', 'savepms', 'pmnotif'] },
  { title: 'What others can send you', names: ['receiveGift[points]', 'receiveGift[wedges]'] },
  { title: 'Profile', names: ['country', 'avatarUrl', 'avatar', 'deleteAvatar', 'info'] },
  {
    title: 'Date and time format',
    names: ['dateOnlyFormat', 'dateAndTimeFormat', 'timeOnlyFormat'],
    note: /date and time format/i,
  },
]

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
    const names = row.controls.map((c) => c.name)
    const group = GENERAL_GROUPS.find((g) => g.names.some((n) => names.includes(n)))
    if (!group) {
      rest.push(row)
      continue
    }
    const list = buckets.get(group.title) ?? []
    list.push(row)
    buckets.set(group.title, list)
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
              'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition-colors',
              'xl:py-2',
              isActive
                ? 'bg-brand-soft font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground xl:hover:text-foreground'
            )}
          >
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
          {/* Bespoke views own the tabs whose forms the generic FormMirror
              mangles (matrix tables, nested widgets, live meters). The rest
              stay plain FormMirror. */}
          {active === 'security' ? (
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
