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
console.log('all tests passed —', Q.length, 'questions');
