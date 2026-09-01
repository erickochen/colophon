// MAM's shoutbox alert words. site.js fetches them from getPings.php, keeps them
// in page globals and wraps a matching shout in a themed CSS class. That class
// lives in MAM's own stylesheet, which never reaches our shadow root, so
// Colophon reads the same words and draws the mark itself.
import { useEffect, useState } from 'react'

export type AlertKey = 'me' | 'staff' | 'siren' | 'beep' | 'silent'

const ALERT_KEYS: AlertKey[] = ['me', 'staff', 'siren', 'beep', 'silent']

/** Hue of every color MAM offers, read from its own stylesheet. Dark Green and
 * Green share a hue because MAM tells those two apart by lightness alone. */
const ALERT_HUE: Record<string, number> = {
  'row1-red': 29,
  'row1-yellow': 110,
  'row1-darkg': 142,
  'row1-green': 142,
  'row1-purple': 303,
  'row1-blue': 245,
}

/** Only the hue of this tint matters. The edge blends it into the scheme's own
 * foreground, so it follows whatever palette is on. */
const TINT_L = 0.65
const TINT_C = 0.16

/** The fill starts from the card, so a marked row keeps the contrast a plain
 * row has. Mixing a tint in instead lifts a dark card toward the words on it.
 * The lightness only steps further from mid gray, which is away from the text
 * on either side, so the row gains contrast as it gains color. */
const FILL_CHROMA = 0.06
const FILL_L_PUSH = 0.12

/** The edge is what makes the mark visible, so it leans on the foreground to
 * clear 3:1 against the card whatever the scheme does. */
const EDGE_TINT = '50%'

/** Why a shout carries the mark, shown on hover. */
export const ALERT_TITLE = 'Matched one of your shoutbox alert words'

/** The same fact for a screen reader, read out ahead of the shout itself. A
 * title on a plain div never reaches one. Hidden text joins the copy when the
 * line is selected, so this rides in a span that refuses selection. */
export const ALERT_LABEL = 'Alert word'

/** getPings.php answers after we mount, so we look again until it lands. */
const POLL_MS = 300
const POLL_TIMEOUT_MS = 20_000

interface PingWindow extends Window {
  shoutboxPingsPrefs?: { uid?: number; color?: string; matches?: Partial<Record<AlertKey, string[]>> }
  shoutboxPings?: Partial<Record<AlertKey, RegExp[]>>
}

export interface AlertMark {
  fill: string
  edge: string
}

export interface ShoutAlerts {
  /** The reader's own uid; MAM never pings you for your own shout. */
  uid: number | null
  /** Null when the reader picked "None", which means no mark at all. */
  mark: AlertMark | null
  patterns: RegExp[]
}

/** Pass a hue for the fill to take. Null falls back to the scheme's brand hue,
 * never to the card's own: half the schemes carry a gray card, whose stored hue
 * is a conversion artifact that would paint an unrelated color. */
function blend(tint: string, hue: number | null): AlertMark {
  return {
    fill: `oklch(from var(--card) calc(l + (l - 0.5) * ${FILL_L_PUSH}) ${FILL_CHROMA} ${hue ?? 'var(--brand-hue)'})`,
    edge: `color-mix(in oklab, ${tint} ${EDGE_TINT}, var(--foreground))`,
  }
}

function markFor(color: string | undefined): AlertMark | null {
  // Empty means the member picked "None", which asks for no mark at all.
  if (!color) return null
  const hue = ALERT_HUE[color] ?? null
  // Brand covers MAM's two "Theme Option" values, which are link colors without
  // a fill of their own. It also covers anything MAM adds later: a color the
  // member asked for deserves a mark rather than silence.
  return hue == null ? blend('var(--brand)', null) : blend(`oklch(${TINT_L} ${TINT_C} ${hue})`, hue)
}

/** Reads what getPings.php delivered. Null while it is still on the way. */
export function readShoutAlerts(target: Window = window): ShoutAlerts | null {
  const raw = (target as PingWindow).shoutboxPingsPrefs
  if (!raw?.matches) return null
  const patterns: RegExp[] = []
  for (const key of ALERT_KEYS) {
    for (const term of raw.matches[key] ?? []) {
      if (!term) continue
      // MAM builds these with the 'g' flag, so test() carries lastIndex from one
      // shout to the next and skips every other match. Ours leave it off.
      try {
        patterns.push(new RegExp(term, 'i'))
      } catch {
        // A term is free text, so it can be an invalid pattern. Skip that one.
      }
    }
  }
  // MAM compares this pair loosely, so the JSON may hand us a string. Settle it
  // here rather than letting a strict check silently mark your own shouts.
  const uid = raw.uid == null ? null : Number(raw.uid)
  return { uid: Number.isFinite(uid) ? uid : null, mark: markFor(raw.color), patterns }
}

/** MAM's own regexes carry the 'g' flag and lose about half their matches to a
 * lingering lastIndex. Its sounds run off those same objects, so drop the flag
 * in place and the pings play as often as they should. */
export function repairMamPings(target: Window = window): void {
  const pings = (target as PingWindow).shoutboxPings
  if (!pings) return
  for (const key of ALERT_KEYS) {
    const list = pings[key]
    if (!list) continue
    pings[key] = list.map((re) => (re.global ? new RegExp(re.source, re.flags.replace(/g/g, '')) : re))
  }
}

/** True when this shout should carry the mark. Pass the name along with the
 * words: MAM tests the whole rendered line, so an alert on someone's name is a
 * normal thing to set. */
export function matchesAlert(alerts: ShoutAlerts | null, text: string, uid: number | null): boolean {
  if (!alerts?.patterns.length) return false
  if (uid != null && alerts.uid != null && uid === alerts.uid) return false
  return alerts.patterns.some((re) => re.test(text))
}

/** The setting lives with the caller so this module stays free of the store.
 * Off means no mark and no repair, leaving MAM's own behavior untouched. */
export function useShoutAlerts(enabled: boolean): ShoutAlerts | null {
  const [alerts, setAlerts] = useState<ShoutAlerts | null>(() => readShoutAlerts())

  useEffect(() => {
    if (!enabled) return
    // Repairing twice costs nothing: a regex without the flag is left alone.
    if (alerts) {
      repairMamPings()
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      const next = readShoutAlerts()
      if (next) {
        setAlerts(next)
        window.clearInterval(timer)
      } else if (Date.now() - started > POLL_TIMEOUT_MS) {
        window.clearInterval(timer)
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [alerts, enabled])

  return enabled ? alerts : null
}
