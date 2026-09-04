import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const page = (name) => readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'pages', name), 'utf8')
const source = page('browse.tsx')

/** Tailwind spacing: one step is a quarter of a rem. */
const STEP_REM = 0.25

const number = (re, what) => {
  const m = re.exec(source)
  assert.ok(m, `could not find ${what} in browse.tsx`)
  return Number(m[1])
}

/** Both sides of the horizontal padding on a row, in rem. It is the one term in
 * the sum that follows the root font size, so the query carries it as rem. */
function rowPaddingRem(text, rowClass) {
  const line = new RegExp(`'[^']*${rowClass}[^']*'`).exec(text)
  assert.ok(line, `could not find a row class holding ${rowClass}`)
  const m = /\bpx-(\d+)\b/.exec(line[0])
  assert.ok(m, 'could not find the row padding')
  return 2 * Number(m[1]) * STEP_REM
}

/** Pages whose rows read the width of their card, with the one breakpoint each
 * is still allowed to carry outside that card. */
const CONTAINED = [
  { file: 'browse.tsx', allowed: [] },
  // ZipMatrix sits in a card of its own, past the list.
  { file: 'snatched.tsx', allowed: ['sm:size-7'] },
]

test('a contained list keeps its card as the container', () => {
  for (const { file } of CONTAINED) {
    const text = page(file)
    const cards = [...text.matchAll(/<Card className="([^"]*)"/g)].map((m) => m[1])
    assert.ok(
      cards.some((c) => c.split(/\s+/).includes('@container')),
      `${file} has no @container on a card, so every @[...] query in it is dead`
    )
  }
})

