const assert = require('assert');
const S = require('../www/srs.js');
global.window = {}; require('../www/questions.js'); const Q = window.QUESTIONS;
const now = Date.UTC(2026, 10, 20, 10);
// grade
let s = S.grade(null, true, now); assert.equal(s.b, 2); assert.equal(s.d, now + 3 * S.DAY);
s = S.grade(s, true, now); assert.equal(s.b, 3);
s = S.grade(s, false, now); assert.equal(s.b, 0); assert.equal(s.w, 1); assert(s.d > now);
// session: fresh questions when empty
let p = {}; let ses = S.pickSession(Q, p, 5, { now });
assert.equal(ses.length, 5); assert.equal(new Set(ses.map(q => q.id)).size, 5);
// due reviews come first
p = {}; Q.slice(0, 10).forEach(q => p[q.id] = { b: 1, d: now - 1, s: 1, w: 0 });
ses = S.pickSession(Q, p, 5, { now });
assert.equal(ses.filter(q => p[q.id]).length, 3, 'max 60% reviews');
// topic filter
ses = S.pickSession(Q, {}, 7, { now, topic: 'signs' }); assert(ses.every(q => q.t === 'signs'));
// mistakes
p = { [Q[0].id]: { b: 0, d: now, s: 1, w: 1 } };
ses = S.pickSession(Q, p, 5, { now, mistakes: true }); assert.equal(ses.length, 1);
// everything learned -> still returns n
p = {}; Q.forEach(q => p[q.id] = { b: 5, d: now + 9e9, s: 3, w: 0 });
assert.equal(S.pickSession(Q, p, 5, { now }).length, 5);
assert.equal(S.readiness(Q, p), 1); assert.equal(S.readiness(Q, {}), 0);
// exam
const ex = S.pickExam(Q, 30); assert.equal(ex.length, 30); assert.equal(new Set(ex.map(q => q.id)).size, 30);
// option order pins "all answers"
const qa = Q.find(q => q.o.some(o => /כל התשובות/.test(o)));
for (let k = 0; k < 20; k++) { const o = S.optionOrder(qa); assert(/כל התשובות/.test(qa.o[o[o.length - 1]])); assert.equal(new Set(o).size, qa.o.length); }
// streak
let st = S.updateStreak(null, now); assert.equal(st.streak, 1);
st = S.updateStreak(st, now + 3600e3); assert.equal(st.streak, 1);
st = S.updateStreak(st, now + S.DAY); assert.equal(st.streak, 2);
assert.equal(S.currentStreak(st, now + 4 * S.DAY), 0);
// data integrity
Q.forEach(q => { assert(q.q && q.o.length >= 2 && q.c >= 0 && q.c < q.o.length, q.id); });
const fs = require('fs'); Q.filter(q => q.img).forEach(q => assert(fs.existsSync('www/img/' + q.img), q.img));
// smart stats (topic-sampled)
let ss = S.stats(Q, {}, now);
assert.equal(ss.readiness, 0); assert.equal(ss.known, 0);
assert(Math.abs(S.binomTail(30, 0.5, 0) - 1) < 1e-9);
assert(Math.abs(S.binomTail(30, 1, 26) - 1) < 1e-9);
// one topic fully known (big sample) -> readiness ~ that topic's share, other topics 0
const signs = Q.filter(q => q.t === 'signs');
let pt = {}; signs.slice(0, 60).forEach(q => pt[q.id] = { b: 4, d: now + 9 * S.DAY, s: 3, w: 0 });
const st1 = S.stats(Q, pt, now);
const share = signs.length / Q.length;
assert(st1.readiness > share * 0.9 && st1.readiness <= share, 'one topic ≈ its share');
assert.equal(st1.topics.laws.score, 0);
// a mistake in that topic lowers readiness
pt[signs[0].id] = S.grade(pt[signs[0].id], false, now);
assert(S.stats(Q, pt, now).readiness < st1.readiness);
// small samples don't give 100%
let p2 = {}; Q.filter(q => q.t === 'vehicle').slice(0, 2).forEach(q => p2[q.id] = S.grade(null, true, now));
assert(S.stats(Q, p2, now).topics.vehicle.score < 0.5);
// forgetting lowers it
assert(S.stats(Q, pt, now + 90 * S.DAY).readiness < S.stats(Q, pt, now).readiness);
// weekly gain
let h = S.recordHistory({}, 10, now - 10 * S.DAY); h = S.recordHistory(h, 30, now - 8 * S.DAY); h = S.recordHistory(h, 55, now);
assert.equal(S.weeklyGain(h, 55, now), 25);
assert.equal(S.weeklyGain(S.recordHistory({}, 12, now), 12, now), 12);
// sign dictionary coverage: every sign number used as an answer option has a meaning (except a few unclear ones)
global.window.SIGNS = undefined; require('../www/signs.js'); const SG = global.window.SIGNS;
const optNums = new Set(); Q.forEach(q => q.o.forEach(o => { const m = o.trim().match(/^(\d{3}פ?)\.?$/); if (m) optNums.add(m[1]); }));
const missing = [...optNums].filter(n => !SG[n]);
assert(missing.length <= 4, 'missing sign meanings: ' + missing.join(','));
console.log('sign dictionary covers', optNums.size - missing.length, 'of', optNums.size, 'option numbers; missing:', missing.join(',') || '-');
console.log('all tests passed —', Q.length, 'questions');
