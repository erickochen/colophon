// Colophon's own preferences tab. Everything here is client-side: switches
// write the settings store directly and apply immediately, so there is no form
// and no save bar.
import { useEffect, useRef, useState } from 'react'
import { BookMarked, Check, ChevronsUpDown, Download, Moon, Pin, RotateCcw, Sun, SunMoon, Upload } from 'lucide-react'
import type { PageProps } from '@/app/router'
import type { Theme } from '@/lib/theme'
import {
  chooseScheme, chooseTheme, DARK_SCHEME_ITEMS, dropSchemePreview,
  LIGHT_SCHEME_ITEMS, previewSchemeChoice, SchemeDot, useAppearance,
} from '@/components/appearance'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  clearAllSettings, exportSettings, importSettings, restoreSettings, useDefaultAmount, useFeature,
  useIgnoredTorrents, useUserList, useUserNotes,
  type AmountKind, type FeatureKey, type UserListKind,
} from '@/lib/settings'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MAX_GIFT, THANK_MAX, THANK_STEP } from '@/lib/mam-api'
import { PrefCard, SettingRow } from '@/app/pages/prefs-bits'
import { RatioFloorInput } from '@/components/ratio-floor'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toast } from '@/components/ui/toast'
import {
  SAVED_PAGES, cleanName, useAllSavedFilters, useSavedFilters, type SavedFilters, type SavedSet,
} from '@/lib/saved-filters'

const EXPORT_FILENAME = 'colophon-settings.json'

/** The source that had the idea first, named the way the release topic does. */
function noteWithCredit(note: string, credit?: string): React.ReactNode {
  if (!credit) return note
  return (
    <>
      {note}
      <span className="mt-0.5 block text-[11px] text-muted-foreground/70">Idea from {credit}</span>
    </>
  )
}

function FeatureRow({ feature, title, note, credit }: { feature: FeatureKey; title: string; note: string; credit?: string }) {
  const [on, setOn] = useFeature(feature)
  return (
    <SettingRow title={title} note={noteWithCredit(note, credit)}>
      <Switch checked={on} onCheckedChange={setOn} aria-label={title} />
    </SettingRow>
  )
}

function AmountRow({
  kind, title, note, credit, max, step,
}: { kind: AmountKind; title: string; note: string; credit?: string; max: number; step?: number }) {
  const [value, setValue] = useDefaultAmount(kind)
  // Invalid text stays a local draft: the store only ever holds usable values,
  // so a typo cannot silently switch the prefill off.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const validOf = (v: string) =>
    v === '' ||
    /^max$/i.test(v.trim()) ||
    (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= max && (!step || Number(v) % step === 0))
  const valid = validOf(shown)
  // A stored amount between two steps is spendable only as the step below, so
  // the field shows that number rather than one the store would refuse.
  useEffect(() => {
    if (!step || draft !== null) return
    const n = Number(value)
    if (!value || /^max$/i.test(value.trim()) || !Number.isFinite(n) || n <= 0) return
    if (n <= max && n % step === 0) return
    const floored = Math.floor(Math.min(n, max) / step) * step
    setValue(floored > 0 ? String(floored) : '')
  }, [value, step, max, draft, setValue])
  const hintId = `${kind}-amount-hint`
  return (
    <SettingRow title={title} note={noteWithCredit(note, credit)}>
      <div className="grid justify-items-end gap-1">
        <Input
          value={shown}
          placeholder="off"
          aria-label={title}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : hintId}
          onFocus={() => setDraft(value)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value)
            if (validOf(e.target.value)) setValue(e.target.value)
          }}
          className="h-8 w-24 text-[12.5px]"
        />
        {!valid && (
          <span id={hintId} className="text-[11.5px] text-destructive">
            {step ? `Steps of ${step} up to ${max.toLocaleString('en-US')} or max` : `A whole number up to ${max.toLocaleString('en-US')} or max`}
          </span>
        )}
      </div>
    </SettingRow>
  )
}

function RatioFloorRow() {
  const [enabled] = useFeature('ratioProtect')
  return (
    <SettingRow
      title="Minimum ratio"
      note="A download landing under this number locks. Clear the field to never lock."
    >
      <RatioFloorInput disabled={!enabled} className="w-24 text-[12.5px]" />
    </SettingRow>
  )
}

