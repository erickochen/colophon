// MediaInfo hands over its field names the way the library stores them
// (BitRate_Mode, SamplingRate, Audio1). These turn them into words.

/** Names the general rule cannot get right on its own. */
const SPECIAL: Record<string, string> = {
  'channel(s)': 'Channels',
  codecid: 'Codec ID',
  overallbitrate: 'Overall bit rate',
}

/** Acronyms and numbers keep their own casing. */
function keepAsIs(word: string): boolean {
  return /^[A-Z][A-Z0-9]*$/.test(word) || /^\d/.test(word)
}

/** "BitRate_Mode" becomes "Bit rate mode", "Audio1" becomes "Audio 1". */
export function mediaInfoLabel(raw: string): string {
  const trimmed = raw.trim()
  const special = SPECIAL[trimmed.toLowerCase()]
  if (special) return special
  const words = trimmed
    .replace(/_/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return trimmed
  return words
    .map((w, i) => (keepAsIs(w) ? w : i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ')
}

/** Section heading. MediaInfo files the chapter list under menu > extra. */
export function mediaInfoGroupLabel(label: string, parent: string | null): string {
  if (parent?.trim().toLowerCase() === 'menu' && label.trim().toLowerCase() === 'extra') return 'Chapters'
  return mediaInfoLabel(label)
}
