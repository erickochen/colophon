import assert from 'node:assert/strict'
import test from 'node:test'

import { matchesAlert, readShoutAlerts, repairMamPings } from '../src/lib/shout-alerts.ts'

const MY_UID = 282949

function fakeWindow(color, matches) {
  return { shoutboxPingsPrefs: { uid: MY_UID, color, matches } }
}

test('an account without alert words yields no patterns', () => {
  // What getPings.php actually answers on an empty account.
  const alerts = readShoutAlerts(fakeWindow('', { me: [''], staff: [''], siren: [''], beep: [''], silent: [''] }))
  assert.deepEqual(alerts.patterns, [])
  assert.equal(alerts.mark, null)
})

test('words from every list count, whatever sound they carry', () => {
  const alerts = readShoutAlerts(fakeWindow('row1-yellow', { me: ['eric'], siren: ['raid'], silent: ['quiet'] }))
  assert.equal(alerts.patterns.length, 3)
  assert.ok(matchesAlert(alerts, 'someone raid the shelves', 1))
  assert.ok(matchesAlert(alerts, 'stay quiet please', 1))
})

test('a term that is not a valid pattern is skipped, the rest survive', () => {
  const alerts = readShoutAlerts(fakeWindow('row1-red', { me: ['good', '[unclosed', 'also good'] }))
  assert.equal(alerts.patterns.length, 2)
})

test('matching repeats, unlike MAM which drops every other hit', () => {
  const alerts = readShoutAlerts(fakeWindow('row1-red', { me: ['mouse'] }))
  for (const line of ['a mouse here', 'a mouse there', 'mouse mouse', 'one more mouse']) {
    assert.ok(matchesAlert(alerts, line, 1), line)
  }
})

test('your own shout never carries the mark', () => {
  const alerts = readShoutAlerts(fakeWindow('row1-red', { me: ['mouse'] }))
  assert.equal(matchesAlert(alerts, 'my own mouse', MY_UID), false)
  assert.ok(matchesAlert(alerts, 'their mouse', 1))
})

test('the picked color decides the hue, None means no mark', () => {
  assert.match(readShoutAlerts(fakeWindow('row1-blue', { me: ['x'] })).mark.fill, /245/)
  assert.match(readShoutAlerts(fakeWindow('row1-purple', { me: ['x'] })).mark.fill, /303/)
  assert.equal(readShoutAlerts(fakeWindow('', { me: ['x'] })).mark, null)
})

test('the two theme options follow brand, having no fill of their own', () => {
  for (const color of ['yellow', 'red']) {
    const mark = readShoutAlerts(fakeWindow(color, { me: ['x'] })).mark
    assert.match(mark.edge, /var\(--brand\)/)
    // Half the schemes carry a gray card, whose stored hue is a conversion
    // artifact, so the fill takes the scheme's brand hue rather than that.
    assert.match(mark.fill, /var\(--brand-hue\)\)$/)
    assert.doesNotMatch(mark.fill, /\sh\)$/)
  }
})

test('a color we do not know still gets a mark', () => {
  // MAM could add one; a member who picked a highlight should see something.
  const mark = readShoutAlerts(fakeWindow('row1-teal', { me: ['x'] })).mark
  assert.match(mark.edge, /var\(--brand\)/)
})

test('the fill starts from the card rather than mixing a tint in', () => {
  // Mixing a lighter tint into a dark card lifts it toward the words on it,
  // which costs a marked row the contrast a plain row has. Stepping further
  // from mid gray moves away from the text on either side instead.
  const mark = readShoutAlerts(fakeWindow('row1-blue', { me: ['x'] })).mark
  assert.match(mark.fill, /^oklch\(from var\(--card\) calc\(l \+ \(l - 0\.5\) \* [\d.]+\) [\d.]+ 245\)$/)
})

test('a uid arriving as a string still shields your own shouts', () => {
  const alerts = readShoutAlerts({ shoutboxPingsPrefs: { uid: String(MY_UID), color: 'row1-red', matches: { me: ['mouse'] } } })
  assert.equal(alerts.uid, MY_UID)
  assert.equal(matchesAlert(alerts, 'my own mouse', MY_UID), false)
})

test('the mark leans on the scheme, so every palette stays readable', () => {
  const mark = readShoutAlerts(fakeWindow('row1-red', { me: ['x'] })).mark
  // The fill blends into the card, the edge into the foreground it must clear.
  assert.match(mark.fill, /var\(--card\)/)
  assert.match(mark.edge, /var\(--foreground\)/)
})

test('a case insensitive word matches whatever the shout uses', () => {
  const alerts = readShoutAlerts(fakeWindow('row1-red', { me: ['Colophon'] }))
  assert.ok(matchesAlert(alerts, 'have you tried colophon', 1))
})

test('nothing arrives until getPings.php answers', () => {
  assert.equal(readShoutAlerts({}), null)
  assert.equal(readShoutAlerts({ shoutboxPingsPrefs: { uid: MY_UID } }), null)
})

test("MAM's own regexes lose the g flag so its sounds stop skipping", () => {
  const target = { shoutboxPings: { me: [new RegExp('mouse', 'gi')], silent: [] } }
  repairMamPings(target)
  const re = target.shoutboxPings.me[0]
  assert.equal(re.global, false)
  assert.equal(re.ignoreCase, true)
  for (const line of ['a mouse here', 'a mouse there', 'mouse mouse']) {
    assert.ok(re.test(line), line)
  }
})

test('repairing runs safely before the globals exist', () => {
  assert.doesNotThrow(() => repairMamPings({}))
})
