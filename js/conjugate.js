// Vervoegingsmotor: regelmatige regels + uitzonderingen per werkwoord (zie data/verbs.js)
(function (root) {
  const PERSONS = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];
  const PERSON_NL = ['ik', 'jij', 'hij/zij/u', 'wij', 'jullie', 'zij/u (mv.)'];
  const PERSON_EN = ['I', 'you', 'he/she/you (formal)', 'we', 'you (plural)', 'they/you (plural)'];
  const PRON_SPEAK = ['yo', 'tú', 'él', 'nosotros', 'vosotros', 'ellos'];

  const TENSES = {
    presente:    { label: 'Presente',             nl: 'tegenwoordige tijd · hablo',                     en: 'present tense · hablo' },
    proximo:     { label: 'Futuro próximo',       nl: 'ga … · voy a hablar',                            en: 'going to … · voy a hablar' },
    progresivo:  { label: 'Presente progresivo',  nl: 'ben aan het … · estoy hablando',                 en: 'am …-ing · estoy hablando' },
    indefinido:  { label: 'Pretérito indefinido', nl: 'verleden tijd, afgerond · hablé',                en: 'past tense, completed · hablé' },
    imperfecto:  { label: 'Pretérito imperfecto', nl: 'verleden tijd, gewoonte/beschrijving · hablaba', en: 'past tense, habit/description · hablaba' },
    perfecto:    { label: 'Pretérito perfecto',   nl: 'heb ge… · he hablado',                           en: 'have …-ed · he hablado' },
    futuro:      { label: 'Futuro simple',        nl: 'zal … · hablaré',                                en: 'will … · hablaré' },
    condicional: { label: 'Condicional',          nl: 'zou … · hablaría',                               en: 'would … · hablaría' },
  };

  const E = {
    presente: {
      ar: ['o', 'as', 'a', 'amos', 'áis', 'an'],
      er: ['o', 'es', 'e', 'emos', 'éis', 'en'],
      ir: ['o', 'es', 'e', 'imos', 'ís', 'en'],
    },
    indefinido: {
      ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
      er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
    },
    imperfecto: {
      ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
      er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    },
  };
  E.indefinido.ir = E.indefinido.er;
  E.imperfecto.ir = E.imperfecto.er;

  const FUT = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
  const COND = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
  const STRONG = ['e', 'iste', 'o', 'imos', 'isteis', 'ieron'];
  const HABER = ['he', 'has', 'ha', 'hemos', 'habéis', 'han'];
  const IR = ['voy', 'vas', 'va', 'vamos', 'vais', 'van'];
  const ESTAR = ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'];

  // stamwisseling presente (niet bij nosotros/vosotros)
  const SC = { ie: ['e', 'ie'], ue: ['o', 'ue'], i: ['e', 'i'], uue: ['u', 'ue'] };
  // stamwisseling -ir werkwoorden in indefinido 3e persoon + gerundio
  const SC3 = { ie: ['e', 'i'], i: ['e', 'i'], ue: ['o', 'u'] };

  function swap(stem, pair) {
    const i = stem.lastIndexOf(pair[0]);
    return i < 0 ? stem : stem.slice(0, i) + pair[1] + stem.slice(i + 1);
  }

  function parts(v) {
    const inf = v.v;
    const type = inf.slice(-2).normalize('NFD').replace(/[̀-ͯ]/g, '');
    return { inf, type, stem: inf.slice(0, -2) };
  }

  function participle(v) {
    if (v.part) return v.part;
    const { type, stem } = parts(v);
    if (type === 'ar') return stem + 'ado';
    return /[aeo]$/.test(stem) ? stem + 'ído' : stem + 'ido';
  }

  function gerund(v) {
    if (v.ger) return v.ger;
    const { type, stem } = parts(v);
    if (type === 'ar') return stem + 'ando';
    let s = stem;
    if (type === 'ir' && SC3[v.sc]) s = swap(s, SC3[v.sc]);
    return /[aeo]$/.test(s) ? s + 'yendo' : s + 'iendo';
  }

  // Wederkerend (levantarse): voornaamwoord ervoor, of vastgeplakt bij "voy a …" en "estoy …-ando".
  // Twee goede antwoorden worden gescheiden met " / ".
  const REFL = ['me', 'te', 'se', 'nos', 'os', 'se'];
  function accentGer(g) { return g.replace(/ando$/, 'ándo').replace(/endo$/, 'éndo'); }

  function conjugate(v, tense) {
    if (!v.refl) return conjBase(v, tense);
    const base = Object.assign({}, v, { v: v.v.slice(0, -2), refl: false });
    if (tense === 'proximo')
      return IR.map((x, p) => `${REFL[p]} ${x} a ${base.v} / ${x} a ${base.v}${REFL[p]}`);
    if (tense === 'progresivo') {
      const g = gerund(base);
      return ESTAR.map((x, p) => `${REFL[p]} ${x} ${g} / ${x} ${accentGer(g)}${REFL[p]}`);
    }
    return conjBase(base, tense).map((f, p) => REFL[p] + ' ' + f);
  }

  function conjBase(v, tense) {
    if (v.ov && v.ov[tense]) return v.ov[tense].slice();
    const { inf, type, stem } = parts(v);
    switch (tense) {
      case 'presente': {
        const f = E.presente[type].map((e, p) =>
          (v.sc && [0, 1, 2, 5].includes(p) ? swap(stem, SC[v.sc]) : stem) + e);
        if (v.yo) f[0] = v.yo;
        return f;
      }
      case 'indefinido': {
        if (v.pret) {
          return STRONG.map((e, p) => v.pret + (p === 5 && v.pret.endsWith('j') ? 'eron' : e));
        }
        const f = E.indefinido[type].map((e, p) =>
          (type === 'ir' && SC3[v.sc] && (p === 2 || p === 5) ? swap(stem, SC3[v.sc]) : stem) + e);
        if (type === 'ar') {
          const last = stem.slice(-1), base = stem.slice(0, -1);
          if (last === 'c') f[0] = base + 'qué';
          else if (last === 'g') f[0] = base + 'gué';
          else if (last === 'z') f[0] = base + 'cé';
        }
        return f;
      }
      case 'imperfecto':
        return E.imperfecto[type].map(e => stem + e);
      case 'futuro':
        return FUT.map(e => (v.fut || inf) + e);
      case 'condicional':
        return COND.map(e => (v.fut || inf) + e);
      case 'perfecto': {
        const p = participle(v);
        return HABER.map(h => h + ' ' + p);
      }
      case 'proximo':
        return IR.map(x => x + ' a ' + inf);
      case 'progresivo': {
        const g = gerund(v);
        return ESTAR.map(x => x + ' ' + g);
      }
    }
    return [];
  }

  // Hoe lastig is dit werkwoord in deze tijd? 0 = regelmatig, 1 = kleine afwijking, 2 = onregelmatig
  function difficulty(v, tense) {
    const { type, stem } = parts(v.refl ? Object.assign({}, v, { v: v.v.slice(0, -2) }) : v);
    if (v.ov && v.ov[tense]) return 2;
    switch (tense) {
      case 'presente': return v.yo && v.sc ? 2 : (v.yo || v.sc) ? 1 : 0;
      case 'indefinido':
        if (v.pret) return 2;
        if ((type === 'ir' && SC3[v.sc]) || (type === 'ar' && /[cgz]$/.test(stem))) return 1;
        return 0;
      case 'futuro': case 'condicional': return v.fut ? 2 : 0;
      case 'perfecto': return v.part ? 2 : 0;
      case 'progresivo':
        if (v.ger) return 2;
        if ((type === 'ir' && SC3[v.sc]) || (type !== 'ar' && /[aeo]$/.test(stem))) return 1;
        return 0;
      default: return 0;
    }
  }

  const api = { conjugate, difficulty, participle, gerund, TENSES, TENSE_KEYS: Object.keys(TENSES), PERSONS, PERSON_NL, PERSON_EN, PRON_SPEAK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conj = api;
})(this);