function SeriesBulkRow() {
  const [viewOn] = useFeature('seriesView')
  const [on, setOn] = useFeature('seriesBulk')
  return (
    <SettingRow
      title="Bulk actions"
      note={
        viewOn
          ? 'Checkboxes on the parts plus a bar to bookmark, zip or wedge the selection in one go.'
          : 'Checkboxes on the parts plus a bar to bookmark, zip or wedge the selection in one go. Needs Series view above.'
      }
    >
      <Switch checked={on} onCheckedChange={setOn} disabled={!viewOn} aria-label="Bulk actions" />
    </SettingRow>
  )
}

const APPEARANCE_ITEM = 'gap-1.5 text-[12.5px] data-pressed:bg-brand-soft'

/** Title above the group instead of beside it: three scheme names never fit
 * next to a label on a phone. */
function AppearanceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[13.5px] font-medium leading-snug">{label}</div>
      {children}
    </div>
  )
}

/** Combobox for one side. Highlighting an entry, by pointer or arrow keys,
 * previews it across the whole shell; choosing stores it and moves the theme
 * to that side. Closing without choosing returns to the saved state. */
function SchemePicker({ side }: { side: 'light' | 'dark' }) {
  const { lightScheme, darkScheme } = useAppearance()
  const items = side === 'light' ? LIGHT_SCHEME_ITEMS : DARK_SCHEME_ITEMS
  const active = side === 'light' ? lightScheme : darkScheme
  const current = items.find((s) => s.value === active)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState<string>(active)

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setHighlight(active)
        // Immediate: with the popover gone there is no scanning state left.
        else dropSchemePreview()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={side === 'light' ? 'Light scheme' : 'Dark scheme'}
          className="h-8 w-full justify-start gap-2 px-2 text-[12.5px] font-normal"
        >
          <SchemeDot scheme={current?.scheme ?? ''} />
          <span className="truncate">{current?.label}</span>
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-0"
        onKeyDown={(e) => {
          if (e.key === 'Escape') dropSchemePreview()
        }}
      >
        <Command
          value={highlight}
          onValueChange={(v) => {
            setHighlight(v)
            if (v) previewSchemeChoice(side, v)
          }}
        >
          <CommandInput placeholder="Search schemes…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No scheme found.</CommandEmpty>
            {items.map((s) => (
              <CommandItem
                key={s.value}
                value={s.value}
                keywords={[s.label]}
                className="h-8 gap-2 text-[12.5px]"
                onSelect={(v) => {
                  chooseScheme(side, v)
                  setOpen(false)
                }}
              >
                <SchemeDot scheme={s.scheme} />
                <span className="truncate">{s.label}</span>
                {active === s.value && <Check className="ml-auto size-3.5 shrink-0 text-brand" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function AppearanceCard() {
  const { theme } = useAppearance()
  return (
    <PrefCard
      title="Appearance"
      note="Browsing a picker previews schemes across the whole page; picking one keeps it and switches the mode to that side."
    >
      <AppearanceRow label="Mode">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={theme}
          onValueChange={(v) => v && chooseTheme(v as Theme)}
          className="flex-wrap"
          aria-label="Mode"
        >
          <ToggleGroupItem value="light" className={APPEARANCE_ITEM}><Sun className="size-3.5" /> Light</ToggleGroupItem>
          <ToggleGroupItem value="dark" className={APPEARANCE_ITEM}><Moon className="size-3.5" /> Dark</ToggleGroupItem>
          <ToggleGroupItem value="auto" className={APPEARANCE_ITEM}><SunMoon className="size-3.5" /> Auto</ToggleGroupItem>
        </ToggleGroup>
      </AppearanceRow>
      <div className="grid gap-4 sm:grid-cols-2">
        <AppearanceRow label="Light scheme">
          <SchemePicker side="light" />
        </AppearanceRow>
        <AppearanceRow label="Dark scheme">
          <SchemePicker side="dark" />
        </AppearanceRow>
      </div>
    </PrefCard>
  )
}

/** Shared shell for the review lists under the switches. */
function ReviewList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-3">
      <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      {children.length > 0 ? (
        <div className="mt-1 divide-y divide-border/70">{children}</div>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}

const REVIEW_ROW = 'flex items-center justify-between gap-3 py-1.5'
const REVIEW_LINK = 'min-w-0 truncate text-[13px] hover:text-brand'
const REVIEW_BTN = 'h-7 px-2 text-[12px] text-muted-foreground hover:text-foreground'

function IgnoredTorrentRows() {
  const ignored = useIgnoredTorrents()
  return (
    <ReviewList title="Ignored torrents" empty="Nothing ignored.">
      {ignored.list.map((t) => (
        <div key={t.id} className={REVIEW_ROW}>
          <a href={`/t/${t.id}`} className={REVIEW_LINK}>{t.title ?? `#${t.id}`}</a>
          <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={() => ignored.remove(t.id)}>
            Unignore
          </Button>
        </div>
      ))}
    </ReviewList>
  )
}

function UserListRows({ kind, title, empty }: { kind: UserListKind; title: string; empty: string }) {
  const list = useUserList(kind)
  return (
    <ReviewList title={title} empty={empty}>
      {list.users.map((u) => (
        <div key={u.uid} className={REVIEW_ROW}>
          <a href={`/u/${u.uid}`} className={REVIEW_LINK}>{u.name}</a>
          <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={() => list.remove(u.uid)}>
            Remove
          </Button>
        </div>
      ))}
    </ReviewList>
  )
}

function NoteRows() {
  const { notes, removeNote } = useUserNotes()
  const entries = Object.entries(notes)
  return (
    <ReviewList title="Your notes" empty="No notes yet.">
      {entries.map(([uid, note]) => (
        <div key={uid} className={REVIEW_ROW}>
          <a href={`/u/${uid}`} className={REVIEW_LINK} title={note.text}>
            <span className="text-muted-foreground">#{uid}</span> {note.text.split('\n')[0]}
          </a>
          <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={() => removeNote(uid)}>
            Delete
          </Button>
        </div>
      ))}
    </ReviewList>
  )
}

const STORAGE_REFUSED = 'Your browser is blocking storage, so nothing was kept.'

/** A deleted set can be taken back for this long. Longer than the usual toast,
 * since reading the name plus reaching for Undo takes a moment. */
const UNDO_MS = 12000

/** One saved set: its name to edit, what it filters, the pin plus the way out.
 * The name commits on blur or Enter, so renaming costs no extra click. */
function SavedFilterRow({ set, store }: { set: SavedSet; store: SavedFilters }) {
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.name])

  const commit = () => {
    const next = cleanName(name)
    if (!next || next === set.name) {
      setName(set.name)
      return
    }
    if (!store.rename(set.id, next)) {
      setName(set.name)
      toast.error('Could not rename this set', { description: STORAGE_REFUSED })
    }
  }

  const drop = () => {
    const gone = store.remove(set.id)
    if (!gone.ok) {
      toast.error('Could not delete this set', { description: STORAGE_REFUSED })
      return
    }
    // A second click on the same row finds nothing left to take away.
    if (!gone.set) return
    const back = gone.set
    toast.success(`Deleted "${back.name}"`, {
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (!store.restore(back, gone.at)) {
            toast.error('Could not bring it back', { description: STORAGE_REFUSED })
          }
        },
      },
    })
  }

  return (
    <div className={REVIEW_ROW}>
      <Input
        value={name}
        aria-label="Name of this set"
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setName(set.name)
        }}
        className="h-7 w-44 shrink-0 text-[13px]"
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground" title={set.summary}>
        {set.summary}
      </span>
      <Toggle
        size="sm"
        pressed={set.pinned === true}
        onPressedChange={(on) => {
          if (!store.pin(set.id, on)) toast.error('Could not change the default', { description: STORAGE_REFUSED })
        }}
        aria-label={set.pinned ? `${set.name} opens this page, switch off` : `Open this page with ${set.name}`}
        title="Open this page with these filters"
        className="shrink-0 data-pressed:bg-brand-soft data-pressed:text-accent-foreground"
      >
        <Pin className="size-3.5" />
      </Toggle>
      <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={drop}>
        Delete
      </Button>
    </div>
  )
}

