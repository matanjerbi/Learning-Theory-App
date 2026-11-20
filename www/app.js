/* תאוריה בקטנה — לימוד תאוריה לרישיון B, מותאם להפרעות קשב */
(function () {
  'use strict';
  const Q = window.QUESTIONS;
  const QMAP = Object.fromEntries(Q.map(q => [q.id, q]));
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const app = document.getElementById('app');

  // ---------- אחסון ----------
  const store = {
    get(k, def) { try { const v = localStorage.getItem('th.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('th.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  let progress = store.get('progress', {});
  let streak = store.get('streak', null);
  let settings = Object.assign({
    len: 5, fs: 'normal', spacing: false, autoRead: false, rate: 'normal',
    remind: false, remindHour: 19, remindMin: 0, examUnlockedOnce: false
  }, store.get('settings', {}));
  const save = () => { store.set('progress', progress); store.set('streak', streak); store.set('settings', settings); };

  function applyLook() {
    const fs = { normal: '19px', large: '22px', huge: '25px' }[settings.fs] || '19px';
    document.documentElement.style.setProperty('--fs', fs);
    document.documentElement.style.setProperty('--ls', settings.spacing ? '0.08em' : '0');
  }
  applyLook();

  // ---------- עזרים ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = x => Math.round(x * 100);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const PRAISE = ['יפה!', 'בול!', 'מעולה!', 'נכון!', 'אלוף!', 'יש!'];
  const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה'];

  function toast(msg, ms = 2600) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function modal(html, onBind) {
    const m = document.getElementById('modal');
    m.innerHTML = '<div class="card">' + html + '</div>'; m.hidden = false;
    m.onclick = e => { if (e.target === m) closeModal(); };
    onBind && onBind(m);
  }
  function closeModal() { const m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; }

  function haptic(kind) {
    try {
      if (P.Haptics) {
        if (kind === 'ok') P.Haptics.impact({ style: 'LIGHT' });
        else P.Haptics.notification({ type: 'ERROR' });
      } else if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 20 : [40, 60, 40]);
    } catch (e) { /* ignore */ }
  }

  // ---------- הקראה ----------
  const speech = {
    rate() { return settings.rate === 'slow' ? 0.75 : 0.95; },
    async speak(text) {
      await this.stop();
      const clean = text.replace(/\s+/g, ' ').trim();
      try {
        if (P.TextToSpeech) {
          await P.TextToSpeech.speak({ text: clean, lang: 'he-IL', rate: this.rate(), pitch: 1.0, volume: 1.0, category: 'playback' });
          return true;
        }
        if ('speechSynthesis' in window) {
          return await new Promise(res => {
            const u = new SpeechSynthesisUtterance(clean);
            u.lang = 'he-IL'; u.rate = this.rate();
            u.onend = () => res(true); u.onerror = () => res(false);
            speechSynthesis.speak(u);
          });
        }
      } catch (e) {
        toast('לא הצלחתי להקריא. כדאי לוודא שמותקן במכשיר קול בעברית (הגדרות ← שפה ← המרת טקסט לדיבור).', 4500);
        return false;
      }
      toast('אין הקראה במכשיר הזה');
      return false;
    },
    async stop() {
      try {
        if (P.TextToSpeech) await P.TextToSpeech.stop();
        else if ('speechSynthesis' in window) speechSynthesis.cancel();
      } catch (e) { /* ignore */ }
    }
  };
  function questionSpeech(q, order) {
    let s = q.q + '. ';
    if (q.img) s += 'יש תמונה בשאלה. ';
    order.forEach((oi, i) => { s += 'תשובה ' + (i + 1) + ': ' + q.o[oi] + '. '; });
    return s;
  }

  // ---------- ניווט ----------
  let screen = 'home';
  let cleanup = null;
  function go(name, arg) {
    if (cleanup) { cleanup(); cleanup = null; }
    speech.stop();
    screen = name;
    window.scrollTo(0, 0);
    ({ home: renderHome, session: startSession, exam: startExam, settings: renderSettings, info: renderInfo, topics: renderTopics, audio: startAudio }[name])(arg);
  }
  if (P.App) {
    P.App.addListener('backButton', () => {
      if (!document.getElementById('modal').hidden) return closeModal();
      if (screen === 'home') P.App.exitApp();
      else if (screen === 'session' || screen === 'exam' || screen === 'audio') confirmQuit();
      else go('home');
    });
  }
  function confirmQuit() {
    modal('<h2>לצאת מהסבב?</h2><p class="muted">מה שענית עד עכשיו כבר נשמר.</p>' +
      '<button class="btn" id="m-stay">להמשיך</button><button class="btn ghost" id="m-quit">לצאת</button>', m => {
      m.querySelector('#m-stay').onclick = closeModal;
      m.querySelector('#m-quit').onclick = () => { closeModal(); go('home'); };
    });
  }

  // ---------- מסך בית ----------
  function renderHome() {
    const ready = SRS.readiness(Q, progress);
    const st = SRS.currentStreak(streak);
    const dueCount = Q.filter(q => SRS.isDue(progress[q.id], Date.now())).length;
    const mistakes = Q.filter(q => progress[q.id] && progress[q.id].w > 0 && progress[q.id].b < 3).length;
    const seen = Q.filter(q => progress[q.id] && progress[q.id].s > 0).length;

    app.innerHTML = `
      <div class="top">
        <button class="iconbtn" id="b-settings" aria-label="הגדרות">⚙︎</button>
        <span class="streak">${st ? '🔥 ' + st + (st === 1 ? ' יום' : ' ימים') + ' ברצף' : ''}</span>
        <button class="iconbtn" id="b-info" aria-label="מידע">ⓘ</button>
      </div>
      <h1>תאוריה בקטנה</h1>
      <p class="muted">${seen === 0 ? 'כמה דקות ביום. שאלה אחת בכל פעם.' : dueCount ? dueCount + ' שאלות מחכות לחזרה' : 'אין חזרות שמחכות — אפשר ללמוד חדשות'}</p>

      <button class="btn big" id="b-go">▶ תן לי משהו</button>
      <p class="muted center">${settings.len} שאלות · בערך ${Math.max(1, Math.round(settings.len * 0.6))} דקות</p>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-end">
          <div><div class="muted">כמה אני מוכן למבחן</div><div class="ready-num">${pct(ready)}%</div></div>
          <button class="btn ghost small" style="width:auto;margin:0" id="b-topics">לפי נושאים</button>
        </div>
        <div class="bar"><i style="width:${pct(ready)}%"></i></div>
      </div>

      ${mistakes ? `<button class="btn ghost" id="b-mist">🔁 לתרגל טעויות (${mistakes})</button>` : ''}
      <button class="btn ghost" id="b-audio">🎧 תרגול בשמע</button>
      <button class="btn ghost" id="b-exam">📝 מבחן דמה (30 שאלות)</button>
    `;
    app.querySelector('#b-go').onclick = () => go('session', {});
    app.querySelector('#b-topics').onclick = () => go('topics');
    app.querySelector('#b-settings').onclick = () => go('settings');
    app.querySelector('#b-info').onclick = () => go('info');
    app.querySelector('#b-audio').onclick = () => go('audio', {});
    app.querySelector('#b-exam').onclick = () => examGate(ready);
    const bm = app.querySelector('#b-mist'); if (bm) bm.onclick = () => go('session', { mistakes: true });
  }

  function examGate(ready) {
    if (ready >= 0.7 || settings.examUnlockedOnce) return chooseExamMode();
    modal(`<h2>עוד קצת לפני מבחן</h2>
      <p>מבחן מלא שווה יותר כשהמוכנות מעל 70%. כרגע: <b>${pct(ready)}%</b>.</p>
      <p class="muted">אין לחץ — אפשר גם עכשיו, רק לדעת שהציון עוד לא מייצג.</p>
      <button class="btn" id="m-learn">ללמוד עוד סבב</button>
      <button class="btn ghost" id="m-anyway">בכל זאת להתחיל</button>`, m => {
      m.querySelector('#m-learn').onclick = () => { closeModal(); go('session', {}); };
      m.querySelector('#m-anyway').onclick = () => { settings.examUnlockedOnce = true; save(); closeModal(); chooseExamMode(); };
    });
  }
  function chooseExamMode() {
    modal(`<h2>מבחן דמה</h2><p>30 שאלות, 40 דקות. כדי לעבור צריך 26 נכונות.</p>
      <button class="btn" id="m-reg">מבחן רגיל</button>
      <button class="btn ghost" id="m-aud">🎧 מבחן בשמע (כמו במשרד הרישוי)</button>
      <button class="btn ghost small" id="m-x">ביטול</button>`, m => {
      m.querySelector('#m-reg').onclick = () => { closeModal(); go('exam', { audio: false }); };
      m.querySelector('#m-aud').onclick = () => { closeModal(); go('exam', { audio: true }); };
      m.querySelector('#m-x').onclick = closeModal;
    });
  }

  function renderTopics() {
    const rows = Object.entries(SRS.TOPICS).map(([k, name]) => {
      const r = SRS.readiness(Q, progress, k);
      const n = Q.filter(q => q.t === k).length;
      return `<button class="topic" data-t="${k}"><span class="name">${name}<br><span class="muted">${n} שאלות</span></span>
        <span class="bar"><i style="width:${pct(r)}%"></i></span><span class="pct">${pct(r)}%</span></button>`;
    }).join('');
    app.innerHTML = `<div class="top"><button class="iconbtn" id="b-back">→</button><b>לפי נושאים</b><span style="width:48px"></span></div>
      <p class="muted">לחיצה על נושא מתחילה סבב רק ממנו.</p>${rows}`;
    app.querySelector('#b-back').onclick = () => go('home');
    app.querySelectorAll('.topic').forEach(b => b.onclick = () => go('session', { topic: b.dataset.t }));
  }

  // ---------- סבב לימוד ----------
  function chooseKind(q) {
    const st = progress[q.id];
    if (!st || st.s === 0) return 'mc';               // שאלה חדשה — תמיד אמריקאית
    const r = Math.random();
    if (q.t === 'signs' && q.img && r < 0.3) return 'quick';
    if (r < 0.55 && !q.o.some(o => /כל התשובות/.test(o))) return 'tf';
    return 'mc';
  }

  function startSession(opts) {
    let items = SRS.pickSession(Q, progress, settings.len, { topic: opts.topic, mistakes: opts.mistakes })
      .map(q => ({ q, kind: chooseKind(q), retry: false }));
    if (!items.length) { toast('אין שאלות כאן כרגע 🙂'); return go('home'); }
    const results = [];   // true/false לכל פריט
    let i = 0;
    const readyBefore = SRS.readiness(Q, progress);
    let timerHandle = null;
    cleanup = () => clearTimeout(timerHandle);

    function dots() {
      return '<div class="progress-dots">' + items.map((_, k) =>
        `<i class="${k < results.length ? (results[k] ? 'done' : 'miss') : k === i ? 'now' : ''}"></i>`).join('') + '</div>';
    }
    function header() {
      return `<div class="top"><button class="iconbtn" id="b-x" aria-label="יציאה">✕</button>${dots()}
        <button class="iconbtn" id="b-say" aria-label="הקראה">🔊</button></div>`;
    }
    function bindHeader(sayText) {
      app.querySelector('#b-x').onclick = confirmQuit;
      app.querySelector('#b-say').onclick = () => speech.speak(sayText());
    }
    function imgHtml(q) {
      return q.img ? `<img class="qimg" src="img/${q.img}" alt="תמונה לשאלה" id="qimg">` : '';
    }
    function bindZoom() {
      const im = app.querySelector('#qimg');
      if (im) im.onclick = () => {
        const z = document.createElement('div'); z.className = 'zoom';
        z.innerHTML = `<img src="${im.src}">`; z.onclick = () => z.remove(); document.body.appendChild(z);
      };
    }

    function answered(item, correct, extraHtml) {
      clearTimeout(timerHandle);
      const q = item.q;
      progress[q.id] = SRS.grade(progress[q.id], correct);
      save();
      results.push(correct);
      haptic(correct ? 'ok' : 'bad');
      // טעות — השאלה חוזרת עוד 2 שאלות (פעם אחת), כדי לחזק את הקידוד
      if (!correct && !item.retry) {
        const pos = Math.min(items.length, i + 3);
        items.splice(pos, 0, { q, kind: 'mc', retry: true });
      }
      const why = q.e ? `<div class="why">💡 ${esc(q.e)}</div>` : '';
      const fb = correct
        ? `<div class="feedback ok">${pick(PRAISE)}${why}</div>`
        : `<div class="feedback bad">לא נורא — התשובה הנכונה מסומנת בירוק.${!item.retry ? '<div class="why">היא תחזור עוד רגע.</div>' : ''}${why}</div>`;
      const box = document.createElement('div');
      box.innerHTML = (extraHtml || '') + fb + `<button class="btn" id="b-next">${i + 1 >= items.length ? 'סיום' : 'הבא ←'}</button>`;
      app.appendChild(box);
      app.querySelector('.progress-dots').outerHTML = dots();
      const next = app.querySelector('#b-next');
      next.scrollIntoView({ behavior: 'smooth', block: 'end' });
      next.onclick = () => { speech.stop(); i++; i >= items.length ? finish() : show(); };
    }

    function show() {
      const item = items[i];
      const q = item.q;
      const order = SRS.optionOrder(q);
      if (item.kind === 'tf') return showTF(item, order);
      const kindLabel = item.retry ? '🔁 שוב, כדי שיישאר' : item.kind === 'quick' ? '⚡ זיהוי מהיר' :
        (!progress[q.id] || progress[q.id].s === 0) ? '✨ שאלה חדשה' : SRS.TOPICS[q.t];
      app.innerHTML = header() + `
        <div class="kind">${kindLabel}</div>
        ${item.kind === 'quick' ? '<div class="timer"><i id="tm"></i></div>' : ''}
        <div class="question">${esc(q.q)}</div>${imgHtml(q)}
        <div id="opts">${order.map((oi, k) => `<button class="opt" data-oi="${oi}"><span class="n">${LETTERS[k]}</span><span>${esc(q.o[oi])}</span></button>`).join('')}</div>`;
      bindHeader(() => questionSpeech(q, order));
      bindZoom();
      let locked = false;
      const reveal = (chosen) => {
        locked = true;
        app.querySelectorAll('.opt').forEach(b => {
          const oi = +b.dataset.oi; b.disabled = true;
          if (oi === q.c) b.classList.add('correct');
          else if (oi === chosen) b.classList.add('wrong');
          else b.classList.add('dim');
        });
      };
      app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (locked) return;
        const oi = +b.dataset.oi; reveal(oi); answered(item, oi === q.c);
      });
      if (item.kind === 'quick') {
        const secs = 12;
        const tm = app.querySelector('#tm');
        requestAnimationFrame(() => { tm.style.transitionDuration = secs + 's'; tm.style.width = '0%'; });
        timerHandle = setTimeout(() => {
          if (locked) return;
          reveal(-1);
          answered(item, false, '<div class="feedback bad" style="margin-bottom:0">⏱ נגמר הזמן</div>');
        }, secs * 1000);
      }
      if (settings.autoRead) speech.speak(questionSpeech(q, order));
    }

    function showTF(item, order) {
      const q = item.q;
      const showCorrect = Math.random() < 0.5;
      const wrongs = q.o.map((_, k) => k).filter(k => k !== q.c);
      const cand = showCorrect ? q.c : pick(wrongs);
      app.innerHTML = header() + `
        <div class="kind">✔✘ נכון או לא?</div>
        <div class="question">${esc(q.q)}</div>${imgHtml(q)}
        <div class="muted">התשובה המוצעת:</div>
        <div class="candidate">${esc(q.o[cand])}</div>
        <div class="tf" id="tf"><button class="btn yes" data-v="1">נכון</button><button class="btn no" data-v="0">לא נכון</button></div>`;
      bindHeader(() => q.q + '. התשובה המוצעת: ' + q.o[cand] + '. נכון או לא נכון?');
      bindZoom();
      let locked = false;
      app.querySelectorAll('#tf .btn').forEach(b => b.onclick = () => {
        if (locked) return; locked = true;
        const saidTrue = b.dataset.v === '1';
        const correct = saidTrue === showCorrect;
        app.querySelector('#tf').remove();
        const extra = showCorrect ? '' :
          `<div class="muted">התשובה הנכונה:</div><div class="opt correct"><span>${esc(q.o[q.c])}</span></div>`;
        answered(item, correct, extra);
      });
      if (settings.autoRead) speech.speak(q.q + '. התשובה המוצעת: ' + q.o[cand]);
    }

    function finish() {
      streak = SRS.updateStreak(streak); save();
      // סופרים רק את הניסיון הראשון בכל שאלה
      let firstOk = 0, total = 0;
      items.forEach((it, k) => { if (!it.retry) { total++; if (results[k]) firstOk++; } });
      const readyAfter = SRS.readiness(Q, progress);
      const delta = pct(readyAfter) - pct(readyBefore);
      const st = SRS.currentStreak(streak);
      app.innerHTML = `
        <div class="done-emoji">${firstOk === total ? '🏆' : firstOk >= total / 2 ? '🎉' : '💪'}</div>
        <h1 class="center">סיימת!</h1>
        <div class="big-score">${firstOk}/${total}</div>
        <p class="center">${delta > 0 ? 'המוכנות עלתה ל-' + pct(readyAfter) + '% (+' + delta + ')' : 'מוכנות: ' + pct(readyAfter) + '%'}</p>
        ${st > 1 ? `<p class="center streak">🔥 ${st} ימים ברצף</p>` : ''}
        <div class="grow"></div>
        <button class="btn" id="b-more">עוד סבב</button>
        <button class="btn ghost" id="b-home">מספיק להיום 👋</button>`;
      app.querySelector('#b-more').onclick = () => go('session', opts);
      app.querySelector('#b-home').onclick = () => go('home');
    }

    show();
  }

  // ---------- תרגול בשמע ----------
  // מדמה את מבחן השמע: השאלה מוקראת, עונים במספר 1–4
  function startAudio(opts) {
    const exam = opts.exam || null;
    let items = exam ? exam.items : SRS.pickSession(Q, progress, settings.len, {});
    let i = 0;
    const results = [];
    let alive = true;
    cleanup = () => { alive = false; exam && exam.stopClock && exam.stopClock(); };

    function show() {
      const q = items[i];
      const order = SRS.optionOrder(q);
      app.innerHTML = `
        <div class="top"><button class="iconbtn" id="b-x">✕</button>
          <b>${exam ? 'מבחן בשמע' : 'תרגול בשמע'} · ${i + 1}/${items.length}</b>
          <span class="muted" id="clock" style="min-width:48px">${exam ? exam.clockText() : ''}</span></div>
        <p class="muted center">🎧 מקשיבים, ואז לוחצים על מספר התשובה</p>
        ${q.img ? `<img class="qimg" src="img/${q.img}" alt="תמונה לשאלה">` : ''}
        <details class="card"><summary class="muted">להציג את הטקסט</summary>
          <p><b>${esc(q.q)}</b></p><ol>${order.map(oi => `<li>${esc(q.o[oi])}</li>`).join('')}</ol></details>
        <div class="audio-pad">${order.map((oi, k) => `<button class="btn ghost" data-oi="${oi}">${k + 1}</button>`).join('')}</div>
        <button class="btn" id="b-replay">🔁 להשמיע שוב</button>
        <div id="fb"></div>`;
      app.querySelector('#b-x').onclick = confirmQuit;
      app.querySelector('#b-replay').onclick = () => speech.speak(questionSpeech(q, order));
      if (exam) exam.bindClock(app.querySelector('#clock'));
      let locked = false;
      app.querySelectorAll('.audio-pad .btn').forEach(b => b.onclick = () => {
        if (locked) return; locked = true;
        speech.stop();
        const oi = +b.dataset.oi;
        const correct = oi === q.c;
        if (exam) { exam.answer(q, oi); i++; return i >= items.length ? exam.finish() : show(); }
        progress[q.id] = SRS.grade(progress[q.id], correct); save();
        results.push(correct); haptic(correct ? 'ok' : 'bad');
        const right = order.indexOf(q.c) + 1;
        app.querySelector('#fb').innerHTML = `<div class="feedback ${correct ? 'ok' : 'bad'}">${correct ? pick(PRAISE) : 'התשובה הנכונה: ' + right + ' — ' + esc(q.o[q.c])}${q.e ? `<div class="why">💡 ${esc(q.e)}</div>` : ''}</div>
          <button class="btn" id="b-next">${i + 1 >= items.length ? 'סיום' : 'הבא ←'}</button>`;
        if (!correct) speech.speak('התשובה הנכונה היא ' + right + '. ' + q.o[q.c]);
        app.querySelector('#b-next').scrollIntoView({ behavior: 'smooth', block: 'end' });
        app.querySelector('#b-next').onclick = () => { i++; i >= items.length ? done() : show(); };
      });
      setTimeout(() => { if (alive) speech.speak(questionSpeech(q, order)); }, 300);
    }
    function done() {
      streak = SRS.updateStreak(streak); save();
      const ok = results.filter(Boolean).length;
      app.innerHTML = `<div class="done-emoji">🎧</div><h1 class="center">סיימת סבב שמע!</h1>
        <div class="big-score">${ok}/${results.length}</div><div class="grow"></div>
        <button class="btn" id="b-more">עוד סבב בשמע</button><button class="btn ghost" id="b-home">לבית</button>`;
      app.querySelector('#b-more').onclick = () => go('audio', {});
      app.querySelector('#b-home').onclick = () => go('home');
    }
    show();
  }

  // ---------- מבחן דמה ----------
  function startExam(opts) {
    const items = SRS.pickExam(Q, 30);
    const answers = {};
    const endAt = Date.now() + 40 * 60 * 1000;
    let clockEl = null;
    let tick = null;
    const clockText = () => {
      const s = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    const startClock = () => {
      tick = setInterval(() => {
        if (clockEl) clockEl.textContent = clockText();
        if (Date.now() >= endAt) { clearInterval(tick); toast('נגמר הזמן'); finish(); }
      }, 1000);
    };
    const stopClock = () => clearInterval(tick);
    let finished = false;

    function finish() {
      if (finished) return; finished = true;
      stopClock(); speech.stop();
      let ok = 0;
      const wrong = [];
      for (const q of items) {
        const a = answers[q.id];
        const correct = a === q.c;
        if (correct) ok++; else wrong.push(q);
        if (a !== undefined) progress[q.id] = SRS.grade(progress[q.id], correct);
      }
      streak = SRS.updateStreak(streak); save();
      const pass = ok >= 26;
      app.innerHTML = `<div class="done-emoji">${pass ? '🚗' : '📚'}</div>
        <h1 class="center">${pass ? 'עברת!' : 'עוד לא — אבל מתקרבים'}</h1>
        <div class="big-score">${ok}/30</div>
        <p class="center muted">צריך 26 כדי לעבור</p>
        <button class="btn" id="b-home">לבית</button>
        ${wrong.length ? '<h2>מה פספסת</h2>' + wrong.map(q => `<div class="card mistake"><b>${esc(q.q)}</b>
          ${q.img ? `<img class="qimg" src="img/${q.img}">` : ''}
          <p>✅ ${esc(q.o[q.c])}</p>${answers[q.id] !== undefined ? `<p class="muted">❌ ענית: ${esc(q.o[answers[q.id]])}</p>` : '<p class="muted">לא נענתה</p>'}
          ${q.e ? `<p class="muted">💡 ${esc(q.e)}</p>` : ''}</div>`).join('') : ''}`;
      app.querySelector('#b-home').onclick = () => go('home');
      cleanup = null;
    }

    if (opts.audio) {
      startClock();
      return startAudio({ exam: {
        items, clockText, stopClock, finish,
        bindClock: el => { clockEl = el; },
        answer: (q, oi) => { answers[q.id] = oi; }
      } });
    }

    let i = 0;
    cleanup = stopClock;
    startClock();
    function show() {
      const q = items[i];
      const order = SRS.optionOrder(q);
      app.innerHTML = `<div class="top"><button class="iconbtn" id="b-x">✕</button><b>שאלה ${i + 1}/30</b><span class="muted" id="clock">${clockText()}</span></div>
        <div class="bar"><i style="width:${(i / 30) * 100}%"></i></div>
        <div class="question">${esc(q.q)}</div>${q.img ? `<img class="qimg" src="img/${q.img}">` : ''}
        ${order.map((oi, k) => `<button class="opt ${answers[q.id] === oi ? 'picked' : ''}" data-oi="${oi}"><span class="n">${LETTERS[k]}</span><span>${esc(q.o[oi])}</span></button>`).join('')}
        <div style="display:flex;gap:10px">
          <button class="btn ghost" id="b-prev" ${i === 0 ? 'disabled' : ''}>→ הקודמת</button>
          <button class="btn" id="b-next">${i === 29 ? 'הגשה' : 'הבאה ←'}</button></div>
        <button class="btn ghost small" id="b-say">🔊 להקריא</button>`;
      clockEl = app.querySelector('#clock');
      app.querySelector('#b-x').onclick = confirmQuit;
      app.querySelector('#b-say').onclick = () => speech.speak(questionSpeech(q, order));
      app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        answers[q.id] = +b.dataset.oi;
        app.querySelectorAll('.opt').forEach(x => x.classList.toggle('picked', x === b));
      });
      app.querySelector('#b-prev').onclick = () => { if (i > 0) { i--; show(); } };
      app.querySelector('#b-next').onclick = () => {
        if (i < 29) { i++; show(); return; }
        const missing = items.filter(x => answers[x.id] === undefined).length;
        if (!missing) return finish();
        modal(`<h2>להגיש?</h2><p>${missing} שאלות עוד בלי תשובה.</p>
          <button class="btn" id="m-sub">להגיש</button><button class="btn ghost" id="m-back">לחזור</button>`, m => {
          m.querySelector('#m-sub').onclick = () => { closeModal(); finish(); };
          m.querySelector('#m-back').onclick = closeModal;
        });
      };
    }
    show();
  }

  // ---------- הגדרות ----------
  function seg(key, opts) {
    return `<div class="seg" data-key="${key}">${opts.map(([v, l]) =>
      `<button data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function renderSettings() {
    const time = String(settings.remindHour).padStart(2, '0') + ':' + String(settings.remindMin).padStart(2, '0');
    app.innerHTML = `<div class="top"><button class="iconbtn" id="b-back">→</button><b>הגדרות</b><span style="width:48px"></span></div>
      <div class="card">
        <div class="setting"><span>שאלות בסבב</span>${seg('len', [[3, '3'], [5, '5'], [7, '7'], [10, '10']])}</div>
        <div class="setting"><span>גודל טקסט</span>${seg('fs', [['normal', 'רגיל'], ['large', 'גדול'], ['huge', 'ענק']])}</div>
        <div class="setting"><span>ריווח אותיות<br><span class="muted">עוזר לחלק מבעלי דיסלקציה</span></span>${seg('spacing', [[false, 'כבוי'], [true, 'פועל']])}</div>
      </div>
      <div class="card">
        <div class="setting"><span>הקראה אוטומטית</span>${seg('autoRead', [[false, 'כבוי'], [true, 'פועל']])}</div>
        <div class="setting"><span>קצב הקראה</span>${seg('rate', [['slow', 'איטי'], ['normal', 'רגיל']])}</div>
        <button class="btn ghost small" id="b-test">🔊 בדיקת הקראה</button>
      </div>
      <div class="card">
        <div class="setting"><span>תזכורת יומית</span>${seg('remind', [[false, 'כבוי'], [true, 'פועל']])}</div>
        <div class="setting"><span>שעה</span><input type="time" id="rtime" value="${time}" style="font:inherit;padding:8px;border-radius:10px;border:2px solid var(--line);background:var(--card);color:var(--ink)"></div>
      </div>
      <button class="btn ghost" id="b-reset" style="color:var(--bad)">איפוס כל ההתקדמות</button>`;
    app.querySelector('#b-back').onclick = () => go('home');
    app.querySelectorAll('.seg').forEach(s => s.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = s.dataset.key; let v = b.dataset.v;
      if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = +v;
      settings[k] = v; save(); applyLook();
      if (k === 'remind') scheduleReminder(true);
      renderSettings();
    }));
    app.querySelector('#rtime').onchange = e => {
      const [h, m] = e.target.value.split(':').map(Number);
      settings.remindHour = h; settings.remindMin = m; save(); scheduleReminder(true);
    };
    app.querySelector('#b-test').onclick = () => speech.speak('שלום! ככה אני נשמעת. בהצלחה במבחן.');
    app.querySelector('#b-reset').onclick = () => modal(`<h2>לאפס הכול?</h2><p>כל ההתקדמות והרצף יימחקו.</p>
      <button class="btn" id="m-no">לא, טעות</button><button class="btn ghost" id="m-yes" style="color:var(--bad)">כן, לאפס</button>`, m => {
      m.querySelector('#m-no').onclick = closeModal;
      m.querySelector('#m-yes').onclick = () => { progress = {}; streak = null; settings.examUnlockedOnce = false; save(); closeModal(); toast('אופס. מתחילים מחדש'); go('home'); };
    });
  }

  async function scheduleReminder(announce) {
    const LN = P.LocalNotifications;
    if (!LN) { if (announce && settings.remind) toast('תזכורות עובדות רק באפליקציה בטלפון'); return; }
    try {
      await LN.cancel({ notifications: [{ id: 1 }] });
      if (!settings.remind) return;
      const perm = await LN.requestPermissions();
      if (perm.display !== 'granted') { toast('צריך לאשר התראות כדי לקבל תזכורת'); settings.remind = false; save(); return; }
      await LN.schedule({ notifications: [{
        id: 1, title: 'תאוריה בקטנה', body: '2 דקות? יש לך כמה שאלות שמחכות 🙂',
        schedule: { on: { hour: settings.remindHour, minute: settings.remindMin }, allowWhileIdle: true }
      }] });
      if (announce) toast('תזכורת נקבעה ל-' + String(settings.remindHour).padStart(2, '0') + ':' + String(settings.remindMin).padStart(2, '0'));
    } catch (e) { toast('לא הצלחתי לקבוע תזכורת'); }
  }

  // ---------- מידע ----------
  function renderInfo() {
    app.innerHTML = `<div class="top"><button class="iconbtn" id="b-back">→</button><b>מידע</b><span style="width:48px"></span></div>
      <div class="card"><h2>איך זה עובד</h2>
        <ul class="plain">
          <li>סבבים קצרים: כמה שאלות ונגמר. אפשר תמיד עוד סבב.</li>
          <li>שאלה שטעית בה חוזרת עוד באותו סבב, ואחר כך אחרי יום.</li>
          <li>שאלה שאתה יודע חוזרת אחרי 3, 7, 16 ו-35 יום — ככה זה נשאר בזיכרון.</li>
          <li>"תן לי משהו" בוחר לבד מה הכי חשוב עכשיו.</li>
        </ul></div>
      <div class="card"><h2>🎧 מבחן תאוריה בשמע</h2>
        <p>מי שאובחנה אצלו לקות שמשפיעה על מבחן בכתב (למשל דיסלקציה) עשוי להיות זכאי להיבחן במערכת שמע: השאלה מושמעת באוזניות ומסמנים במחשב. אפשרי בעברית ובערבית, לרישיון B ו-C1.</p>
        <p>צריך להביא אבחון פסיכודידקטי ו/או מסמך מנוירולוג. בזמן הזמנת התור צריך לבקש מבחן בשמע.</p>
        <p class="muted">מצב "תרגול בשמע" באפליקציה מדמה את המבחן הזה. כדאי לבדוק את הפרטים העדכניים באתר משרד התחבורה או ב"כל זכות".</p></div>
      <div class="card"><h2>המבחן</h2><p>30 שאלות, 40 דקות, צריך 26 נכונות.</p></div>
      <div class="card"><h2>מקורות</h2>
        <p class="muted">${Q.length} שאלות לרישיון B מהמאגר הרשמי של משרד התחבורה והבטיחות בדרכים (data.gov.il, רישיון CC-BY). העיבוד וההסברים הראשונים — מפרויקט LAMED+ (רישיון MIT).</p></div>`;
    app.querySelector('#b-back').onclick = () => go('home');
  }

  // ---------- התחלה ----------
  if (isNative) scheduleReminder(false);
  go('home');
})();
