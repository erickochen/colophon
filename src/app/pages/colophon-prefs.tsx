// Colophon's own preferences tab. Everything here is client-side: switches
// write the settings store directly and apply immediately, so there is no form
// and no save bar.
import { useRef, useState } from 'react'
import { BookMarked, Download, Moon, Sun, SunMoon, Upload } from 'lucide-react'
import type { PageProps } from '@/app/router'
import type { DarkScheme, LightScheme, Theme } from '@/lib/theme'
import {
  chooseDarkScheme, chooseLightScheme, chooseTheme, DARK_SCHEME_ITEMS, LIGHT_SCHEME_ITEMS, SchemeDot, useAppearance,
} from '@/components/appearance'
import {
  exportSettings, importSettings, useDefaultAmount, useFeature, useIgnoredTorrents, useRatioFloor,
  useUserList, useUserNotes, type AmountKind, type FeatureKey, type UserListKind,
} from '@/lib/settings'
import { HARD_FLOOR } from '@/lib/ratio-protect'
import { MAX_GIFT, THANK_MAX } from '@/lib/mam-api'
import { PrefCard, SettingRow } from '@/app/pages/prefs-bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toast } from '@/components/ui/toast'

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

function AmountRow({ kind, title, note, credit, max }: { kind: AmountKind; title: string; note: string; credit?: string; max: number }) {
  const [value, setValue] = useDefaultAmount(kind)
  const valid =
    value === '' || /^max$/i.test(value.trim()) || (Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= max)
  return (
    <SettingRow title={title} note={noteWithCredit(note, credit)}>
      <Input
        value={value}
        placeholder="off"
        aria-label={title}
        aria-invalid={!valid}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-24 text-[12.5px]"
      />
    </SettingRow>
  )
}

function RatioFloorRow() {
  const [enabled] = useFeature('ratioProtect')
  const [floor, setFloor] = useRatioFloor()
  // While the field holds focus the typed text wins; otherwise it mirrors the
  // store, so a settings import or the lock dialog shows up here at once.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (floor != null ? String(floor) : '')
  return (
    <SettingRow
      title="Minimum ratio"
      note="Also lock when a download would push your ratio below this number. Empty keeps only the hard floor."
    >
      <Input
        type="number"
        min={0}
        step="0.1"
        placeholder="off"
        aria-label="Minimum ratio"
        disabled={!enabled}
        value={shown}
        onFocus={() => setDraft(floor != null ? String(floor) : '')}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value)
          setFloor(e.target.value !== '' && Number.isFinite(v) && v > 0 ? v : null)
        }}
        className="h-8 w-24 text-[12.5px]"
      />
    </SettingRow>
  )
}

function SeriesBulkRow() {
  const [viewOn] = useFeature('seriesView')
  const [on, setOn] = useFeature('seriesBulk')
  return (
    <SettingRow
      title="Bulk actions"
      note="Checkboxes on the parts plus a bar to bookmark, zip or wedge the selection in one go."
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

function AppearanceCard() {
  const { theme, lightScheme, darkScheme } = useAppearance()
  return (
    <PrefCard title="Appearance" note="The sun and moon button in the topbar carries the same choices.">
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
      <AppearanceRow label="Light scheme">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={lightScheme}
          onValueChange={(v) => v && chooseLightScheme(v as LightScheme)}
          className="flex-wrap"
          aria-label="Light scheme"
        >
          {LIGHT_SCHEME_ITEMS.map((s) => (
            <ToggleGroupItem key={s.value} value={s.value} className={APPEARANCE_ITEM}>
              <SchemeDot scheme={s.scheme} /> {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </AppearanceRow>
      <AppearanceRow label="Dark scheme">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={darkScheme}
          onValueChange={(v) => v && chooseDarkScheme(v as DarkScheme)}
          className="flex-wrap"
          aria-label="Dark scheme"
        >
          {DARK_SCHEME_ITEMS.map((s) => (
            <ToggleGroupItem key={s.value} value={s.value} className={APPEARANCE_ITEM}>
              <SchemeDot scheme={s.scheme} /> {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </AppearanceRow>
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

function IntroCard() {
  const fileRef = useRef<HTMLInputElement>(null)
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
    try {
      const { applied, skipped } = importSettings(await file.text())
      toast.success(`Applied ${applied} setting${applied === 1 ? '' : 's'}`, {
        description:
          skipped > 0
            ? `${skipped} ${skipped === 1 ? 'entry was' : 'entries were'} not recognized and stayed untouched.`
            : undefined,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  return (
    <Card className="border-brand/20 bg-brand-soft/20 py-0">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <BookMarked className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-display text-[15px] font-semibold">
            Colophon{version && <span className="ml-2 text-[12px] font-normal text-muted-foreground">v{version}</span>}
          </div>
          <p className="text-[12.5px] leading-normal text-muted-foreground">
            These settings apply immediately and live in this browser only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={exportFile}>
            <Download /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
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
          note={`Locks the plain download on a heavy ratio drop or when it would cross ratio ${HARD_FLOOR}. Switched off, the impact still shows but nothing locks.`}
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

      <PrefCard title="Browse">
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
        <IgnoredTorrentRows />
      </PrefCard>

      <PrefCard title="Requests">
        <FeatureRow
          feature="hideHiddenRequesters"
          title="Hide hidden requesters"
          note="Hides requests from members who keep their name hidden. The same toggle lives in the request filters."
          credit="MAM+ by GardenShade"
        />
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
          title="Default thank amount"
          note="Prefills the thank box on torrent pages. A number or max; empty starts at zero."
          credit="MAM+ by GardenShade"
        />
        <AmountRow
          kind="gift"
          max={MAX_GIFT}
          title="Default gift amount"
          note="Prefills the gift dialog on every gift button. A number or max; empty follows the GiftMAM widget."
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
