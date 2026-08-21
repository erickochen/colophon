// Tailwind declares its --tw-* variables with @property, so they do not inherit.
// Such a rule is ignored inside a shadow tree, where a ring on a container then
// reaches every child that composes a box-shadow. Registering the same rules
// through the document API gives them the behavior they were written for.

interface PropertyRule extends CSSRule {
  name: string
  syntax: string
  inherits: boolean
  initialValue: string | null
}

/** Its value is meant to follow the scheme, which #mam-root sets once and every
 * element below reads by inheriting. Registering it would freeze that at
 * Tailwind's white. */
const KEEP_INHERITING = '--tw-ring-offset-color'

function isPropertyRule(rule: CSSRule): rule is PropertyRule {
  const r = rule as PropertyRule
  return typeof r.name === 'string' && typeof r.syntax === 'string'
}

/** Registers every @property one sheet declares. Safe to call again: a name
 * that is already registered throws and is skipped. */
export function registerSheetProps(sheet: CSSStyleSheet | null): void {
  if (!sheet || typeof CSS?.registerProperty !== 'function') return
  let rules: CSSRuleList
  try {
    rules = sheet.cssRules
  } catch {
    return
  }
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (!isPropertyRule(rule) || rule.name === KEEP_INHERITING) continue
    try {
      CSS.registerProperty({
        name: rule.name,
        syntax: rule.syntax,
        inherits: rule.inherits,
        initialValue: rule.initialValue ?? undefined,
      })
    } catch {
      // Already registered. The sheet keeps working either way.
    }
  }
}

/** The same across every sheet the shadow root holds right now. */
export function registerShadowProps(shadow: ShadowRoot): void {
  for (const sheet of shadow.styleSheets) registerSheetProps(sheet)
}
