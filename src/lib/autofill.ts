/**
 * Attributes for a plain text field that never holds credentials, so a password
 * manager stops offering to fill it. A password or two-factor field leaves
 * these off.
 */
export const NO_AUTOFILL = {
  type: 'text',
  autoComplete: 'off',
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const
