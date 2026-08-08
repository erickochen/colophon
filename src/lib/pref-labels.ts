// Reader-facing names for MAM preference fields whose own labels describe the
// mechanism instead of the effect. Keyed by input name; site vocabulary
// (Passkey, FL wedge, VIP, Shoutbox) keeps MAM's wording.
export interface LabelRewrite {
  title: string
  /** Render the switch flipped: ON means the pleasant reading of the setting
   * ("Rich text editor" on) while the underlying field stores the disable. */
  invert?: boolean
}

export const PREF_LABELS: Record<string, LabelRewrite> = {
  disableWysiwyg: { title: 'Rich text editor', invert: true },
  acceptpms: { title: 'Who can message you' },
  deletepms: { title: 'Delete the original message' },
  savepms: { title: 'Keep a copy in your sent box' },
  pmnotif: { title: 'Email me when a message arrives' },
  displayVIPexpire: { title: 'VIP expiry warning' },
  info: { title: 'About you' },
  uploaderNameVisibility: { title: 'Who can see your uploads' },
  requesterNameVisibility: { title: 'Who can see your requests' },
  imageResize: { title: 'Resize oversized images on hover' },
  sbImageResize: { title: 'Resize oversized images on hover' },
}

/** Same idea for read-only rows, keyed by MAM's own row label. */
export const STATIC_LABELS: Record<string, string> = {
  'Tracker HTTPS': 'Tracker connection',
}

export function rewriteFor(name: string | undefined): LabelRewrite | null {
  return (name && PREF_LABELS[name]) || null
}
