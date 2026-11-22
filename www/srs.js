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
    if (firstTime) s.f = correct ? 1 : 0; // תוצאת הניסיון הראשון — משמשת להערכת שאלות שעוד לא נראו
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

  // ---------- הערכה חכמה (לפי מדגם, מחולק לנושאים) ----------
  // הרעיון: לא צריך לעבור על כל המאגר. מספיק מדגם טוב מכל נושא.
  // כל נושא שווה את החלק שלו במבחן. הציון בנושא = כמה אתה יודע את השאלות שנדגמו ממנו.
  // נושא שעוד לא נדגם = 0. טעות מורידה את הציון מיד.
  const EXAM_N = 30, PASS = 26;
  // שווי של שאלה שנדגמה לפי המצב העדכני שלה:
  // 0 = טעית בפעם האחרונה, 0.7 = טעית ואז תיקנת, 0.85 = ידעת פעם אחת, 0.95 = ידעת פעמיים בהפרש ימים, 1 = יציב
  const VALUE = [0, 0.7, 0.85, 0.95, 1, 1];
  // "מדגם קטן" — כמה שאלות דמיוניות שלא ענית נכון מתווספות, כדי ש-2 תשובות נכונות לא ייתנו 100%.
  // 10 מתוך 10 = 77%, 30 מתוך 30 = 91%, 60 מתוך 60 = 95%.
  const SHRINK = 3;

  // ערך השאלה, עם שכחה: חזרה שמתעכבת מורידה חלק מהערך (לא הכול)
  function valueOf(st, now) {
    let v = VALUE[st.b];
    if (st.b > 0 && st.d < now) {
      const late = (now - st.d) / DAY / Math.max(1, INTERVALS[st.b]); // כמה "מרווחים" עברו מאז מועד החזרה
      if (late > 3) v *= 0.6;
      else if (late > 1) v *= 0.8;
    }
    return v;
  }

  // סיכוי להצליח ב-k שאלות לפחות מתוך n, כשכל שאלה בסיכוי p
  function binomTail(n, p, k) {
    let sum = 0;
    for (let i = k; i <= n; i++) {
      let c = 1;
      for (let j = 0; j < i; j++) c = c * (n - j) / (j + 1);
      sum += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
    }
    return Math.min(1, Math.max(0, sum));
  }

  function stats(questions, progress, now = Date.now()) {
    const topics = {};
    let known = 0, mastered = 0, seen = 0;
    for (const q of questions) {
      const t = topics[q.t] || (topics[q.t] = { total: 0, sampled: 0, known: 0, mastered: 0, sum: 0 });
      t.total++;
      const st = progress[q.id];
      if (!st || st.s === 0) continue;
      t.sampled++; seen++;
      t.sum += valueOf(st, now);
      if (st.b >= 2) { t.known++; known++; }
      if (st.b >= 3) { t.mastered++; mastered++; }
    }
    let readiness = 0;
    for (const k of Object.keys(topics)) {
      const t = topics[k];
      t.weight = t.total / questions.length;          // החלק של הנושא במבחן
      t.score = t.sampled ? t.sum / (t.sampled + SHRINK) : 0;   // כמה אתה יודע את הנושא (לפי המדגם)
      t.contribution = t.weight * t.score;            // כמה הנושא תורם למוכנות הכוללת
      readiness += t.contribution;
    }
    return {
      total: questions.length, seen, known, mastered, topics,
      readiness,                                        // מוכנות כוללת = סכום התרומות של הנושאים
      passChance: binomTail(EXAM_N, readiness, PASS)    // הסיכוי לעבור, אם כל שאלה במבחן בסיכוי = המוכנות
    };
  }

  // היסטוריה יומית של כמה שאלות אתה יודע — בשביל קצב התקדמות
  function recordHistory(hist, known, now = Date.now()) {
    const h = Object.assign({}, hist || {});
    h[dayKey(now)] = known;
    const keys = Object.keys(h).sort((a, b) => keyTime(a) - keyTime(b));
    while (keys.length > 60) delete h[keys.shift()];
    return h;
  }
  function keyTime(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  // כמה שאלות נוספו ב-7 הימים האחרונים
  function weeklyGain(hist, known, now = Date.now()) {
    if (!hist) return 0;
    const weekAgo = now - 7 * DAY;
    // הנתון האחרון שנרשם לפני שבוע או קודם; אם התחלת ללמוד השבוע — הבסיס הוא 0
    let base = 0, baseT = -Infinity;
    for (const k of Object.keys(hist)) {
      const t = keyTime(k);
      if (t <= weekAgo && t > baseT) { baseT = t; base = hist[k]; }
    }
    return known - base;
  }

  const api = { DAY, INTERVALS, TOPICS, VALUE, EXAM_N, PASS, shuffle, grade, isDue, pickSession, readiness, pickExam, optionOrder, dayKey, updateStreak, currentStreak, stats, binomTail, recordHistory, weeklyGain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(this);
