// Soepel nakijken: accenten, lidwoorden, voornaamwoorden en kleine typfouten.
(function (root) {
  const ART = {
    es: /^(el|la|los|las|un|una|unos|unas|lo)\s+/,
    nl: /^(de|het|een)\s+/,
    en: /^(the|a|an|to)\s+/,
  };
  const PRON = /^(yo|tu|tú|el|él|ella|usted|nosotros|nosotras|vosotros|vosotras|ellos|ellas|ustedes)\s+/;
  const RANK = { exact: 0, article: 1, accent: 2, typo: 3 };

  function clean(s) {
    return String(s).toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\.\.\./g, ' ')
      .replace(/[¿?¡!.,;:"'…]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function plain(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), prev2 = prev;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        // omgedraaide letters (bicicelta) tellen als één fout
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      prev2 = prev; prev = cur;
    }
    return prev[n];
  }

  // typfouten: alleen bij langere woorden, en per woord max. 1 fout (anders wordt "esta" goed gerekend voor "estoy")
  function typoMax(a) { return !a.includes(' ') && a.length >= 12 ? 2 : 1; }

  function splitAnswers(s) { return String(s).split('/').map(x => x.trim()).filter(Boolean); }

  // opts: { lang: 'es' | 'nl', verb: bool }
  function check(input, answers, opts) {
    const art = ART[opts.lang] || ART.es;
    let inp = clean(input);
    if (!inp) return { ok: false, kind: 'empty' };
    if (opts.verb) inp = inp.replace(PRON, '');
    const inpNo = inp.replace(art, '');
    let best = null;
    for (const ans of answers) {
      const a = clean(ans), aNo = a.replace(art, '');
      let kind = null;
      if (inp === a) kind = 'exact';
      else if (inpNo === aNo) kind = 'article';
      else if (plain(inp) === plain(a) || plain(inpNo) === plain(aNo)) kind = 'accent';
      else if (!opts.verb && aNo.length >= 6 && lev(plain(inpNo), plain(aNo)) <= typoMax(aNo)) kind = 'typo';
      if (kind && (!best || RANK[kind] < RANK[best.kind])) best = { ok: true, kind, answer: ans };
      if (kind === 'exact') break;
    }
    return best || { ok: false, kind: 'wrong' };
  }

  const api = { check, clean, splitAnswers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Check = api;
})(this);
