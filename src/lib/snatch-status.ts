// MAM names its snatch piles by stacking states: "Not Seeding - H&R - Not Yet
// Satisfied". Reading them lives here alone, so every page says the same thing
// about a pile. Importing nothing keeps the module reachable from node --test.

/** How much a pile asks of the reader, from "act now" to "nothing to do". */
export type BucketGroup = 'quota' | 'attention' | 'running' | 'settled' | 'other'

export type BadgeTone = 'ok' | 'warn' | 'muted'

export interface PileFlags {
  /** Whether the name talks about seed rules at all. Without that word no
   * sentence about them is true, so the reading stays neutral. */
  rules: boolean
  /** The pile MAM names "Unsatisfied", which owes seed time either way. */
  unsatisfied: boolean
  leeching: boolean
  seeding: boolean
  satisfied: boolean
  hnr: boolean
  upload: boolean
  /** The account cap row ("150 limit"), which is a number rather than a pile. */
  cap: boolean
  /** The range some piles carry: "active in the last 24 hours". */
  scope: string | null
}

/** Some pile names carry a scope on the end: "(active in the last 7 days)",
 * "with 5 or fewer seeders". The account cap says a number instead, so that one
 * is not a scope. */
const SCOPE = /\s*(?:\(([^)]*)\)|with\s+(.+?))\s*$/i

export function readPile(label: string): PileFlags {
  const s = label.toLowerCase().replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const found = SCOPE.exec(label)
  const tail = found ? (found[1] ?? found[2]).trim() : null
  // The word anywhere in the name marks the cap row, whichever way MAM writes
  // the number. A scope carrying it is that number rather than a range.
  const cap = /\blimit\b/.test(s)
  return {
    rules: s.includes('satisfied'),
    unsatisfied: s.includes('unsatisfied'),
    leeching: s.includes('leeching'),
    // Read from the whole name: a scope can hold the only word that names the
    // state ("Seeding with 5 or fewer seeders").
    seeding: !s.includes('not seeding') && !s.includes('inactive') && !s.includes('leeching'),
    satisfied: s.includes('satisfied') && !s.includes('unsatisfied') && !s.includes('not yet satisfied'),
    hnr: s.includes('h&r'),
    upload: s.includes('upload'),
    cap,
    scope: cap ? null : tail,
  }
}

/** The pile heading straight from its name, for callers holding only the name. */
export function pileHeading(label: string): { group: BucketGroup; text: string } {
  return pileGroup(readPile(label), label)
}

/** The pile as a heading: which group it belongs under plus a sentence for it. */
export function pileGroup(f: PileFlags, label: string): { group: BucketGroup; text: string } {
  const read = groupOf(f, label)
  // A name we could not read keeps MAM's own wording, scope included.
  return f.scope && read.group !== 'other' ? { ...read, text: `${read.text} (${f.scope})` } : read
}

function groupOf(f: PileFlags, label: string): { group: BucketGroup; text: string } {
  if (f.leeching) return { group: 'running', text: 'Downloading now' }
  const where = f.seeding ? 'Seeding' : 'Stopped'
  if (f.upload) return { group: 'settled', text: `Your uploads, ${f.seeding ? 'seeding' : 'stopped'}` }
  if (f.hnr) return { group: 'attention', text: `${where}, hit and run risk` }
  // "Unsatisfied" on its own is the whole pile that still owes seed time. The
  // one carrying a limit is the account cap rather than a pile.
  if (f.unsatisfied) {
    if (f.cap) return { group: 'quota', text: 'Unsatisfied' }
    return { group: 'attention', text: f.seeding ? 'Not satisfied yet' : 'Stopped, not satisfied' }
  }
  // Past this point the sentence talks about seed rules, so a name that never
  // mentions them keeps MAM's own wording rather than a guess.
  if (!/satisfied/i.test(label)) return { group: 'other', text: label }
  if (!f.satisfied) {
    return f.seeding
      ? { group: 'running', text: 'Seeding, rules not met yet' }
      : { group: 'attention', text: 'Stopped before the rules were met' }
  }
  return { group: 'settled', text: `${where}, rules met` }
}

/** The pile as a row badge: how this member stands with one torrent. */
export function pileBadge(f: PileFlags): { text: string; tone: BadgeTone } {
  if (f.leeching) return { text: 'Downloading', tone: 'muted' }
  if (f.upload) return f.seeding ? { text: 'Seeding', tone: 'ok' } : { text: 'Your upload', tone: 'muted' }
  // A name that never mentions the rules cannot claim anything about them. What
  // it does say is that this torrent is on the account.
  if (!f.rules) return { text: f.seeding ? 'Seeding' : 'Have it', tone: f.seeding ? 'ok' : 'muted' }
  if (!f.satisfied) return { text: 'Seed more', tone: 'warn' }
  return f.seeding ? { text: 'Seeding', tone: 'ok' } : { text: 'Satisfied', tone: 'muted' }
}
