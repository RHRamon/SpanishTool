(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { TENSES, TENSE_KEYS, PERSONS, PERSON_NL, PERSON_EN, PRON_SPEAK } = window.Conj;

  // ---------- taal ----------
  // Elke tekst staat er twee keer in: tr('nederlands', 'english'). Elke taal heeft zijn eigen voortgang.
  const LANG = window.LANG === 'en' ? 'en' : 'nl';
  const EN = LANG === 'en';
  const tr = (nl, en) => EN ? en : nl;
  const NATIVE = LANG;                       // taal van de vertaling (nl of en)
  const DECKS = EN ? window.WORD_DECKS_EN : window.WORD_DECKS;
  const PERSON_NATIVE = EN ? PERSON_EN : PERSON_NL;
  const tenseDesc = t => EN ? TENSES[t].en : TENSES[t].nl;
  const meaning = verb => EN ? (window.VERBS_EN[verb.v] || verb.nl) : verb.nl;
  const setName = s => EN ? (window.SENTENCE_SETS_EN[s] || s) : s;

  // ---------- instellingen & opslag ----------
  const KEY = EN ? 'spaanstool-en-v1' : 'spaanstool-v1';
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30, 60, 120, 240]; // dagen per "bak"
  const MAXB = INTERVALS.length - 1;
  const LEARNED_B = 3;          // vanaf bak 3 telt een kaart als geleerd
  const KNOWN_B = 6;            // "ken ik al" → 30 dagen vooruit
  const HARD_LAPSES = 2;        // moeilijk: minstens 2x fout gegaan…
  const HARD_UNTIL_B = 5;       // …en nog niet stevig geleerd
  const MASTER = 0.7;           // volgende tijd begint bij 70% geleerd
  const PENALTY = [0, 15, 20];  // onregelmatige werkwoorden schuiven wat naar achteren
  const MIN = 60000;
  const LEARN_GAP = 10 * MIN;   // leerfase: na ~10 minuten nog een keer
  const SHAKY_MAX = 20;         // zoveel zwakke kaarten tegelijk; daarboven eerst die oefenen
  const ROUND_MIN = 20;         // een ronde vult aan met zwakke kaarten tot minstens zoveel
  const PACE = { rustig: 5, normaal: 10, snel: 15 }; // nieuwe kaarten per ronde als je bijna alles goed hebt
  const RECENT = 40;            // je laatste 40 antwoorden bepalen het tempo
  const KINDS = ['words', 'verbs', 'sentences'];
  const KNAME = { words: 'Words', verbs: 'Verbs', sentences: 'Sentences' };
  const DIRS = { nl2es: tr('NL → ES', 'EN → ES'), es2nl: tr('ES → NL', 'ES → EN'), listen: tr('Luisteren', 'Listening') };
  const PACE_NAME = { rustig: tr('Rustig', 'Relaxed'), normaal: tr('Normaal', 'Normal'), snel: tr('Snel', 'Fast') };

  function defaults() {
    return {
      cards: {}, custom: [], log: {}, edits: {}, recent: '',
      settings: {
        newWords: 15, newVerbs: 20, newSentences: 10, sessionSize: 40, pace: 'normaal',
        speak: true, accent: 'es-ES', voice: '', retype: true,
        dirs: { nl2es: true, es2nl: false, listen: false },
        vosotros: false, cats: {}, tenses: { presente: true }, groups: { gewoon: true, refl: true }, stepwise: true,
        sets: {},
      },
    };
  }
  function merge(s) {
    const d = defaults(), ss = s.settings || {};
    const settings = { ...d.settings, ...ss };
    settings.groups = { ...d.settings.groups, ...(ss.groups || {}) };
    if (!ss.dirs) { // oude instelling "dir" omzetten
      settings.dirs = ss.dir === 'both' ? { nl2es: true, es2nl: true, listen: false }
        : ss.dir === 'es2nl' ? { nl2es: false, es2nl: true, listen: false } : { ...d.settings.dirs };
    }
    delete settings.dir;
    return { ...d, ...s, edits: s.edits || {}, settings };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return merge(s); } catch (e) {}
    return defaults();
  }
  let S = load();

  // Via de snelkoppeling bewaart een lokaal servertje alles in opslag/voortgang.json (alleen de Nederlandse versie).
  // Online (GitHub Pages) staat de voortgang alleen in de browser.
  const LOCALHOST = location.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const SERVER = LOCALHOST && !EN;
  let syncState = SERVER ? 'saved' : location.protocol.startsWith('http') ? 'browser' : 'local', pushTimer = null, dirty = false;
  if (!SERVER && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  function save() {
    S.savedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    if (SERVER) { dirty = true; clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }
  }
  async function push() {
    clearTimeout(pushTimer);
    if (!SERVER || !dirty) return;
    dirty = false;
    try {
      const r = await fetch('api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) });
      if (!r.ok) throw new Error(r.status);
      setSync('saved');
    } catch (e) { dirty = true; setSync('error'); }
  }
  function setSync(st) { syncState = st; renderSync(); }
  function renderSync() {
    const el = $('#sync'); if (!el) return;
    const m = {
      saved: ['ok', 'Opgeslagen', 'Je voortgang staat in opslag/voortgang.json, met een dagelijkse kopie in opslag/backups'],
      error: ['err', 'Niet opgeslagen', 'Het opslagprogramma reageert niet. Start de app opnieuw via de snelkoppeling; je voortgang staat ook nog in de browser.'],
      local: ['err', tr('Alleen in browser', 'Browser only'), tr('Open de app via de snelkoppeling op je bureaublad om automatisch in een bestand op te slaan.',
        'Your progress is stored in this browser only. Download a backup now and then via Settings.')],
      browser: ['ok', tr('Opgeslagen in browser', 'Saved in browser'), tr('Je voortgang staat in deze browser. Download af en toe een backup via Instellingen.',
        'Your progress is stored in this browser. Download a backup now and then via Settings.')],
    }[syncState];
    el.className = 'sync ' + m[0]; el.textContent = m[1]; el.title = m[2];
  }
  async function loadFromServer() {
    if (!SERVER) return;
    try {
      const r = await fetch('api/data', { cache: 'no-store' });
      const data = await r.json();
      if (data && (data.savedAt || 0) >= (S.savedAt || 0)) { // nieuwste versie wint
        S = merge(data);
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      } else { dirty = true; await push(); }
      setSync('saved');
    } catch (e) { setSync('error'); }
  }
  if (SERVER) {
    const check = () => fetch('api/ping').then(() => { if (dirty) push(); else if (syncState === 'error') setSync('saved'); }, () => setSync('error'));
    setInterval(check, 4 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('pagehide', () => {
      if (dirty) navigator.sendBeacon('api/data', new Blob([JSON.stringify(S)], { type: 'application/json' }));
    });
  }

  // ---------- hulpjes ----------
  function today() { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  function dayLog() { const t = today(); return S.log[t] || (S.log[t] = { reviews: 0, correct: 0, newWords: 0, newVerbs: 0, newSentences: 0 }); }
  function streak() {
    let t = today(), n = 0;
    if (!(S.log[t] && S.log[t].reviews)) t--;
    while (S.log[t] && S.log[t].reviews) { n++; t--; }
    return n;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function interleave(lists) {
    const out = [], n = Math.max(0, ...lists.map(l => l.length));
    for (let i = 0; i < n; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
    return out;
  }
  const plain = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---------- woorden ----------
  function parseList(text) {
    const out = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(.+?)\s*(?:\t|=|;)\s*(.+)$/);
      if (m) out.push({ nl: m[1].trim(), es: m[2].trim() });
    }
    return out;
  }
  let WORD_ITEMS = [], WORD_BY_KEY = {};
  function buildWords() {
    WORD_ITEMS = [];
    const add = (it, cat, key) => {
      const e = S.edits[key];
      WORD_ITEMS.push({ nl: e ? e.nl : it.nl, es: e ? e.es : it.es, orig: it, cat, key, edited: !!e });
    };
    for (const [cat, text] of Object.entries(DECKS))
      for (const it of parseList(text)) add(it, cat, cat + '|' + it.nl + '|' + it.es);
    for (const c of S.custom)
      for (const it of parseList(c.text)) add(it, '★ ' + c.name, 'c' + c.id + '|' + it.nl + '|' + it.es);
    WORD_BY_KEY = Object.fromEntries(WORD_ITEMS.map(i => [i.key, i]));
    // Werkwoorden die ook in de vervoegingen zitten, leer je via het leerpad van dat werkwoord
    VERB_WORD = {};
    for (const verb of window.VERBS) {
      const it = WORD_ITEMS.find(i => !i.cat.startsWith('★') && Check.splitAnswers(i.es).includes(verb.v));
      if (it) { VERB_WORD[verb.v] = it; it.verbLink = verb.v; }
    }
  }
  let VERB_WORD = {};
  function categories() { return [...new Set(WORD_ITEMS.map(i => i.cat))]; }
  const catOn = c => S.settings.cats[c] !== false;
  const tenseOn = t => !!S.settings.tenses[t];
  const setOn = s => S.settings.sets[s] !== false;
  const wordId = (it, d) => 'w|' + it.key + '|' + d;

  function wordCards() {
    const dirs = Object.keys(DIRS).filter(d => S.settings.dirs[d]);
    const out = [];
    for (const it of WORD_ITEMS) if (catOn(it.cat) && !it.verbLink)
      for (const d of dirs) out.push({ id: wordId(it, d), kind: 'words', item: it, dir: d });
    return out;
  }

  // ---------- werkwoorden ----------
  const conjCache = {};
  function form(verb, tense, p) {
    const k = verb.v + '|' + tense;
    return (conjCache[k] || (conjCache[k] = window.Conj.conjugate(verb, tense)))[p];
  }
  const VERB_IDX = Object.fromEntries(window.VERBS.map((v, i) => [v.v, i]));
  function verbCard(verb, t, p) {
    // betekenissen in dezelfde volgorde als de presente: eerst regelmatige (hablar, comer, vivir)
    if (t === 'inf') return { id: 'v|' + verb.v + '|inf', kind: 'verbs', verb, tense: 'inf', p: 0,
                              ord: VERB_IDX[verb.v] + PENALTY[window.Conj.difficulty(verb, 'presente')] };
    return { id: 'v|' + verb.v + '|' + t + '|' + p, kind: 'verbs', verb, tense: t, p,
             ord: VERB_IDX[verb.v] + PENALTY[window.Conj.difficulty(verb, t)] };
  }
  function verbCards() {
    const out = [], g = S.settings.groups;
    for (const verb of window.VERBS) {
      if (!(verb.refl ? g.refl : g.gewoon)) continue;
      out.push(verbCard(verb, 'inf', 0)); // eerst de betekenis
      for (const t of TENSE_KEYS) {
        if (!tenseOn(t) || (verb.skip && verb.skip.includes(t))) continue;
        for (let p = 0; p < 6; p++) {
          if (p === 4 && !S.settings.vosotros) continue;
          out.push(verbCard(verb, t, p));
        }
      }
    }
    return out;
  }

  // ---------- zinnen ----------
  const SENTENCES = [];
  for (const [set, rows] of Object.entries(window.SENTENCE_SETS))
    for (const [es, hint, nl, why] of rows) {
      const x = EN && window.SENTENCES_EN[es];
      SENTENCES.push({ set, es, hint, nl: x ? x[0] : nl, why: x ? x[1] : why, id: 's|' + es });
    }
  const SENT_BY_ID = Object.fromEntries(SENTENCES.map(s => [s.id, s]));
  function sentenceCards() {
    return SENTENCES.filter(s => setOn(s.set)).map(s => ({ id: s.id, kind: 'sentences', sent: s }));
  }

  function pool(kind) {
    if (kind === 'words') return wordCards();
    if (kind === 'verbs') return verbCards();
    return sentenceCards();
  }

  // kaart terugvinden aan de hand van zijn id (voor de lijst met moeilijke woorden)
  function cardFromId(id) {
    if (id.startsWith('w|')) {
      const i = id.lastIndexOf('|'), it = WORD_BY_KEY[id.slice(2, i)];
      return it ? { id, kind: 'words', item: it, dir: id.slice(i + 1) } : null;
    }
    if (id.startsWith('v|')) {
      const [, v, t, p] = id.split('|'), verb = window.VERBS[VERB_IDX[v]];
      return verb && (TENSES[t] || t === 'inf') ? verbCard(verb, t, +p || 0) : null;
    }
    const s = SENT_BY_ID[id];
    return s ? { id, kind: 'sentences', sent: s } : null;
  }

  // ---------- leervolgorde werkwoorden ----------
  // Per werkwoord: ken je de betekenis, en welke tijden beheers je al?
  const learnedSt = st => !!(st && (st.b >= LEARNED_B || st.known));
  function verbKnown(verb) {
    if (learnedSt(S.cards['v|' + verb.v + '|inf'])) return true;
    const it = VERB_WORD[verb.v];
    return !!(it && learnedSt(S.cards[wordId(it, 'nl2es')]));
  }
  function verbMastery(p) {
    const acc = {};
    for (const c of p) {
      const a = acc[c.verb.v] || (acc[c.verb.v] = {});
      if (c.tense === 'inf') continue;
      const x = a[c.tense] || (a[c.tense] = { n: 0, seen: 0, learned: 0 });
      x.n++;
      const st = S.cards[c.id];
      if (st) { x.seen++; if (st.b >= LEARNED_B) x.learned++; }
    }
    const m = {};
    for (const [v, a] of Object.entries(acc)) {
      const r = m[v] = { inf: verbKnown(window.VERBS[VERB_IDX[v]]) };
      for (const [t, x] of Object.entries(a)) r[t] = x.seen === x.n && x.learned >= MASTER * x.n;
    }
    return m;
  }
  const countMastered = (m, t) => Object.values(m).filter(x => x[t]).length;
  // mag deze nieuwe werkwoordkaart al?
  function verbAllowed(c, m) {
    if (c.tense === 'inf') return true;
    const vm = m[c.verb.v];
    if (!vm || !vm.inf) return false;               // eerst de betekenis kennen
    if (!S.settings.stepwise) return true;
    for (const t of TENSE_KEYS) {                   // dan tijd voor tijd
      if (!tenseOn(t)) continue;
      if (t === c.tense) return true;
      if (!vm[t]) return false;
    }
    return false;
  }

  // Zinnen gaan pas open als je de vormen kent die erin zitten
  const SENT_RULES = {
    'Ser of estar': {
      open: m => !!(m.ser && m.ser.presente && m.estar && m.estar.presente),
      lock: m => tr('gaat open als je ser én estar in de presente kent', 'unlocks when you know ser and estar in the presente'),
    },
    'Por of para': {
      open: m => countMastered(m, 'presente') >= 15,
      lock: m => tr(`gaat open bij 15 werkwoorden in de presente (nu ${countMastered(m, 'presente')})`,
                    `unlocks at 15 verbs in the presente (now ${countMastered(m, 'presente')})`),
    },
    'Indefinido of imperfecto': {
      open: m => countMastered(m, 'indefinido') >= 8 && countMastered(m, 'imperfecto') >= 8,
      lock: m => tr(`gaat open bij 8 werkwoorden in de indefinido én imperfecto (nu ${countMastered(m, 'indefinido')} en ${countMastered(m, 'imperfecto')})`,
                    `unlocks at 8 verbs in both the indefinido and imperfecto (now ${countMastered(m, 'indefinido')} and ${countMastered(m, 'imperfecto')})`),
      own: ['indefinido', 'imperfecto'],
    },
  };
  function sentenceAllowed(sent, m) {
    const r = SENT_RULES[sent.set];
    if (!r) return true;
    if (!r.open(m)) return false;
    if (!r.own) return true;
    const vm = m[sent.hint.split(' · ')[0].replace(/\s*\(.*\)/, '').trim()];
    return !vm || r.own.every(t => vm[t]);         // dit werkwoord zelf ook in die tijden kennen
  }

  // Nieuwe kaarten in leervolgorde
  const NEW_VERBS_PER_DAY = 3;
  function candidates(kind, p) {
    const unseen = p.filter(c => !S.cards[c.id]);
    if (kind === 'words') return unseen;
    const m = verbMastery(kind === 'verbs' ? p : verbCards());
    if (kind === 'sentences') {
      const ok = unseen.filter(c => sentenceAllowed(c.sent, m));
      return interleave(Object.keys(window.SENTENCE_SETS).map(set => ok.filter(c => c.sent.set === set)));
    }
    const ok = unseen.filter(c => verbAllowed(c, m));
    const byOrd = (a, b) => a.ord - b.ord || a.p - b.p;
    const split = list => interleave([list.filter(c => !c.verb.refl), list.filter(c => c.verb.refl)]);
    const meanings = split(ok.filter(c => c.tense === 'inf').sort(byOrd));
    const conj = [];
    for (const t of TENSE_KEYS) conj.push(...split(ok.filter(c => c.tense === t).sort(byOrd)));
    // elke dag een paar nieuwe werkwoorden, verder vervoegen wat je al kent
    return [...meanings.slice(0, NEW_VERBS_PER_DAY), ...conj, ...meanings.slice(NEW_VERBS_PER_DAY)];
  }

  // ---------- kenniscijfer ----------
  // 1 = zwak … 5 = sterk. Hoe sterker, hoe langer tot de kaart terugkomt.
  function score(st) {
    if (!st) return 0;
    if (st.known) return 5;
    if (st.learn || st.b <= 1) return 1;
    return st.b === 2 ? 2 : st.b <= 4 ? 3 : st.b <= 6 ? 4 : 5;
  }
  const SCORE_NL = EN ? ['new', 'weak', 'shaky', 'okay', 'good', 'strong'] : ['nieuw', 'zwak', 'matig', 'redelijk', 'goed', 'sterk'];
  const dotsHtml = n => `<span class="dots" title="${tr('Kenniscijfer', 'Knowledge score')}: ${SCORE_NL[n]}">${[1, 2, 3, 4, 5].map(i => `<i class="t${i <= n ? ' s' + n : ''}"></i>`).join('')}</span>`;
  // leerfase-kaarten zijn op de minuut gepland, de rest per dag
  const isDue = (st, t, nw) => st.learn ? (st.dueAt || 0) <= nw : st.due <= t;
  // zwak = nog in de leerfase, of de laatste keer fout
  const isShaky = st => !!st && !st.known && (!!st.learn || (st.b <= 1 && st.ok !== true));
  function accuracy() {
    const r = S.recent || '';
    return r.length < 10 ? null : r.split('').filter(x => x === '1').length / r.length;
  }

  // ---------- tellingen ----------
  function stats(kind) {
    if (kind === 'all') {
      const parts = KINDS.map(stats), o = {};
      for (const k of Object.keys(parts[0])) o[k] = parts.reduce((s, x) => s + x[k], 0);
      return o;
    }
    const t = today(), nw = Date.now(), p = pool(kind);
    const o = { total: p.length, due: 0, learning: 0, shaky: 0, learned: 0, unseen: 0, tomorrow: 0, week: 0, d1: 0, d2: 0, d3: 0, d4: 0, d5: 0 };
    for (const c of p) {
      const st = S.cards[c.id];
      if (!st) { o.unseen++; continue; }
      o['d' + score(st)]++;
      if (isDue(st, t, nw)) o.due++;
      if (st.learn) o.learning++;
      else { if (st.due <= t + 1) o.tomorrow++; if (st.due <= t + 7) o.week++; }
      if (isShaky(st)) o.shaky++;
      if (st.b >= LEARNED_B) o.learned++;
    }
    o.avail = candidates(kind, p).length;
    return o;
  }

  // Hoeveel nieuwe kaarten kun je nu aan? Meer als je veel goed hebt, minder als er veel zwakke kaarten openstaan.
  function newBudget(st) {
    const base = PACE[S.settings.pace] || PACE.normaal, acc = accuracy();
    const fAcc = acc === null ? 1 : Math.max(0, Math.min(1, (acc - 0.6) / 0.3));
    const want = Math.round(base * fAcc), room = Math.max(0, SHAKY_MAX - st.shaky);
    const n = Math.min(want, room, st.avail);
    const pct = acc === null ? '' : tr(`${Math.round(acc * 100)}% goed van je laatste ${(S.recent || '').length} antwoorden`,
                                       `${Math.round(acc * 100)}% correct in your last ${(S.recent || '').length} answers`);
    let why;
    if (!st.avail) why = tr('geen nieuwe kaarten beschikbaar', 'no new cards available');
    else if (room < want) why = tr(`${st.shaky} kaarten zijn nog zwak, eerst die steviger maken`, `${st.shaky} cards are still weak, strengthening those first`);
    else if (acc === null) why = tr('we beginnen rustig', 'starting slowly');
    else if (!want) why = pct + tr(', dus eerst oefenen wat je al hebt', ', so first practising what you have');
    else if (want < base) why = pct + tr(', dus iets minder nieuw', ', so a bit less new');
    else why = pct + tr(', lekker bezig', ', great going');
    return { n, why };
  }

  // Wat komt er in de volgende ronde?
  //  1. leerfase-kaarten die weer aan de beurt zijn + herhalingen van vandaag
  //  2. nieuwe kaarten, zoveel als je aankunt
  //  3. aanvullen met kaarten die je de laatste keer fout had (wat je al goed had, komt niet nog eens terug)
  function plan(kind) {
    const kinds = kind === 'all' ? KINDS : [kind];
    const t = today(), nw = Date.now(), size = S.settings.sessionSize || 40;
    const st = stats(kind), budget = newBudget(st);
    const learnNow = [], reviews = [], weak = [], recent = [], freshPer = [];
    for (const k of kinds) {
      const p = pool(k);
      for (const c of p) {
        const x = S.cards[c.id]; if (!x) continue;
        if (isDue(x, t, nw)) (x.learn ? learnNow : reviews).push(c);
        else if (x.ok === false) (x.at > nw - 3 * MIN ? recent : weak).push(c); // alleen kaarten die je de laatste keer fout had
      }
      freshPer.push(candidates(k, p));
    }
    learnNow.sort((a, b) => (S.cards[a.id].dueAt || 0) - (S.cards[b.id].dueAt || 0));
    shuffle(reviews).sort((a, b) => S.cards[a.id].due - S.cards[b.id].due); // te laat = eerst
    const old = [...learnNow, ...reviews].slice(0, size);
    let nNew = Math.min(budget.n, Math.max(0, size - old.length));
    const C = c => S.cards[c.id];
    weak.sort((a, b) => (isShaky(C(b)) - isShaky(C(a))) || score(C(a)) - score(C(b))
      || (C(b).lapses || 0) - (C(a).lapses || 0) || (C(a).at || 0) - (C(b).at || 0));
    const fill = Math.max(0, Math.min(size, ROUND_MIN) - old.length - nNew);
    // zwakke kaarten blijven terugkomen; net geoefende pas als er niets anders is, langst geleden eerst
    recent.sort((a, b) => (C(a).at || 0) - (C(b).at || 0));
    const extra = [...weak, ...recent].slice(0, fill);
    if (!old.length && !nNew && !extra.length && st.avail) { // nooit vastlopen
      nNew = Math.min(5, st.avail); budget.why = tr('alles staat stevig, dus weer een paar nieuwe', 'everything is solid, so a few new ones');
    }
    return { old, fresh: interleave(freshPer).slice(0, nNew), extra, budget, st,
             count: old.length + nNew + extra.length };
  }

  const isHard = st => st && st.lapses >= HARD_LAPSES && st.b < HARD_UNTIL_B;
  function hardCards() {
    return Object.entries(S.cards).filter(([, st]) => isHard(st))
      .sort((a, b) => b[1].lapses - a[1].lapses)
      .map(([id]) => cardFromId(id)).filter(Boolean);
  }

  // ---------- hoe een kaart eruitziet ----------
  const SPEAKER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  function view(card) {
    if (card.kind === 'words') {
      const it = card.item, es = Check.splitAnswers(it.es), nl = Check.splitAnswers(it.nl);
      if (card.dir === 'nl2es') return { badge: it.cat, prompt: esc(it.nl), sub: tr('in het Spaans', 'in Spanish'), answers: es, lang: 'es', say: es[0] };
      if (card.dir === 'es2nl') return { badge: it.cat, prompt: esc(it.es), sub: tr('in het Nederlands', 'in English'), answers: nl, lang: NATIVE, say: es[0], sayFirst: true };
      return {
        badge: tr('Luisteren · ', 'Listening · ') + it.cat, listen: true,
        prompt: `<button class="bigsay" id="bigsay" title="${tr('Nog een keer (Tab)', 'Again (Tab)')}" aria-label="${tr('Nog een keer afspelen', 'Play again')}">${SPEAKER}</button>`,
        sub: tr('Wat betekent het? <span class="muted"><kbd>Tab</kbd> nog een keer, langzamer</span>',
                'What does it mean? <span class="muted"><kbd>Tab</kbd> again, slower</span>'),
        answers: nl, lang: NATIVE, say: es[0], sayFirst: true,
        reveal: `${esc(it.es)} <i>=</i> ${nl.map(esc).join(' <i>/</i> ')}`, list: `🔊 ${esc(it.es)}`,
      };
    }
    if (card.kind === 'verbs' && card.tense === 'inf') {
      const it = VERB_WORD[card.verb.v], answers = it ? Check.splitAnswers(it.es) : [card.verb.v];
      if (!answers.includes(card.verb.v)) answers.unshift(card.verb.v);
      return { badge: tr('Werkwoord · betekenis', 'Verb · meaning'), prompt: esc(it ? it.nl : meaning(card.verb)),
               sub: tr('het hele werkwoord in het Spaans', 'the whole verb in Spanish'),
               answers, lang: 'es', say: card.verb.v };
    }
    if (card.kind === 'verbs') {
      const f = Check.splitAnswers(form(card.verb, card.tense, card.p));
      return {
        badge: TENSES[card.tense].label,
        prompt: `<span class="pers">${esc(PERSONS[card.p])}</span> ${esc(card.verb.v)}`,
        sub: `${esc(meaning(card.verb))} · ${esc(PERSON_NATIVE[card.p])} · <span class="muted">${esc(tenseDesc(card.tense))}</span>`,
        answers: f, lang: 'es', verb: true, say: PRON_SPEAK[card.p] + ' ' + f[0],
      };
    }
    const s = card.sent, m = s.es.match(/^(.*)\[(.+?)\](.*)$/), answers = Check.splitAnswers(m[2]);
    const full = m[1] + answers[0] + m[3];
    return {
      badge: setName(s.set), long: true,
      prompt: `${esc(m[1])}<span class="blank">${'_'.repeat(6)}</span>${esc(m[3])}`,
      sub: `<span class="hintchip">${esc(s.hint)}</span> ${esc(s.nl)}`,
      answers, lang: 'es', verb: true, say: full, why: s.why,
      reveal: `${esc(m[1])}<mark>${esc(answers[0])}</mark>${esc(m[3])}`,
      list: `${esc(m[1])}<b>…</b>${esc(m[3])}`,
    };
  }

  // ---------- spraak ----------
  let voice = null;
  const esVoices = () => ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(v => /^es/i.test(v.lang));
  function voiceScore(v) {
    const want = S.settings.accent, lang = v.lang.replace('_', '-');
    const accentOk = want === 'es-ES' ? /^es-ES/i.test(lang) : !/^es-ES/i.test(lang);
    return (accentOk ? 10 : 0) + (/natural/i.test(v.name) ? 5 : /online|google/i.test(v.name) ? 3 : 0);
  }
  function pickVoice() {
    const vs = esVoices();
    voice = (S.settings.voice && vs.find(v => v.voiceURI === S.settings.voice))
      || vs.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = () => {
      pickVoice();
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if ((current === 'home' || current === 'settings') && !typing) rerender();
    };
  }
  function speak(text, force, rate) {
    if ((!S.settings.speak && !force) || !('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\([^)]*\)/g, ''));
    u.lang = voice ? voice.lang : S.settings.accent;
    if (voice) u.voice = voice;
    u.rate = rate || 0.92;
    speechSynthesis.speak(u);
  }

  // ---------- schermen ----------
  // Vier tabbladen (Vandaag, Voortgang, Woordenlijst, Instellingen) plus het oefenen en het eindscherm.
  const SCREENS = ['home', 'progress', 'list', 'settings', 'practice', 'done'];
  let current = 'home', openOpt = null;
  function show(id) {
    current = id;
    for (const s of SCREENS) $('#' + s).hidden = s !== id;
    document.body.classList.toggle('drilling', id === 'practice' || id === 'done');
    for (const b of document.querySelectorAll('[data-nav]')) {
      if (b.dataset.nav === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    vtip.hidden = true;
    renderTop();
    window.scrollTo(0, 0);
  }
  function render(id) {
    if (id === 'home') renderHome();
    else if (id === 'progress') renderProgress();
    else if (id === 'settings') renderSettings();
    else if (id === 'list') renderList();
  }
  function go(id) { if (id === 'list') editKey = null; render(id); show(id); }
  function goHome() { go('home'); }
  // opnieuw tekenen na een wijziging, zonder weg te springen
  function rerender() { const y = window.scrollY; render(current); renderTop(); window.scrollTo(0, y); }

  function renderTop() {
    const L = S.log[today()] || { reviews: 0 }, st = streak();
    const total = Object.values(S.log).filter(x => x && x.reviews).length;
    const days = n => EN ? (n === 1 ? 'day' : 'days') : (n === 1 ? 'dag' : 'dagen');
    $('#topstats').innerHTML =
      `<span class="streak ${st ? 'on' : ''}" title="${tr('Dagen op rij geoefend', 'Days practised in a row')}"><b>${st}</b> ${days(st)} ${tr('op rij', 'in a row')}</span>` +
      `<span title="${tr('Dagen in totaal geoefend', 'Days practised in total')}"><b>${total}</b> ${days(total)} ${tr('totaal', 'total')}</span>` +
      `<span title="${tr('Vandaag beantwoord', 'Answered today')}"><b>${L.reviews}</b> ${tr('vandaag', 'today')}</span><span id="sync"></span>`;
    renderSync();
  }

  // kenniscijfer als rijtje tegeltjes
  const tile = s => `<i class="t s${s}"></i>`;
  function distHtml(st) {
    if (!(st.d1 + st.d2 + st.d3 + st.d4 + st.d5)) return '';
    return `<div class="mlegend">${[5, 4, 3, 2, 1].map(i => `<span>${tile(i)}${SCORE_NL[i]} <b>${st['d' + i]}</b></span>`).join('')}</div>`;
  }

  // De tegelwand: elke kaart die je al eens gezien hebt is een tegel, hoe donkerder hoe beter je hem kent.
  function mosaic() {
    const counts = [0, 0, 0, 0, 0, 0], tiles = [];
    for (const st of Object.values(S.cards)) { const s = score(st); if (s) { counts[s]++; tiles.push(s); } }
    if (!tiles.length) return `<div class="mosaic-empty">${tr(
      'Elke kaart die je leert wordt hier een tegel. Hoe beter je hem kent, hoe dieper het blauw.',
      'Every card you learn becomes a tile here. The better you know it, the deeper the blue.')}</div>`;
    tiles.sort((a, b) => b - a);
    const size = tiles.length > 1400 ? 'xs' : tiles.length > 600 ? 'sm' : '';
    const label = [5, 4, 3, 2, 1].map(i => `${SCORE_NL[i]}: ${counts[i]}`).join(', ');
    return `<div class="mosaic ${size}" role="img" aria-label="${esc(label)}">${tiles.map(tile).join('')}</div>
      <div class="mlegend">${[5, 4, 3, 2, 1].map(i => `<span>${tile(i)}${SCORE_NL[i]} <b>${counts[i]}</b></span>`).join('')}</div>`;
  }

  // ---------- voortgang ----------
  // Elke dag wordt bewaard hoeveel kaarten je op elk kenniscijfer hebt (log[dag].dist = [zwak … sterk]).
  function snapshot() {
    const d = [0, 0, 0, 0, 0];
    for (const st of Object.values(S.cards)) { const s = score(st); if (s) d[s - 1]++; }
    dayLog().dist = d;
  }
  const MONTHS = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                    : ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const dayLabel = x => { const d = new Date(x * 86400000); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
  const sum = a => a.reduce((s, v) => s + v, 0);
  function niceStep(max) {
    for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) if (max / s <= 4) return s;
    return 10000;
  }
  // staaf met afgeronde bovenkant
  const rtop = (x, y, w, h, r) => `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  // cols: per dag de segmenten van onder naar boven (null = geen gegevens), colors: css-variabele per segment
  function barChart(cols, days, colors, tips, label) {
    const W = 720, H = 170, L = 36, B = 22, T = 8, n = cols.length;
    const max = Math.max(1, ...cols.map(c => c ? sum(c) : 0)), step = niceStep(max), top = Math.ceil(max / step) * step;
    const slot = (W - L) / n, bw = Math.min(16, slot * 0.62);
    const y = v => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top; v += step)
      g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="${v ? 'gl' : 'base'}"/><text x="${L - 8}" y="${y(v) + 4}" class="yt">${v}</text>`;
    cols.forEach((c, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      if (c) {
        const segs = c.map((v, k) => ({ v, k })).filter(s => s.v > 0);
        let acc = 0;
        segs.forEach((s, j) => {
          const y0 = y(acc), y1 = y(acc + s.v); acc += s.v;
          const h = Math.max(0, y0 - y1 - (j ? 2 : 0)); // 2px ruimte tussen segmenten
          g += j === segs.length - 1
            ? `<path d="${rtop(x, y1, bw, h, Math.min(3, h, bw / 2))}" fill="var(${colors[s.k]})"/>`
            : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="var(${colors[s.k]})"/>`;
        });
      }
      g += `<rect class="hit" x="${L + slot * i}" y="${T}" width="${slot}" height="${H - T - B}" data-tip="${esc(tips[i])}"/>`;
    });
    for (const i of [...new Set([0, Math.floor((n - 1) / 2), n - 1])])
      g += `<text x="${L + slot * (i + 0.5)}" y="${H - 5}" class="xt">${i === n - 1 ? tr('vandaag', 'today') : dayLabel(days[i])}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">${g}</svg>`;
  }
  // gestapelde vlakgrafiek: één doorlopend vlak per laag; cols[i] = null als die dag nog niet gemeten is
  function areaChart(cols, days, colors, tips, label) {
    const W = 720, H = 170, L = 36, B = 22, T = 8, n = cols.length;
    const max = Math.max(1, ...cols.map(c => c ? sum(c) : 0)), step = niceStep(max), top = Math.ceil(max / step) * step;
    const slot = (W - L) / n, cx = i => L + slot * (i + 0.5);
    const y = v => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top; v += step)
      g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="${v ? 'gl' : 'base'}"/><text x="${L - 8}" y="${y(v) + 4}" class="yt">${v}</text>`;
    // aaneengesloten reeksen gemeten dagen
    const runs = []; let cur = null;
    cols.forEach((c, i) => { if (c) { if (!cur) runs.push(cur = []); cur.push(i); } else cur = null; });
    const layers = colors.length;
    for (const run of runs) {
      // één meetpunt: teken het als smal blok zodat het zichtbaar is
      const xs = run.length > 1 ? run.map(cx) : [cx(run[0]) - slot * 0.35, cx(run[0]) + slot * 0.35];
      const idx = run.length > 1 ? run : [run[0], run[0]];
      const cum = idx.map(i => { let a = 0; return [0, ...cols[i].map(v => a += v)]; });
      for (let k = 0; k < layers; k++) {
        if (!cum.some(c => c[k + 1] > c[k])) continue;
        const upper = xs.map((x, j) => `${x.toFixed(1)},${y(cum[j][k + 1]).toFixed(1)}`);
        const lower = xs.map((x, j) => `${x.toFixed(1)},${y(cum[j][k]).toFixed(1)}`).reverse();
        g += `<polygon points="${upper.concat(lower).join(' ')}" fill="var(${colors[k]})" class="layer"/>`;
      }
    }
    cols.forEach((c, i) => {
      g += `<rect class="hit" x="${L + slot * i}" y="${T}" width="${slot}" height="${H - T - B}" data-tip="${esc(tips[i])}"/>`;
    });
    for (const i of [...new Set([0, Math.floor((n - 1) / 2), n - 1])])
      g += `<text x="${cx(i)}" y="${H - 5}" class="xt">${i === n - 1 ? tr('vandaag', 'today') : dayLabel(days[i])}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">${g}</svg>`;
  }
  function renderProgress() {
    snapshot();
    const t = today(), N = 30, days = [];
    for (let i = N - 1; i >= 0; i--) days.push(t - i);
    // kennis: een dag zonder oefenen houdt de stand van de dag ervoor
    let last = null;
    const dist = days.map(x => { const L = S.log[x]; if (L && L.dist) last = L.dist; return last; });
    const first = Math.min(dist.findIndex(Boolean), N - 7);
    const kd = days.slice(first < 0 ? N - 7 : first), kdist = dist.slice(first < 0 ? N - 7 : first);
    const known = d => d ? d[2] + d[3] + d[4] : 0;
    const now = dist[N - 1], weekAgo = dist[N - 8];
    let rev = 0, cor = 0;
    for (const x of days.slice(-7)) { const L = S.log[x]; if (L) { rev += L.reviews || 0; cor += L.correct || 0; } }
    const order = [4, 3, 2, 1, 0]; // sterk onderaan, zwak bovenaan
    const kChart = areaChart(kdist.map(d => d && order.map(k => d[k])), kd, order.map(k => '--k' + (k + 1)),
      kdist.map((d, i) => `${dayLabel(kd[i])}\n` + (d ? [4, 3, 2, 1, 0].map(k => `${SCORE_NL[k + 1]}: ${d[k]}`).join('\n') : tr('nog niet gemeten', 'not measured yet'))),
      tr('Aantal kaarten per kenniscijfer per dag', 'Number of cards per knowledge score per day'));
    const acts = days.map(x => S.log[x] && S.log[x].reviews ? [S.log[x].reviews] : null);
    const aChart = barChart(acts, days, ['--k4'], days.map(x => {
      const L = S.log[x]; if (!L || !L.reviews) return `${dayLabel(x)}\n${tr('niet geoefend', 'no practice')}`;
      return `${dayLabel(x)}\n${L.reviews} ${tr('antwoorden', 'answers')}\n${Math.round(100 * (L.correct || 0) / L.reviews)}% ${tr('goed', 'correct')}`;
    }), tr('Aantal antwoorden per dag', 'Number of answers per day'));
    const grow = weekAgo ? known(now) - known(weekAgo) : null;
    const growTxt = grow === null ? '' : `<em class="${grow < 0 ? 'down' : ''}">${grow >= 0 ? '+' : ''}${grow} ${tr('in 7 dagen', 'in 7 days')}</em>`;
    $('#progress').innerHTML = `
      <header class="pagehead"><h1>${tr('Voortgang', 'Progress')}</h1></header>
      <div class="figures">
        <div><b>${known(now)}</b><span>${tr('kaarten ken je redelijk of beter', 'cards you know okay or better')} ${growTxt}</span></div>
        <div><b>${rev}</b><span>${tr('antwoorden in de laatste 7 dagen', 'answers in the last 7 days')}</span></div>
        <div><b>${rev ? Math.round(100 * cor / rev) + '%' : '–'}</b><span>${tr('goed in de laatste 7 dagen', 'correct in the last 7 days')}</span></div>
      </div>
      <section class="sheet">
        <h2>${tr('Hoe goed je je kaarten kent', 'How well you know your cards')}</h2>
        <div class="mlegend">${[5, 4, 3, 2, 1].map(i => `<span>${tile(i)}${SCORE_NL[i]}</span>`).join('')}</div>
        ${kChart}
        ${kdist.filter(Boolean).length < 2 ? `<p class="note">${tr('Elke dag dat je oefent groeit de grafiek een dag. Kijk hoe het donkere oranje onderin dikker wordt.',
          'Every day you practise extends the chart by a day. Watch the dark orange at the bottom get thicker.')}</p>` : ''}
      </section>
      <section class="sheet">
        <h2>${tr('Antwoorden per dag', 'Answers per day')}</h2>
        <p class="note">${tr('Beweeg over een staaf om te zien hoeveel procent goed was.', 'Hover over a bar to see the percentage correct.')}</p>
        ${aChart}
      </section>`;
  }

  // ---------- vandaag ----------
  function planLine(pl) {
    const parts = [];
    if (pl.old.length) parts.push(`<b>${pl.old.length}</b> ${tr('herhalen', 'to review')}`);
    parts.push(`<b>${pl.fresh.length}</b> ${tr('nieuw', 'new')}`);
    if (pl.extra.length) parts.push(`<b>${pl.extra.length}</b> ${tr('zwakke extra', 'weak ones extra')}`);
    return parts.join(', ');
  }
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // één regel in "Eén ding oefenen", met de keuzes ingeklapt
  function modeRow(kind, key, title, st, opts, blocked) {
    const open = openOpt === kind, can = plan(kind).count > 0;
    const pct = st.total ? Math.round(100 * st.learned / st.total) : 0;
    const facts = !st.total ? blocked
      : tr(`${st.learned} van ${st.total} geleerd`, `${st.learned} of ${st.total} learned`)
        + (st.due ? tr(`, ${st.due} te herhalen`, `, ${st.due} to review`) : '')
        + (!can ? (blocked && st.unseen ? `. ${blocked}` : tr('. Alles staat stevig.', '. Everything is solid.')) : '');
    return `<div class="mode ${open ? 'open' : ''}">
      <div class="mhead">
        <kbd class="mkey" title="${tr('Sneltoets', 'Shortcut')}">${key}</kbd>
        <div class="mtitle"><h3>${title}</h3><p>${facts}</p>
          <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
        <div class="mact">
          <button class="btn quiet" data-opt="${kind}" aria-expanded="${open}">${tr('Opties', 'Options')}</button>
          <button class="btn solid" data-start="${kind}" ${can ? '' : 'disabled'}>${tr('Oefenen', 'Practise')}</button>
        </div>
      </div>
      ${open ? `<div class="mopts">${opts}</div>` : ''}
    </div>`;
  }

  function renderHome() {
    const s = S.settings;
    const ws = stats('words'), vs = stats('verbs'), ss = stats('sentences'), all = stats('all');
    const cats = categories();
    const countBy = {}; for (const it of WORD_ITEMS) countBy[it.cat] = (countBy[it.cat] || 0) + 1;
    const vm = verbMastery(verbCards()), nVerbs = Object.keys(vm).length;
    const VW = tr('ww', 'verbs');
    const tenseStatus = t => tenseOn(t) ? `<em class="${countMastered(vm, t) ? 'done' : 'wait'}" title="${tr('Zoveel werkwoorden ken je in deze tijd', 'Number of verbs you know in this tense')}">${countMastered(vm, t)} ${VW}</em>` : '';
    const hard = hardCards();
    const setCount = {}; for (const x of SENTENCES) setCount[x.set] = (setCount[x.set] || 0) + 1;
    const pl = plan('all');
    const seen = Object.keys(S.cards).length;

    const wordOpts = `
      <h4>${tr('Richting', 'Direction')}</h4>
      <div class="chips">${Object.entries(DIRS).map(([d, l]) =>
        `<button class="chip ${s.dirs[d] ? 'on' : ''}" data-dirtoggle="${d}" aria-pressed="${!!s.dirs[d]}">${l}</button>`).join('')}</div>
      <h4>${tr('Onderwerpen', 'Topics')} <span class="inline"><button class="link" data-allcats="1">${tr('alles aan', 'all on')}</button>
        <button class="link" data-allcats="0">${tr('alles uit', 'all off')}</button></span></h4>
      <div class="chips">${cats.map(c => `<button class="chip ${catOn(c) ? 'on' : ''}" data-cat="${esc(c)}" aria-pressed="${catOn(c)}">${esc(c)} <i>${countBy[c]}</i></button>`).join('')}</div>
      <p class="note"><button class="link" data-nav="list">${tr('Woordenlijst bekijken, bewerken of je eigen lijst toevoegen', 'View or edit the word list, or add your own')}</button></p>`;

    const verbOpts = `
      <h4>${tr('Tijden', 'Tenses')}</h4>
      <div class="tenses">
        <div class="tense on fixed"><input type="checkbox" checked disabled><b>${tr('Betekenis', 'Meaning')}</b><span>${tr('altijd eerst: opstaan → levantarse', 'always first: to get up → levantarse')}</span><em class="${countMastered(vm, 'inf') ? 'done' : 'wait'}">${countMastered(vm, 'inf')} ${tr('van', 'of')} ${nVerbs}</em></div>
        ${TENSE_KEYS.map(t => `
        <label class="tense ${tenseOn(t) ? 'on' : ''}"><input type="checkbox" data-tense="${t}" ${tenseOn(t) ? 'checked' : ''}>
          <b>${TENSES[t].label}</b><span>${esc(tenseDesc(t))}</span>${tenseStatus(t)}</label>`).join('')}
      </div>
      <h4>${tr('Welke werkwoorden', 'Which verbs')}</h4>
      <div class="chips">
        <button class="chip ${s.groups.gewoon ? 'on' : ''}" data-group="gewoon" aria-pressed="${!!s.groups.gewoon}">${tr('Gewone werkwoorden', 'Regular verbs')} <i>${window.VERBS.filter(v => !v.refl).length}</i></button>
        <button class="chip ${s.groups.refl ? 'on' : ''}" data-group="refl" aria-pressed="${!!s.groups.refl}">${tr('Wederkerend (me levanto)', 'Reflexive (me levanto)')} <i>${window.VERBS.filter(v => v.refl).length}</i></button>
      </div>
      <label class="toggle"><input type="checkbox" data-set="stepwise" ${s.stepwise ? 'checked' : ''}>
        <span>${tr('Stap voor stap', 'Step by step')}<small>${tr('Een nieuwe tijd pas als je de vorige van dát werkwoord kent', 'A new tense only once you know the previous one for that verb')}</small></span></label>
      <label class="toggle"><input type="checkbox" id="vosotros" ${s.vosotros ? 'checked' : ''}>
        <span>${tr('Vosotros meenemen', 'Include vosotros')}<small>${tr('Wordt alleen in Spanje gebruikt', 'Only used in Spain')}</small></span></label>`;

    const locked = Object.keys(window.SENTENCE_SETS).filter(x => SENT_RULES[x] && !SENT_RULES[x].open(vm));
    const sentOpts = `
      <p class="note">${tr('Vul het ontbrekende woord in. Bij een fout zie je waaróm het zo moet.', 'Fill in the missing word. If you get it wrong, you see why.')}</p>
      <div class="chips">${Object.keys(window.SENTENCE_SETS).map(x =>
        `<button class="chip ${setOn(x) ? 'on' : ''}" data-sset="${esc(x)}" aria-pressed="${setOn(x)}">${esc(setName(x))} <i>${setCount[x]}</i></button>`).join('')}</div>
      ${locked.length ? `<ul class="locks">${locked.map(x => `<li><b>${esc(setName(x))}</b> ${esc(SENT_RULES[x].lock(vm))}</li>`).join('')}</ul>` : ''}`;

    const hardOpts = `
      <p class="note">${tr('Ze verdwijnen vanzelf van deze lijst als je ze een paar keer op rij goed hebt. Extra oefenen verandert je planning niet.',
        'They drop off this list once you get them right a few times in a row. Extra practice doesn\'t change your schedule.')}</p>
      <ul class="hardlist">${hard.map(c => { const v = view(c); return `<li><span>${v.list || v.prompt}</span><b>${v.answers.map(esc).join(' / ')}</b><i>${S.cards[c.id].lapses}×</i></li>`; }).join('')}</ul>`;

    $('#home').innerHTML = `
      <section class="today">
        <div>
          <h1>${pl.count ? tr('Volgende ronde', 'Next round') : tr('Klaar voor vandaag', 'Done for today')}</h1>
          <p class="plan">${pl.count ? planLine(pl) : tr('Alles staat stevig. ¡Hasta mañana!', 'Everything is solid. ¡Hasta mañana!')}</p>
          <p class="note">${esc(cap(pl.budget.why))}. ${tr(`Morgen ${all.tomorrow} herhalingen, deze week ${all.week}.`, `Tomorrow ${all.tomorrow} reviews, this week ${all.week}.`)}</p>
        </div>
        ${pl.count ? `<button class="go" data-start="all">${tr('Start ronde', 'Start round')} <kbd>Enter</kbd></button>` : ''}
      </section>

      <section class="wall">
        <h2>${seen ? tr(`Je tegelwand: ${seen} kaarten`, `Your tile wall: ${seen} cards`) : tr('Je tegelwand', 'Your tile wall')}</h2>
        ${mosaic()}
      </section>

      <section class="modes">
        <h2>${tr('Eén ding oefenen', 'Practise one thing')}</h2>
        <div class="sheet flush">
          ${modeRow('words', 1, tr('Woorden', 'Words'), ws, wordOpts, tr('Kies een richting en een onderwerp.', 'Choose a direction and a topic.'))}
          ${modeRow('verbs', 2, tr('Werkwoorden vervoegen', 'Verb conjugation'), vs, verbOpts, tr('Kies minstens één tijd en groep.', 'Choose at least one tense and group.'))}
          ${modeRow('sentences', 3, tr('Zinnen invullen', 'Fill in the blank'), ss, sentOpts,
            locked.length === Object.keys(window.SENTENCE_SETS).length ? tr('Gaat open zodra je genoeg vervoegingen kent.', 'Unlocks once you know enough conjugations.') : tr('Kies minstens één set.', 'Choose at least one set.'))}
          ${hard.length ? `<div class="mode ${openOpt === 'hard' ? 'open' : ''}">
            <div class="mhead">
              <span class="mkey hardcount">${hard.length}</span>
              <div class="mtitle"><h3>${tr('Moeilijke woorden', 'Difficult words')}</h3><p>${tr('Kaarten die je minstens twee keer fout had', 'Cards you got wrong at least twice')}</p></div>
              <div class="mact">
                <button class="btn quiet" data-opt="hard" aria-expanded="${openOpt === 'hard'}">${tr('Bekijken', 'View')}</button>
                <button class="btn solid" data-start="hard">${tr('Oefenen', 'Practise')}</button>
              </div>
            </div>
            ${openOpt === 'hard' ? `<div class="mopts">${hardOpts}</div>` : ''}
          </div>` : ''}
        </div>
      </section>`;
  }

  // ---------- instellingen ----------
  function renderSettings() {
    const s = S.settings, vlist = esVoices();
    const field = (label, control, help) => `<div class="field"><label>${label}${help ? `<small>${help}</small>` : ''}</label>${control}</div>`;
    $('#settings').innerHTML = `
      <header class="pagehead"><h1>${tr('Instellingen', 'Settings')}</h1></header>

      <section class="sheet">
        <h2>${tr('Leren', 'Learning')}</h2>
        ${field(tr('Tempo nieuwe kaarten', 'Pace of new cards'), `<select data-set="pace">
          ${Object.entries(PACE).map(([k, n]) => `<option value="${k}" ${(s.pace || 'normaal') === k ? 'selected' : ''}>${PACE_NAME[k]}, max ${n}</option>`).join('')}</select>`,
          tr(`Het maximum als je bijna alles goed hebt, minder als je vaker fout zit, en geen nieuwe zolang er ${SHAKY_MAX} zwakke kaarten openstaan.`,
             `The maximum when you get almost everything right, fewer when you make more mistakes, and none while ${SHAKY_MAX} weak cards are open.`))}
        ${field(tr('Kaarten per ronde', 'Cards per round'), `<input type="number" min="5" max="500" data-set="sessionSize" value="${s.sessionSize}">`)}
        <label class="toggle"><input type="checkbox" data-set="retype" ${s.retype ? 'checked' : ''}>
          <span>${tr('Na een fout het antwoord overtypen', 'Retype the answer after a mistake')}</span></label>
      </section>

      <section class="sheet">
        <h2>${tr('Geluid', 'Sound')}</h2>
        <label class="toggle"><input type="checkbox" data-set="speak" ${s.speak ? 'checked' : ''}>
          <span>${tr('Antwoord hardop uitspreken', 'Read the answer out loud')}</span></label>
        ${field('Accent', `<select data-set="accent">
          <option value="es-ES" ${s.accent === 'es-ES' ? 'selected' : ''}>${tr('Spanje', 'Spain')}</option>
          <option value="es-MX" ${s.accent === 'es-MX' ? 'selected' : ''}>${tr('Latijns-Amerika', 'Latin America')}</option></select>`)}
        ${field(tr('Stem', 'Voice'), `<span class="voicerow"><select data-set="voice">
          <option value="">${tr('Automatisch', 'Automatic')}${voice && !s.voice ? ' (' + esc(voice.name) + ')' : ''}</option>
          ${vlist.map(v => `<option value="${esc(v.voiceURI)}" ${s.voice === v.voiceURI ? 'selected' : ''}>${esc(v.name)}, ${esc(v.lang)}</option>`).join('')}
        </select><button class="btn quiet" id="testvoice">${tr('Test', 'Test')}</button></span>`,
          vlist.length ? (vlist.some(v => /natural/i.test(v.name)) ? '' : tr('Microsoft Edge heeft de natuurlijkste Spaanse stemmen, met "Natural" in de naam.', 'Microsoft Edge has the most natural Spanish voices, with "Natural" in the name.'))
            : `<span class="warnline">${tr('Geen Spaanse stem gevonden. Open de app in Chrome of Edge, of installeer Spaans als taal in Windows.', 'No Spanish voice found. Open the app in Chrome or Edge, or install Spanish as a language in Windows.')}</span>`)}
      </section>

      <section class="sheet">
        <h2>Taal / Language</h2>
        ${field(tr('Taal van de app', 'App language'), `<select id="lang">
          <option value="nl" ${EN ? '' : 'selected'}>Nederlands</option>
          <option value="en" ${EN ? 'selected' : ''}>English</option></select>`,
          tr('Elke taal heeft zijn eigen woordenlijst en voortgang.', 'Each language has its own word list and progress.'))}
      </section>

      <section class="sheet">
        <h2>${tr('Je voortgang bewaren', 'Keeping your progress')}</h2>
        <p class="note">${SERVER ? tr('Je voortgang wordt automatisch opgeslagen in opslag/voortgang.json, met een dagelijkse kopie.', 'Your progress is saved automatically to a file, with a daily copy.')
          : tr('Je voortgang staat alleen in deze browser. Download af en toe een backup, zodat je hem terug kunt zetten als de browser wordt gewist.',
               'Your progress is stored only in this browser. Download a backup now and then, so you can restore it if the browser data is cleared.')}</p>
        <div class="row wrap">
          <button class="btn solid" id="export">${tr('Backup downloaden', 'Download backup')}</button>
          <label class="btn quiet">${tr('Backup terugzetten', 'Restore backup')}<input type="file" id="import" accept=".json" hidden></label>
          <button class="link danger" id="reset">${tr('Voortgang wissen', 'Reset progress')}</button>
        </div>
      </section>`;
  }

  // ---------- woordenlijst ----------
  let listQuery = '', listCat = '', editKey = null, addOpen = false;
  function itemCards(it) {
    if (it.verbLink) return [S.cards['v|' + it.verbLink + '|inf']].filter(Boolean);
    return Object.keys(DIRS).map(d => S.cards[wordId(it, d)]).filter(Boolean);
  }
  function itemStatus(it) {
    const sts = itemCards(it);
    if (!sts.length) return ['new', tr('nieuw', 'new')];
    if (sts.some(st => st.known)) return ['known', tr('ken ik al', 'already known')];
    if (sts.some(isHard)) return ['hard', tr('moeilijk', 'difficult')];
    return Math.max(...sts.map(st => st.b)) >= LEARNED_B ? ['learned', tr('geleerd', 'learned')] : ['busy', tr('bezig', 'learning')];
  }
  function markKnown(it) {
    const t = today();
    for (const d of Object.keys(DIRS)) S.cards[wordId(it, d)] = { b: KNOWN_B, due: t + INTERVALS[KNOWN_B], n: 0, lapses: 0, known: true };
  }
  function resetItem(it) { for (const d of Object.keys(DIRS)) delete S.cards[wordId(it, d)]; }

  function renderList(keepFocus) {
    const q = plain(listQuery.trim());
    const items = WORD_ITEMS.filter(it => (!listCat || it.cat === listCat) && (!q || plain(it.nl).includes(q) || plain(it.es).includes(q)));
    const MAX = 300, shown = items.slice(0, MAX);
    const rows = shown.map(it => {
      const k = esc(it.key);
      if (it.key === editKey) return `<tr class="editing" data-key="${k}">
        <td><input class="e-nl" value="${esc(it.nl)}"></td><td><input class="e-es" value="${esc(it.es)}"></td>
        <td colspan="2" class="acts"><button class="btn" data-act="save">${tr('Opslaan', 'Save')}</button><button class="link" data-act="cancel">${tr('annuleren', 'cancel')}</button></td></tr>`;
      const [cls, label] = itemStatus(it);
      return `<tr data-key="${k}"><td>${esc(it.nl)}</td><td>${esc(it.es)}${it.edited ? ` <i class="muted" title="${tr('Door jou aangepast', 'Edited by you')}">✎</i>` : ''}</td>
        <td>${cls === 'new' ? '' : dotsHtml(Math.min(...itemCards(it).map(score))) + ' '}<span class="st ${cls}">${label}</span></td>
        <td class="acts">${cls === 'new' ? `<button class="link" data-act="known">${tr('ken ik al', 'already know')}</button>` : `<button class="link" data-act="reset" title="${tr('Opnieuw leren als nieuw woord', 'Learn again as a new word')}">${tr('opnieuw', 'relearn')}</button>`}
          <button class="link" data-act="edit">${tr('bewerken', 'edit')}</button>${it.edited ? `<button class="link" data-act="orig">${tr('origineel', 'original')}</button>` : ''}</td></tr>`;
    }).join('');
    const unseenInView = items.filter(it => itemStatus(it)[0] === 'new').length;
    $('#list').innerHTML = `
      <header class="pagehead"><h1>${tr('Woordenlijst', 'Word list')}</h1>
        <p class="note">${tr('"Ken ik al" schuift een woord 30 dagen vooruit. Daarna komt het nog één keer terug ter controle.', '"Already know" moves a word 30 days ahead. After that it comes back once as a check.')}</p></header>
      <details class="sheet addlist" ${addOpen ? 'open' : ''}>
        <summary><h2>${tr('Eigen lijst toevoegen', 'Add your own list')}</h2>${S.custom.length ? ` <span class="note">${S.custom.length} ${tr('eigen', 'added')}</span>` : ''}</summary>
        <p class="note">${tr('Eén woord per regel: <code>nederlands = spaans</code>. Plakken uit Excel (twee kolommen) werkt ook. Meerdere goede antwoorden scheid je met <code>/</code>.',
          'One word per line: <code>english = spanish</code>. Pasting two columns from Excel works too. Separate several correct answers with <code>/</code>.')}</p>
        <input id="cname" placeholder="${tr('Naam van de lijst, bijvoorbeeld Duolingo unit 12', 'Name of the list, for example Duolingo unit 12')}">
        <textarea id="ctext" rows="5" placeholder="${tr('de hond = el perro&#10;de auto = el coche / el carro', 'the dog = el perro&#10;the car = el coche / el carro')}"></textarea>
        <div class="row"><button class="btn solid" id="cadd">${tr('Lijst toevoegen', 'Add list')}</button><span id="cmsg" class="note"></span></div>
        ${S.custom.length ? `<ul class="clist">${S.custom.map(c => `<li><span>★ ${esc(c.name)} <i>${parseList(c.text).length} ${tr('woorden', 'words')}</i></span><button class="link danger" data-del="${c.id}">${tr('Verwijderen', 'Delete')}</button></li>`).join('')}</ul>` : ''}
      </details>
      <section class="sheet">
        <div class="listbar">
          <input id="lq" type="search" placeholder="${tr('Zoeken in Nederlands of Spaans', 'Search in English or Spanish')}" value="${esc(listQuery)}">
          <select id="lcat"><option value="">${tr('Alle onderwerpen', 'All topics')}</option>${categories().map(c => `<option ${c === listCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </div>
        <p class="note">${items.length} ${tr('woorden', 'words')}${items.length > MAX ? tr(`, de eerste ${MAX} staan hieronder`, `, the first ${MAX} are shown`) : ''}.
          ${unseenInView ? `<button class="link" id="bulkknown">${tr(`Markeer alle ${unseenInView} nieuwe woorden hieronder als "ken ik al"`, `Mark all ${unseenInView} new words below as already known`)}</button>` : ''}</p>
        <div class="tablewrap"><table class="wl"><thead><tr><th>${tr('Nederlands', 'English')}</th><th>${tr('Spaans', 'Spanish')}</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
    if (keepFocus) { const el = $('#lq'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }

  // ---------- oefensessie ----------
  let sess = null;

  // herhalingen met de nieuwe kaarten er gelijkmatig tussen
  function spread(a, b) {
    const q = [], ratio = b.length ? Math.max(1, Math.floor(a.length / b.length)) : a.length;
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      for (let k = 0; k < ratio && i < a.length; k++) q.push(a[i++]);
      if (j < b.length) q.push(b[j++]);
    }
    return q;
  }
  function start(kind) {
    const size = S.settings.sessionSize || 9999, extra = new Set();
    let q;
    if (kind === 'hard') {
      q = shuffle(hardCards()).slice(0, size);
    } else {
      const pl = plan(kind);
      pl.extra.forEach(c => extra.add(c.id));
      q = spread(pl.old, shuffle([...pl.fresh, ...pl.extra]));
    }
    if (!q.length) return;
    sess = { kind, drill: kind === 'hard', extra, seen: new Set(), queue: q, total: q.length, done: 0, failed: new Set(), wrong: [],
             state: 'asking', res: null, v: null, hint: 0, plays: 0 };
    show('practice');
    next();
  }

  function next() {
    if (!sess.queue.length) return finish();
    const card = sess.queue[0], v = view(card);
    Object.assign(sess, { v, state: 'asking', res: null, hint: 0, plays: 0 });
    const isNew = !S.cards[card.id];
    $('#pbadge').innerHTML = esc(v.badge) + (isNew ? ` <span class="new">${tr('nieuw', 'new')}</span>`
      : (sess.failed.has(card.id) ? ` <span class="again">${tr('nog een keer', 'once more')}</span>` : '') + ' ' + dotsHtml(score(S.cards[card.id])));
    $('#pprompt').innerHTML = v.prompt;
    $('#pprompt').className = 'prompt' + (v.long ? ' long' : '') + (v.listen ? ' listen' : '');
    $('#psub').innerHTML = v.sub;
    $('#phint').textContent = '';
    $('#feedback').className = 'feedback'; $('#feedback').innerHTML = '';
    $('#keys').innerHTML = `<span><kbd>Enter</kbd> ${tr('controleren', 'check')}</span><span><kbd>?</kbd> hint</span>`
      + (v.listen ? `<span><kbd>Tab</kbd> ${tr('nog een keer', 'again')}</span>` : '') + `<span><kbd>Esc</kbd> ${tr('stoppen', 'stop')}</span>`;
    const inp = $('#answer');
    inp.value = ''; inp.readOnly = false; inp.className = '';
    inp.placeholder = v.lang === 'es' ? tr('Typ in het Spaans…', 'Type in Spanish…') : tr('Typ in het Nederlands…', 'Type in English…');
    inp.focus();
    if (v.listen) $('#bigsay').onclick = () => { replay(); inp.focus(); };
    const left = sess.queue.length;
    $('#pfill').style.width = (100 * sess.done / (sess.done + left)) + '%';
    $('#pcount').textContent = `${sess.done} / ${sess.done + left}` + (sess.drill ? tr(' · extra oefenen', ' · extra practice') : '');
    if (v.sayFirst) speak(v.say, v.listen);
  }
  function replay() { sess.plays++; speak(sess.v.say, true, sess.plays % 2 ? 0.65 : 0.92); }

  // hint: lidwoord/voornaamwoord + steeds een letter meer
  function hintText(ans, level) {
    const m = ans.match(/^((?:el|la|los|las|un|una|de|het|een|the|a|an|to|me|te|se|nos|os)\s+)?(.*)$/i);
    let shown = 0;
    return (m[1] || '') + [...m[2]].map(ch => {
      if (/[\s,.¿?¡!]/.test(ch)) return ch;
      return ++shown <= level ? ch : '·';
    }).join('');
  }
  function showHint() {
    const a = sess.v.answers[0];
    sess.hint = Math.min(sess.hint + 1, a.length);
    $('#phint').innerHTML = `hint: <b>${esc(hintText(a, sess.hint))}</b>`;
  }

  const MSG = {
    exact: ['good', '¡Muy bien!'],
    article: ['good', tr('Goed. Let op het lidwoord', 'Correct. Mind the article')],
    accent: ['good', tr('Goed. Let op de accenten', 'Correct. Mind the accents')],
    typo: ['warn', tr('Typfout, toch goed gerekend', 'Typo, counted as correct')],
    hint: ['warn', tr('Goed, met hint. Komt wat sneller terug', 'Correct, with a hint. Comes back a bit sooner')],
    wrong: ['bad', tr('Niet goed', 'Not quite')],
    empty: ['bad', tr('Geen antwoord', 'No answer')],
    override_ok: ['good', tr('Goed gerekend', 'Counted as correct')],
    override_bad: ['bad', tr('Fout gerekend', 'Counted as wrong')],
  };

  function evaluate() {
    const inp = $('#answer'), v = sess.v;
    const r = Check.check(inp.value, v.answers, { lang: v.lang, verb: v.verb });
    sess.res = { ok: r.ok, kind: r.ok && sess.hint ? 'hint' : r.kind, hinted: sess.hint > 0, given: inp.value.trim(), override: false };
    if (!r.ok && S.settings.retype) {
      sess.state = 'retype';
      inp.value = ''; inp.placeholder = tr('Typ het juiste antwoord over…', 'Retype the correct answer…');
    } else {
      sess.state = 'feedback'; inp.readOnly = true;
    }
    renderFeedback();
    speak(v.say);
  }

  function renderFeedback() {
    const v = sess.v, r = sess.res;
    const key = r.override ? (r.ok ? 'override_ok' : 'override_bad') : r.kind;
    const [cls, msg] = MSG[key];
    const fb = $('#feedback');
    fb.className = 'feedback show ' + cls;
    fb.innerHTML = `
      <div class="fmsg">${msg}</div>
      <div class="fans ${v.long ? 'long' : ''}"><span>${v.reveal || v.answers.map(esc).join(' <i>/</i> ')}</span>
        <button class="say" id="say" title="${tr('Uitspreken', 'Pronounce')}" aria-label="${tr('Uitspreken', 'Pronounce')}">${SPEAKER}</button></div>
      ${v.why ? `<div class="fwhy">${esc(v.why)}</div>` : ''}
      ${!r.ok && r.given ? `<div class="fgiven">${tr('jij', 'you')}: <s>${esc(r.given)}</s></div>` : ''}`;
    $('#say').onclick = () => { speak(v.say, true); $('#answer').focus(); };
    const keys = [sess.state === 'retype' ? `<span><kbd>Enter</kbd> ${tr('na overtypen verder', 'continue after retyping')}</span>` : `<span><kbd>Enter</kbd> ${tr('volgende', 'next')}</span>`,
                  `<span><kbd>Tab</kbd> ${r.ok ? tr('toch fout', 'mark wrong') : tr('toch goed', 'mark correct')}</span>`];
    if (sess.state === 'feedback') keys.push(`<span><kbd>${tr('Spatie', 'Space')}</kbd> ${tr('uitspraak', 'pronunciation')}</span>`);
    keys.push(`<span><kbd>Esc</kbd> ${tr('stoppen', 'stop')}</span>`);
    $('#keys').innerHTML = keys.join('');
  }

  function toggleOverride() {
    const r = sess.res;
    r.ok = !r.ok; r.override = true;
    sess.state = 'feedback';
    const inp = $('#answer'); inp.readOnly = true; inp.value = r.given; inp.className = '';
    renderFeedback();
  }

  function retypeCheck() {
    const inp = $('#answer'), v = sess.v;
    if (Check.check(inp.value, v.answers, { lang: v.lang, verb: v.verb }).ok) { commit(); next(); }
    else { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); }
  }

  function commit() {
    const card = sess.queue[0], { ok, hinted, override } = sess.res;
    const t = today(), nw = Date.now(), L = dayLog();
    let st = S.cards[card.id];
    const isNew = !st, extra = sess.drill || sess.extra.has(card.id);
    if (isNew) { st = S.cards[card.id] = { b: 0, due: t, n: 0, lapses: 0 }; const k = 'new' + KNAME[card.kind]; L[k] = (L[k] || 0) + 1; }
    st.n++; st.last = t; st.at = nw; L.reviews++;
    if (!sess.seen.has(card.id)) { // eerste poging telt mee voor het tempo
      sess.seen.add(card.id);
      S.recent = ((S.recent || '') + (ok && !(hinted && !override) ? '1' : '0')).slice(-RECENT);
    }
    sess.queue.shift();
    const later = pos => sess.queue.splice(Math.min(sess.queue.length, pos), 0, card);
    if (ok) {
      L.correct++; sess.done++; st.ok = true; delete st.known;
      if (st.learn) {
        // leerfase: fout → goed → na ~10 min nog eens goed → morgen weer
        if (hinted && !override) { st.dueAt = nw + MIN; later(4); }
        else if (st.learn === 1) {
          st.learn = 2; st.dueAt = nw + LEARN_GAP;
          if (sess.queue.length >= 6) later(10 + (Math.random() * 4 | 0)); // in deze ronde nog een keer
        } else {
          delete st.learn; delete st.dueAt;
          st.due = t + INTERVALS[Math.max(1, st.b)];
        }
      } else if (extra) { /* extra oefenen: planning blijft zoals hij was */ }
      else if (hinted && !override) {
        // met hint: niet vooruit, wel sneller terug
        if (isNew) st.b = 1;
        st.due = t + Math.max(1, Math.round(INTERVALS[st.b] / 2));
      } else {
        st.b = isNew ? LEARNED_B : Math.min(MAXB, st.b + 1); // nieuw en meteen goed = kende je al
        st.due = t + INTERVALS[st.b];
      }
    } else {
      if (!isNew && !extra && !st.learn) st.lapses++;
      // terug naar de leerfase; een kaart die je goed kende zakt maar half terug
      if (!st.learn) st.b = Math.max(1, Math.floor(st.b / 2));
      st.learn = 1; st.dueAt = nw + MIN; st.due = t; st.ok = false; delete st.known;
      if (!sess.failed.has(card.id)) { sess.failed.add(card.id); sess.wrong.push(card); }
      later(3 + (Math.random() * 3 | 0));
    }
    sess.res = null; sess.state = 'asking';
    snapshot();
    save();
  }

  function finish() {
    if (sess && (sess.state === 'feedback' || sess.state === 'retype') && sess.res) commit();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const s = sess;
    // alleen de kaarten die je echt beantwoord hebt tellen mee (bij stoppen halverwege)
    const tried = s.seen.size;
    const firstTry = tried ? Math.round(100 * (tried - s.failed.size) / tried) + '%' : '–';
    const rows = s.wrong.map(c => { const v = view(c); return `<li><span>${v.list || v.prompt}</span><b>${v.answers.map(esc).join(' / ')}</b></li>`; }).join('');
    const nx = s.kind === 'hard' ? null : plan(s.kind);
    $('#done').innerHTML = `
      <div class="sheet donebox">
        <h2>${s.queue.length ? tr('Gestopt', 'Stopped') : '¡Terminado!'}</h2>
        <div class="figures">
          <div><b>${s.done}</b><span>${tr('kaarten gedaan', 'cards done')}</span></div>
          <div><b>${firstTry}</b><span>${tr('in één keer goed', 'right first time')}</span></div>
          <div><b>${streak()}</b><span>${tr('dagen op rij', 'day streak')}</span></div>
        </div>
        ${rows ? `<h3>${tr('Deze komen zo nog een keer terug', 'These will come back again soon')}</h3><ul class="wrong">${rows}</ul>` : ''}
        ${nx && nx.count ? `<p class="plan">${tr('Volgende ronde', 'Next round')}: ${planLine(nx)}<br><span class="note">${tr('Nieuw', 'New')}: ${esc(nx.budget.why)}</span></p>` : ''}
        ${nx ? distHtml(nx.st) : ''}
        <div class="row">
          ${s.kind === 'hard' ? (hardCards().length ? `<button class="go" id="again">${tr('Nog een ronde', 'Another round')} <kbd>Enter</kbd></button>` : '')
            : nx.count ? `<button class="go" id="again">${tr('Ga verder met leren', 'Continue learning')} <kbd>Enter</kbd></button>`
            : `<span class="muted">${tr('Alles staat stevig. ¡Hasta mañana!', 'Everything is solid. ¡Hasta mañana!')}</span>`}
          <button class="btn quiet" id="back">${tr('Terug', 'Back')} <kbd>Esc</kbd></button>
        </div>
      </div>`;
    sess = { kind: s.kind, ended: true };
    push();
    show('done');
  }

  // ---------- toetsenbord & klikken ----------
  $('#answer').addEventListener('keydown', e => {
    if (!sess || sess.ended) return;
    // toetsen van het oefenen niet doorgeven aan het eindscherm
    if (['Enter', 'Tab', 'Escape', ' ', '?'].includes(e.key)) e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (sess.state === 'asking') evaluate();
      else if (sess.state === 'retype') retypeCheck();
      else { commit(); next(); }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (sess.state !== 'asking') toggleOverride();
      else if (sess.v.listen) replay();
    } else if (e.key === '?' && sess.state === 'asking') {
      e.preventDefault(); showHint();
    } else if (e.key === 'Escape') {
      e.preventDefault(); finish();
    } else if (e.key === ' ' && sess.state === 'feedback') {
      e.preventDefault(); speak(sess.v.say, true);
    }
  });
  $('#practice').addEventListener('click', e => { if (!e.target.closest('button')) $('#answer').focus(); });
  $('#stop').addEventListener('click', () => finish());

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (!$('#home').hidden && !typing) {
      if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      const k = { 1: 'words', 2: 'verbs', 3: 'sentences', Enter: 'all' }[e.key];
      const btn = k && document.querySelector(`[data-start="${k}"]`);
      if (btn) btn.click();
    } else if (!$('#done').hidden) {
      if (e.key === 'Enter' && $('#again')) { e.preventDefault(); start(sess.kind); }
      if (e.key === 'Escape') goHome();
    } else if (!$('#list').hidden && e.key === 'Escape') {
      if (editKey) { editKey = null; renderList(); } else goHome();
    } else if ((current === 'progress' || current === 'settings') && e.key === 'Escape' && !typing) goHome();
  });
  $('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) go(b.dataset.nav); });

  $('#done').addEventListener('click', e => {
    if (e.target.closest('#again')) start(sess.kind);
    if (e.target.closest('#back')) goHome();
  });
  $('#brand').addEventListener('click', () => { if (sess && !sess.ended && !$('#practice').hidden) finish(); else goHome(); });

  $('main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.start) return start(d.start);
    if (d.group) { S.settings.groups[d.group] = !S.settings.groups[d.group]; save(); return rerender(); }
    if (d.dirtoggle) { S.settings.dirs[d.dirtoggle] = !S.settings.dirs[d.dirtoggle]; save(); return rerender(); }
    if (d.sset !== undefined) { S.settings.sets[d.sset] = !setOn(d.sset); save(); return rerender(); }
    if (d.cat !== undefined) { S.settings.cats[d.cat] = !catOn(d.cat); save(); return rerender(); }
    if (d.allcats !== undefined) { for (const c of categories()) S.settings.cats[c] = d.allcats === '1'; save(); return rerender(); }
    if (d.opt) { openOpt = openOpt === d.opt ? null : d.opt; return rerender(); }
    if (d.nav) return go(d.nav);
    if (b.id === 'testvoice') return speak('¡Hola! ¿Qué tal estás? Vamos a practicar un poco de español.', true);
    if (d.del) {
      const c = S.custom.find(x => String(x.id) === d.del);
      if (c && confirm(tr(`Lijst "${c.name}" verwijderen?`, `Delete list "${c.name}"?`))) { S.custom = S.custom.filter(x => x !== c); save(); buildWords(); rerender(); }
      return;
    }
    if (b.id === 'cadd') {
      const name = $('#cname').value.trim() || tr('Eigen lijst', 'My list'), text = $('#ctext').value;
      const n = parseList(text).length;
      if (!n) { $('#cmsg').textContent = tr('Geen woorden gevonden. Gebruik: nederlands = spaans', 'No words found. Use: english = spanish'); return; }
      S.custom.push({ id: Date.now(), name, text }); addOpen = true; save(); buildWords(); rerender();
      $('#cmsg').textContent = tr(`${n} woorden toegevoegd aan "${name}"`, `${n} words added to "${name}"`);
      return;
    }
    if (b.id === 'export') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = tr('spaanstool-backup-', 'spanish-backup-') + new Date().toISOString().slice(0, 10) + '.json';
      a.click(); URL.revokeObjectURL(a.href);
      return;
    }
    if (b.id === 'reset' && confirm(tr('Alle voortgang wissen? Je eigen lijsten en aanpassingen blijven bewaard.', 'Reset all progress? Your own lists and edits will be kept.'))) {
      S.cards = {}; S.log = {}; save(); rerender();
    }
  });

  // tooltip bij de grafieken
  const vtip = document.createElement('div');
  vtip.className = 'vtip'; vtip.hidden = true; document.body.appendChild(vtip);
  $('main').addEventListener('mousemove', e => {
    const h = e.target.closest && e.target.closest('[data-tip]');
    if (!h) { vtip.hidden = true; return; }
    const [head, ...rest] = h.dataset.tip.split('\n');
    vtip.innerHTML = `<b>${esc(head)}</b>\n${rest.map(esc).join('\n')}`;
    vtip.hidden = false;
    const r = vtip.getBoundingClientRect();
    vtip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 14) + 'px';
    vtip.style.top = Math.max(8, e.clientY - r.height - 12) + 'px';
  });
  $('main').addEventListener('mouseleave', () => { vtip.hidden = true; });

  $('main').addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'lang') {
      if (el.value === LANG) return;
      push(); window.setLang(el.value);
      const u = new URL(location.href); u.searchParams.delete('lang');
      return location.replace(u.href);
    }
    if (el.dataset.tense) { S.settings.tenses[el.dataset.tense] = el.checked; save(); return rerender(); }
    if (el.id === 'vosotros') { S.settings.vosotros = el.checked; save(); return rerender(); }
    if (el.dataset.set) {
      const k = el.dataset.set;
      S.settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(0, parseInt(el.value, 10) || 0) : el.value;
      save();
      if (k === 'accent' || k === 'voice') { pickVoice(); speak('¡Hola! ¿Qué tal?', true); }
      return rerender();
    }
    if (el.id === 'import' && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try { S = merge(JSON.parse(fr.result)); save(); push(); buildWords(); pickVoice(); rerender(); alert(tr('Backup teruggezet.', 'Backup restored.')); }
        catch (err) { alert(tr('Dit bestand kon niet gelezen worden.', 'This file could not be read.')); }
      };
      fr.readAsText(el.files[0]);
    }
  });

  $('#list').addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('addlist')) addOpen = e.target.open; }, true);
  $('#list').addEventListener('input', e => { if (e.target.id === 'lq') { listQuery = e.target.value; renderList(true); } });
  $('#list').addEventListener('change', e => { if (e.target.id === 'lcat') { listCat = e.target.value; renderList(); } });
  $('#list').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('tr.editing')) { e.preventDefault(); e.target.closest('tr').querySelector('[data-act="save"]').click(); }
  });
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'bulkknown') {
      const q = plain(listQuery.trim());
      const items = WORD_ITEMS.filter(it => (!listCat || it.cat === listCat) && (!q || plain(it.nl).includes(q) || plain(it.es).includes(q)) && itemStatus(it)[0] === 'new');
      if (confirm(tr(`${items.length} woorden markeren als "ken ik al"? Ze komen over 30 dagen nog één keer langs ter controle.`,
                     `Mark ${items.length} words as "already known"? They'll come back once in 30 days as a check.`))) {
        items.forEach(markKnown); save(); renderList();
      }
      return;
    }
    const tr = b.closest('tr'); if (!tr) return;
    const it = WORD_BY_KEY[tr.dataset.key]; if (!it) return;
    const act = b.dataset.act;
    if (act === 'known') { markKnown(it); save(); }
    else if (act === 'reset') { resetItem(it); save(); }
    else if (act === 'edit') { editKey = it.key; renderList(); tr.parentNode && $('tr.editing .e-nl') && $('tr.editing .e-nl').focus(); return; }
    else if (act === 'cancel') { editKey = null; }
    else if (act === 'orig') { delete S.edits[it.key]; save(); buildWords(); }
    else if (act === 'save') {
      const nl = tr.querySelector('.e-nl').value.trim(), es = tr.querySelector('.e-es').value.trim();
      if (!nl || !es) return;
      if (nl === it.orig.nl && es === it.orig.es) delete S.edits[it.key]; else S.edits[it.key] = { nl, es };
      editKey = null; save(); buildWords();
    }
    renderList();
  });

  // Eenmalig bij de overstap naar het leerpad: vervoegingen en zinnen van vóór het leerpad wissen
  // (woorden blijven staan). Kopie van daarvoor: opslag/backups/voor-leerpad.json
  function migrate() {
    S.migrated = S.migrated || {};
    if (S.migrated.leerpad) return;
    for (const id of Object.keys(S.cards))
      if ((id.startsWith('v|') && !id.endsWith('|inf')) || id.startsWith('s|')) delete S.cards[id];
    S.migrated.leerpad = true;
    save();
  }

  (async function boot() {
    document.title = tr('¡Vamos! Spaans', '¡Vamos! Spanish');
    const NAV = { home: tr('Vandaag', 'Today'), progress: tr('Voortgang', 'Progress'), list: tr('Woordenlijst', 'Word list'), settings: tr('Instellingen', 'Settings') };
    for (const b of document.querySelectorAll('.tabs [data-nav]')) b.textContent = NAV[b.dataset.nav];
    $('#stop').textContent = tr('Stoppen', 'Stop');
    $('#answer').setAttribute('aria-label', tr('Jouw antwoord', 'Your answer'));
    // online: als app te installeren, werkt ook offline, en haalt altijd eerst de nieuwste versie op
    if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    await loadFromServer();
    migrate();
    buildWords();
    pickVoice();
    goHome();
  })();
})();
