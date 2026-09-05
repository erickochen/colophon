import assert from 'node:assert/strict'
import test from 'node:test'

import { NOTIF_POLL_URL, notifPollBody, parseNotifPoll } from '../src/lib/notif-poll.ts'

// The newest shout id the site handed out on 2026-09-05.
const NEWEST_SHOUT_ID = 9_097_289

test('the poll goes to the shoutbox on the cdn host', () => {
  assert.equal(new URL(NOTIF_POLL_URL).host, 'cdn.myanonamouse.net')
})

test('the poll asks for shouts past the newest, carrying the shoutbox version', () => {
  const body = notifPollBody(15)
  assert.equal(body.get('vid'), '15')
  assert.equal(body.get('loadFrom'), body.get('maxID'))
  assert.equal(body.get('minID'), body.get('maxID'))
  assert.ok(Number(body.get('loadFrom')) > NEWEST_SHOUT_ID)
})

test('counters come out of a poll answer', () => {
  const answer = {
    failure: '',
    notifs: { pms: 2, iCloudRelay: false, aboutToDropClient: 0, tickets: 0, waiting_tickets: 1, requests: 3, topics: 1 },
    friends: false,
    pt: 1788587833.926069,
    id: 9999999999,
  }
  assert.deepEqual(parseNotifPoll(answer), { counts: { pms: 2, topics: 1, tickets: 0, requests: 3 } })
})

test('a reload notice marks the poll refused', () => {
  const answer = { failure: 'Changes made to the shoutbox, please reload the page to continue.' }
  assert.deepEqual(parseNotifPoll(answer), { refused: true })
})

test('an answer without counters reads as nothing', () => {
  assert.equal(parseNotifPoll({ error: 'Request not via correct session type' }), null)
  assert.equal(parseNotifPoll({ failure: '' }), null)
  assert.equal(parseNotifPoll(null), null)
  assert.equal(parseNotifPoll('nope'), null)
})