// A row that switches on the window breaks the moment the sidebar makes the
// list narrow on a wide screen, which is what the container queries answer.
test('a contained list switches on its card, never on the window', () => {
  for (const { file, allowed } of CONTAINED) {
    const text = page(file)
    const found = [...text.matchAll(/(?<![\w@[])(sm|md|lg|xl):[\w[\]()%.,#/-]+/g)]
      .map((m) => m[0])
      .filter((c) => !allowed.includes(c))
    assert.deepEqual(found, [], `${file} still switches on the window: ${found.join(', ')}`)
  }
})

/** The gallery lives in the same card, so it brings its own thresholds. */
function galleryClasses() {
  const m = /const GALLERY_GRID =([\s\S]*?)\n\n/.exec(source)
  assert.ok(m, 'could not find the gallery grid')
  return m[1]
}

/** What the widest row asks for: every fixed track plus the gaps between them.
 * A row is checkbox, cover, title, numbers plus actions. */
function widestFixedTracks() {
  const gap = number(/'group grid items-start gap-x-\[(\d+)px\]/, 'the row gap')
  const cover = number(/'(\d+)px', `minmax\(/, 'the cover track')
  const check = number(/selectable \? '(\d+)px' : ''/, 'the checkbox track')
  const size = number(/const ROW_ACTION_SIZE = (\d+)/, 'the action size')
  const actionGap = number(/const ROW_ACTION_GAP = (\d+)/, 'the action gap')

  const stats = [...source.matchAll(/track: '(\d+)px'/g)].map((m) => Number(m[1]))
  assert.ok(stats.length > 0, 'expected columns with a track')
  // The numbers sit in one nested grid, so they carry their own gaps.
  const statsBlock = stats.reduce((a, b) => a + b, 0) + (stats.length - 1) * gap

  // Every action a row can show: the two that are always there, plus one per
  // option the page offers.
  const body = /const actionSlots = \([^)]*\) =>\n\s*(\d+)([^\n]*)/.exec(source)
  assert.ok(body, 'could not find the action slots in browse.tsx')
  const slots = Number(body[1]) + (body[2].match(/\? 1 : 0/g) ?? []).length
  const lane = slots * size + (slots - 1) * actionGap

  // One gap between every track rowTracks can emit.
  const tracks = /function rowTracks\([^)]*\): string \{\n\s*return \[([^\]]*)\]/.exec(source)
  assert.ok(tracks, 'could not find the row tracks')
  // Commas inside minmax() are not track separators.
  const columns = tracks[1].replace(/\([^)]*\)/g, '').split(',').length
  return check + cover + statsBlock + lane + (columns - 1) * gap
}

test('the row switches to columns only once they fit', () => {
  const floor = number(/const ROW_TITLE_MIN = (\d+)/, 'the title floor')
  const needed = widestFixedTracks() + floor

  // The gallery in the same card carries its own thresholds, so those come out
  // first: what is left has to be the one the row switches on.
  const gallery = galleryClasses()
  const rowThresholds = [...source.matchAll(/@\[calc\((\d+)px\+(\d+)rem\)\]/g)].filter(
    (m) => !gallery.includes(m[0])
  )
  assert.ok(rowThresholds.length > 0, 'expected a container query threshold on the row')
  const unique = new Set(rowThresholds.map((m) => `${m[1]}+${m[2]}`))
  assert.equal(unique.size, 1, `every row class needs one threshold, found ${[...unique].join(', ')}`)

  const [, px, rem] = rowThresholds[0]
  assert.equal(
    Number(rem),
    rowPaddingRem(source, 'group grid items-start'),
    'the rem term has to match the row padding, otherwise the threshold drifts with the text size'
  )
  assert.ok(
    Number(px) >= needed,
    `the widest row needs ${needed}px plus padding, the query fires at ${px}px plus padding`
  )
})

test('the snatched row switches to columns only once they fit', () => {
  const snatched = page('snatched.tsx')
  const cols = /grid-cols-\[minmax\((\d+(?:\.\d+)?)rem,1fr\)((?:_\d+(?:\.\d+)?rem)+)\]/.exec(snatched)
  assert.ok(cols, 'could not find the snatched column tracks')
  const floor = Number(cols[1])
  const tracks = cols[2].split('_').filter(Boolean).map((t) => Number(t.replace('rem', '')))

  const gap = Number(/@\[[\d.]+rem\]:gap-x-(\d+)/.exec(snatched)?.[1])
  assert.ok(Number.isFinite(gap), 'could not find the snatched row gap')
  const gapRem = gap * STEP_REM
  const paddingRem = rowPaddingRem(snatched, 'transition-colors')

  const fixed = tracks.reduce((a, b) => a + b, 0) + tracks.length * gapRem + paddingRem
  const needed = fixed + floor

  const thresholds = [...snatched.matchAll(/@\[([\d.]+)rem\]:/g)].map((m) => Number(m[1]))
  assert.ok(thresholds.length > 0, 'expected a container query threshold on the snatched row')
  const unique = new Set(thresholds)
  assert.equal(unique.size, 1, `every snatched row class needs one threshold, found ${[...unique].join(', ')}`)

  assert.ok(
    thresholds[0] >= needed,
    `the snatched row needs ${needed}rem, the query fires at ${thresholds[0]}rem`
  )
})

test('a gallery column arrives once a tile can carry its frame', () => {
  const gallery = galleryClasses()
  const gap = Number(/gap-x-\[(\d+)px\]/.exec(gallery)?.[1])
  assert.ok(Number.isFinite(gap), 'could not find the gallery gap')

  // Only the steps that add columns. The narrowest set has no threshold: there
  // the frame gives up width rather than the tile, which is what it is for.
  const steps = []
  for (const m of gallery.matchAll(/@\[calc\((\d+)px\+\d+rem\)\]:grid-cols-(\d+)/g)) {
    const at = m[1]
    const shelf = new RegExp(`@\\[calc\\(${at}px\\+\\d+rem\\)\\]:\\[--shelf:(\\d+)px\\]`).exec(gallery)
    assert.ok(shelf, `the step at ${at}px sets columns without a shelf`)
    steps.push({ threshold: Number(at), columns: Number(m[2]), shelf: Number(shelf[1]) })
  }
  assert.ok(steps.length > 0, 'expected the gallery to add columns as it widens')

  // A calc() threshold is ordered as text in the sheet, so a step that grows a
  // digit would be emitted ahead of a narrower one plus lose to it.
  const widths = steps.map((s) => s.threshold)
  assert.deepEqual(
    [...widths].sort((a, b) => String(a).localeCompare(String(b))),
    [...widths].sort((a, b) => a - b),
    'the steps read in a different order than they are written, so the widest one would not win'
  )

  // How wide a frame stands on its shelf, read off the tile rather than
  // repeated here: the two have to move together.
  const ratio = /w-\[min\(100%,calc\(var\(--shelf\)\*(\d+)\/(\d+)\)\)\]/.exec(source)
  assert.ok(ratio, 'could not find the frame width on a gallery tile')

  for (const { threshold, columns, shelf } of steps) {
    // The narrowest a tile may be before the cover starts giving up width.
    const frame = Math.round((shelf * Number(ratio[1])) / Number(ratio[2]))
    const needed = columns * frame + (columns - 1) * gap
    assert.ok(
      threshold >= needed,
      `${columns} columns on a ${shelf}px shelf need ${needed}px, the step fires at ${threshold}px`
    )
  }
})

test('the header lane counts the actions the rows are given', () => {
  // Both read one object, so putting a flag on an action moves the labels with
  // the icons instead of leaving them a column apart.
  const rows = (source.match(/<TorrentRow\b/g) ?? []).length
  const shared = (source.match(/\{\.\.\.rowActions\}/g) ?? []).length
  assert.ok(rows > 0, 'expected the list to render rows')
  assert.equal(shared, rows, 'every row takes the shared action set')
  assert.match(
    source,
    /const headerLane = actionLane\(actionSlots\(!!rowActions\.\w+, !!rowActions\.\w+/,
    'the header lane has to read the same object rather than repeat its own answer'
  )
  assert.doesNotMatch(source, /lane=\{actionLane\(/, 'the header lane belongs beside the actions it counts')
})
