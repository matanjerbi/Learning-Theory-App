// לוגיקת חזרה מרווחת (Leitner) — בלי תלות ב-DOM, כדי שאפשר יהיה לבדוק אותה ב-node.
(function (root) {
  const DAY = 24 * 60 * 60 * 1000;
  // כמה ימים עד החזרה הבאה לפי "קופסה"
  const INTERVALS = [0, 1, 3, 7, 16, 35];
  const BOX_WEIGHT = [0, 0.25, 0.5, 0.8, 1, 1];
  const TOPICS = {
    laws: 'חוקי התנועה',
    signs: 'תמרורים',
    safety: 'בטיחות',
    vehicle: 'הכרת הרכב'
  };

  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // עדכון מצב שאלה אחרי תשובה
  function grade(state, correct, now = Date.now()) {
    const s = Object.assign({ b: 0, d: 0, s: 0, w: 0, l: 0 }, state || {});
    const firstTime = s.s === 0;
    s.s += 1;
    s.l = now;
    if (correct) {
      // ידע כבר בפעם הראשונה — מדלגים קדימה
      s.b = firstTime ? 2 : Math.min(s.b + 1, 5);
      s.d = now + INTERVALS[s.b] * DAY;
    } else {
      s.w += 1;
      s.b = 0;
      s.d = now + 10 * 60 * 1000; // חוזרת בסבב הבא (ובאותו סבב עוד 2 שאלות)
    }
    return s;
  }

  function isDue(st, now) { return st && st.s > 0 && st.d <= now; }

  // בחירת שאלות לסבב: קודם מה שמחכה לחזרה, אחר כך חדשות, בערבוב
  function pickSession(questions, progress, n, opts = {}) {
    const now = opts.now || Date.now();
    const rnd = opts.rnd || Math.random;
    let pool = questions;
    if (opts.topic) pool = pool.filter(q => q.t === opts.topic);
    if (opts.mistakes) pool = pool.filter(q => progress[q.id] && progress[q.id].w > 0 && progress[q.id].b < 3);

    const due = pool.filter(q => isDue(progress[q.id], now))
      .sort((a, b) => progress[a.id].d - progress[b.id].d);
    const fresh = shuffle(pool.filter(q => !progress[q.id] || progress[q.id].s === 0), rnd);

    let chosen;
    if (opts.mistakes) {
      chosen = shuffle(pool, rnd).slice(0, n);
    } else {
      // עד ~60% חזרות, השאר חדשות — כדי שתמיד תהיה תחושת התקדמות
      const maxDue = Math.max(1, Math.ceil(n * 0.6));
      chosen = due.slice(0, maxDue);
      chosen = chosen.concat(fresh.slice(0, n - chosen.length));
      if (chosen.length < n) chosen = chosen.concat(due.slice(maxDue, maxDue + n - chosen.length));
      if (chosen.length < n) {
        // הכול כבר נלמד ולא מחכה — לוקחים את מה שהכי קרוב לחזרה
        const rest = pool.filter(q => !chosen.includes(q))
          .sort((a, b) => (progress[a.id]?.d || 0) - (progress[b.id]?.d || 0));
        chosen = chosen.concat(rest.slice(0, n - chosen.length));
      }
    }
    return shuffle(chosen, rnd);
  }

  function readiness(questions, progress, topic) {
    const pool = topic ? questions.filter(q => q.t === topic) : questions;
    if (!pool.length) return 0;
    let sum = 0;
    for (const q of pool) {
      const st = progress[q.id];
      if (st && st.s > 0) sum += BOX_WEIGHT[st.b];
    }
    return sum / pool.length;
  }

  // מבחן דמה: 30 שאלות, באותו יחס נושאים כמו המאגר
  function pickExam(questions, n = 30, rnd = Math.random) {
    const byTopic = {};
    for (const q of questions) (byTopic[q.t] = byTopic[q.t] || []).push(q);
    const keys = Object.keys(byTopic);
    let out = [];
    let left = n;
    keys.forEach((k, i) => {
      const cnt = i === keys.length - 1 ? left : Math.round(n * byTopic[k].length / questions.length);
      out = out.concat(shuffle(byTopic[k], rnd).slice(0, cnt));
      left -= cnt;
    });
    return shuffle(out, rnd).slice(0, n);
  }

  // סדר תשובות מעורבב, אבל "כל התשובות..." נשארת אחרונה
  function optionOrder(q, rnd = Math.random) {
    const idx = q.o.map((_, i) => i);
    const pinned = idx.filter(i => /כל התשובות|אף אחת/.test(q.o[i]));
    const free = shuffle(idx.filter(i => !pinned.includes(i)), rnd);
    return free.concat(pinned);
  }

  function dayKey(ts = Date.now()) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function updateStreak(st, now = Date.now()) {
    const s = Object.assign({ streak: 0, last: '' }, st || {});
    const today = dayKey(now);
    if (s.last === today) return s;
    const yesterday = dayKey(now - DAY);
    s.streak = s.last === yesterday ? s.streak + 1 : 1;
    s.last = today;
    return s;
  }

  function currentStreak(st, now = Date.now()) {
    if (!st) return 0;
    if (st.last === dayKey(now) || st.last === dayKey(now - DAY)) return st.streak;
    return 0;
  }

  const api = { DAY, INTERVALS, TOPICS, shuffle, grade, isDue, pickSession, readiness, pickExam, optionOrder, dayKey, updateStreak, currentStreak };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(this);