function SavedFilterGroup({ page }: { page: string }) {
  const store = useSavedFilters(page)
  if (store.sets.length === 0) return null
  return (
    <ReviewList title={SAVED_PAGES[page] ?? page} empty="">
      {store.sets.map((set) => (
        <SavedFilterRow key={set.id} set={set} store={store} />
      ))}
    </ReviewList>
  )
}

function SavedFilterRows() {
  const pages = useAllSavedFilters()
  const held = Object.keys(pages).filter((p) => pages[p].length > 0)
  // Known pages in their own order, then anything else that holds a set.
  const order = [
    ...Object.keys(SAVED_PAGES).filter((p) => held.includes(p)),
    ...held.filter((p) => !(p in SAVED_PAGES)),
  ]
  if (order.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        Nothing saved yet. Filter a list, then use Save these filters under the bar.
      </p>
    )
  }
  return (
    <div className="grid gap-3">
      {order.map((page) => (
        <SavedFilterGroup key={page} page={page} />
      ))}
    </div>
  )
}

function IntroCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const version = (window as { __colophon?: string }).__colophon ?? null

  function exportFile() {
    const blob = new Blob([exportSettings()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = EXPORT_FILENAME
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Settings exported')
  }

  async function importFile(file: File) {
    let before: string | null = null
    try {
      const text = await file.text()
      // The snapshot makes the import a step back instead of a leap.
      before = exportSettings()
      const { applied, skipped } = importSettings(text)
      toast.success(`Applied ${applied} setting${applied === 1 ? '' : 's'}`, {
        description:
          skipped > 0
            ? `${skipped} ${skipped === 1 ? 'entry was' : 'entries were'} not recognized and stayed untouched.`
            : undefined,
        action: {
          label: 'Undo',
          onClick: () => {
            if (before != null) restoreSettings(before)
            toast.success('Your previous settings are back')
          },
        },
      })
    } catch (e) {
      toast.error(
        e instanceof SyntaxError
          ? 'That file is not a Colophon settings file.'
          : e instanceof Error
            ? e.message
            : 'That file could not be read.'
      )
    }
  }

  return (
    <Card className="border-brand/20 bg-brand-soft/20 py-0">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-accent-foreground">
          <BookMarked className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-display text-[15px] font-semibold">
            Colophon{version && <span className="ml-2 text-[12px] font-normal text-muted-foreground">v{version}</span>}
          </div>
          <p className="text-[12.5px] leading-normal text-muted-foreground">
            These settings apply immediately and live in this browser only, never on MAM's servers.
            Export saves everything here, your lists and notes included; it is your only backup.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={exportFile}>
            <Download /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12.5px] text-muted-foreground hover:text-destructive"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw /> Reset
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </CardContent>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Reset all Colophon settings?</AlertDialogTitle>
            <AlertDialogDescription>
              Every switch goes back to its default and your lists, quick shouts and notes are
              cleared. An export made beforehand is the only way back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllSettings()
                setResetOpen(false)
                toast.success('Colophon settings reset to defaults')
              }}
            >
              <RotateCcw /> Reset everything
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function ColophonPrefsView(_props: PageProps) {
  return (
    <div className="grid gap-4">
      <IntroCard />

      <AppearanceCard />

      <PrefCard title="Downloads">
        <FeatureRow
          feature="ratioProtect"
          title="Ratio protection"
          note="Locks the plain download when it would take your ratio under your minimum. Switched off, the note still shows but nothing locks."
          credit="MAM Ratio Protect by yyyzzz999 and Disable Non-Free Download Button by Gabo"
        />
        <RatioFloorRow />
        <FeatureRow
          feature="skipWedgeConfirm"
          title="Skip the wedge confirmation"
          note="Spends the wedge straight from the button. The toast still names what is left of your stash. A spent wedge cannot be taken back."
          credit="WedgeWaster by WIRLYWIRLY"
        />
      </PrefCard>

      <PrefCard title="Browse and requests">
        <FeatureRow
          feature="hideSnatched"
          title="Hide snatched torrents"
          note="Hides results you already snatched. The same toggle lives in the browse filters."
          credit="MAM+ by GardenShade"
        />
        <FeatureRow
          feature="ignoreAction"
          title="Ignore button on rows"
          note="Adds an ignore action to browse rows. Ignored torrents stay out of every result list."
          credit="MAM Ignore Torrents by Humdinger"
        />
        <FeatureRow
          feature="plainCopy"
          title="Copy results as text"
          note="A button above the results that copies the page as one line per book. Also on the requests page."
          credit="MAM+ by GardenShade"
        />
        <FeatureRow
          feature="hideHiddenRequesters"
          title="Hide hidden requesters"
          note="Hides requests from members who keep their name hidden. The same toggle lives in the request filters."
          credit="MAM+ by GardenShade"
        />
        <IgnoredTorrentRows />
      </PrefCard>

      <PrefCard
        title="Saved filters"
        note="Sets you saved from a filter bar. The one with a pin opens that page for you."
      >
        <SavedFilterRows />
      </PrefCard>

      <PrefCard title="Series">
        <FeatureRow
          feature="seriesView"
          title="Series view"
          note="Groups a series search by part, with a progress card on top."
          credit="SnazzySeries by WIRLYWIRLY"
        />
        <SeriesBulkRow />
      </PrefCard>

      <PrefCard title="Torrent pages">
        <FeatureRow
          feature="otherEditions"
          title="Other editions"
          note="Shows other torrents of the same book on the detail page."
          credit="MAM Other Torrents by Oriel"
        />
        <FeatureRow
          feature="externalLinks"
          title="External search links"
          note="Adds Goodreads, Audible and StoryGraph searches to torrent and request pages."
          credit="MAM+ by GardenShade"
        />
        <FeatureRow
          feature="forumSnippet"
          title="Forum snippet"
          note="Adds a button that copies a currently-reading snippet for forum posts."
        />
      </PrefCard>

      <PrefCard title="Shoutbox">
        <FeatureRow
          feature="sbMentions"
          title="Mention highlight"
          note="Tints shouts that mention your name."
          credit="Shoutbox Highlighter by Sazaland"
        />
        <FeatureRow
          feature="sbColors"
          title="Stable name colors"
          note="Gives users without a color of their own a steady one, so busy hours stay scannable."
          credit="Alternative SB name colors by seano"
        />
        <FeatureRow
          feature="sbMutes"
          title="Mute action"
          note="Muted users collapse to a single quiet line."
          credit="MAM+ by GardenShade"
        />
        <FeatureRow feature="sbEmphasis" title="Emphasis action" note="Marks users you never want to miss." />
        <FeatureRow
          feature="quickShout"
          title="Quick shouts"
          note="Saved messages behind a button in the composer. Pick one to insert it."
          credit="MAM+ by GardenShade"
        />
        <UserListRows kind="sb-muted" title="Muted users" empty="Nobody muted." />
        <UserListRows kind="sb-emphasized" title="Emphasized users" empty="Nobody emphasized." />
      </PrefCard>

      <PrefCard title="Gifting">
        <AmountRow
          kind="thank"
          max={THANK_MAX}
          step={THANK_STEP}
          title="Default thank amount"
          note={`Prefills the thank box on torrent pages. Points go in steps of ${THANK_STEP}; empty starts at zero.`}
          credit="MAM+ by GardenShade"
        />
        <AmountRow
          kind="gift"
          max={MAX_GIFT}
          title="Default gift amount"
          note="Prefills the gift dialog on every gift button. A number or max; empty keeps the dialog's own suggestion."
          credit="MAM+ by GardenShade"
        />
        <FeatureRow
          feature="giftNewest"
          title="Gift all newest members"
          note="Adds a bulk gift run to the new members page, one gift every few seconds. Every run asks before it spends."
          credit="MAM+ by GardenShade and ooglyboogly"
        />
      </PrefCard>

      <PrefCard title="Time and counters">
        <FeatureRow
          feature="localTime"
          title="Local timezone"
          note="Shows times in your own timezone. The exact UTC stamp stays in the tooltip."
          credit="MAM Time change script by Lemonade"
        />
        <FeatureRow
          feature="bonusDelta"
          title="Bonus delta"
          note="Shows how many bonus points arrived since your last page."
          credit="MAM+ by GardenShade"
        />
      </PrefCard>

      <PrefCard title="Notifications">
        <FeatureRow
          feature="notifToasts"
          title="Toast announcements"
          note="Pops a toast when a new message, watched topic, ticket or request arrives. Badges stay either way."
        />
        <FeatureRow
          feature="notifTitle"
          title="Tab title counter"
          note="Prefixes the tab title with your unread message count, mail style."
        />
      </PrefCard>

      <PrefCard title="Profiles">
        <FeatureRow
          feature="profileNotes"
          title="Private notes"
          note="A notes box on profiles. Only you can see it."
          credit="MAM+ by GardenShade"
        />
        <FeatureRow
          feature="giftHistory"
          title="Gift history"
          note="Shows gifts between you and the profile you are viewing."
        />
        <NoteRows />
      </PrefCard>
    </div>
  )
}
