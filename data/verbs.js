// Werkwoorden voor de vervoegingsmodus.
// sc = stamwisseling: 'ie' (pensar), 'ue' (poder), 'i' (pedir), 'uue' (jugar)
// yo = afwijkende ik-vorm presente, pret = sterke stam indefinido, fut = stam futuro/condicional
// part = voltooid deelwoord, ger = gerundio, ov = volledige afwijkende tijden
(function (root) {
  const VERBS = [
    { v: 'ser', nl: 'zijn (blijvend)', ov: {
      presente: ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
      indefinido: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      imperfecto: ['era', 'eras', 'era', 'éramos', 'erais', 'eran'] } },
    { v: 'estar', nl: 'zijn (toestand/plaats)', pret: 'estuv', skip: ['progresivo'], ov: {
      presente: ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'] } },
    { v: 'tener', nl: 'hebben', sc: 'ie', yo: 'tengo', pret: 'tuv', fut: 'tendr' },
    { v: 'hacer', nl: 'doen / maken', yo: 'hago', fut: 'har', part: 'hecho', ov: {
      indefinido: ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron'] } },
    { v: 'ir', nl: 'gaan', ger: 'yendo', ov: {
      presente: ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
      indefinido: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      imperfecto: ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban'] } },
    { v: 'poder', nl: 'kunnen', skip: ['progresivo'], sc: 'ue', pret: 'pud', fut: 'podr', ger: 'pudiendo' },
    { v: 'decir', nl: 'zeggen', sc: 'i', yo: 'digo', pret: 'dij', fut: 'dir', part: 'dicho' },
    { v: 'querer', nl: 'willen', sc: 'ie', pret: 'quis', fut: 'querr' },
    { v: 'saber', nl: 'weten', skip: ['progresivo'], yo: 'sé', pret: 'sup', fut: 'sabr' },
    { v: 'ver', nl: 'zien', part: 'visto', ov: {
      presente: ['veo', 'ves', 've', 'vemos', 'veis', 'ven'],
      indefinido: ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'],
      imperfecto: ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían'] } },
    { v: 'dar', nl: 'geven', ov: {
      presente: ['doy', 'das', 'da', 'damos', 'dais', 'dan'],
      indefinido: ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron'] } },
    { v: 'venir', nl: 'komen', sc: 'ie', yo: 'vengo', pret: 'vin', fut: 'vendr' },
    { v: 'hablar', nl: 'praten / spreken' },
    { v: 'comer', nl: 'eten' },
    { v: 'vivir', nl: 'wonen / leven' },
    { v: 'poner', nl: 'leggen / zetten', yo: 'pongo', pret: 'pus', fut: 'pondr', part: 'puesto' },
    { v: 'salir', nl: 'weggaan / uitgaan', yo: 'salgo', fut: 'saldr' },
    { v: 'trabajar', nl: 'werken' },
    { v: 'estudiar', nl: 'studeren' },
    { v: 'llegar', nl: 'aankomen' },
    { v: 'buscar', nl: 'zoeken' },
    { v: 'pagar', nl: 'betalen' },
    { v: 'empezar', nl: 'beginnen', sc: 'ie' },
    { v: 'pensar', nl: 'denken', sc: 'ie' },
    { v: 'entender', nl: 'begrijpen (verstaan)', sc: 'ie' },
    { v: 'cerrar', nl: 'sluiten', sc: 'ie' },
    { v: 'perder', nl: 'verliezen', sc: 'ie' },
    { v: 'preferir', nl: 'liever hebben', sc: 'ie' },
    { v: 'sentir', nl: 'voelen', sc: 'ie' },
    { v: 'dormir', nl: 'slapen', sc: 'ue' },
    { v: 'volver', nl: 'terugkomen', sc: 'ue', part: 'vuelto' },
    { v: 'encontrar', nl: 'vinden', sc: 'ue' },
    { v: 'recordar', nl: 'zich herinneren (iets)', sc: 'ue' },
    { v: 'costar', nl: 'kosten', sc: 'ue' },
    { v: 'almorzar', nl: 'lunchen', sc: 'ue' },
    { v: 'morir', nl: 'sterven', sc: 'ue', part: 'muerto' },
    { v: 'jugar', nl: 'spelen', sc: 'uue' },
    { v: 'pedir', nl: 'vragen om / bestellen', sc: 'i' },
    { v: 'servir', nl: 'serveren / dienen', sc: 'i' },
    { v: 'repetir', nl: 'herhalen', sc: 'i' },
    { v: 'seguir', nl: 'volgen / doorgaan', sc: 'i', yo: 'sigo' },
    { v: 'conocer', nl: 'kennen', yo: 'conozco' },
    { v: 'conducir', nl: 'rijden (auto)', yo: 'conduzco', pret: 'conduj' },
    { v: 'traducir', nl: 'vertalen', yo: 'traduzco', pret: 'traduj' },
    { v: 'traer', nl: 'brengen', yo: 'traigo', pret: 'traj' },
    { v: 'caer', nl: 'vallen', yo: 'caigo', ov: {
      indefinido: ['caí', 'caíste', 'cayó', 'caímos', 'caísteis', 'cayeron'] } },
    { v: 'leer', nl: 'lezen', ov: {
      indefinido: ['leí', 'leíste', 'leyó', 'leímos', 'leísteis', 'leyeron'] } },
    { v: 'creer', nl: 'geloven', ov: {
      indefinido: ['creí', 'creíste', 'creyó', 'creímos', 'creísteis', 'creyeron'] } },
    { v: 'oír', nl: 'horen', fut: 'oir', ov: {
      presente: ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen'],
      indefinido: ['oí', 'oíste', 'oyó', 'oímos', 'oísteis', 'oyeron'] } },
    { v: 'escribir', nl: 'schrijven', part: 'escrito' },
    { v: 'abrir', nl: 'openen', part: 'abierto' },
    { v: 'beber', nl: 'drinken' },
    { v: 'aprender', nl: 'leren' },
    { v: 'comprender', nl: 'begrijpen (snappen)' },
    { v: 'correr', nl: 'rennen' },
    { v: 'vender', nl: 'verkopen' },
    { v: 'subir', nl: 'omhoog gaan / uploaden' },
    { v: 'recibir', nl: 'ontvangen' },
    { v: 'decidir', nl: 'beslissen' },
    { v: 'comprar', nl: 'kopen' },
    { v: 'llamar', nl: 'bellen / roepen' },
    { v: 'llevar', nl: 'dragen / meenemen' },
    { v: 'tomar', nl: 'nemen / drinken' },
    { v: 'necesitar', nl: 'nodig hebben' },
    { v: 'esperar', nl: 'wachten / hopen' },
    { v: 'viajar', nl: 'reizen' },
    { v: 'escuchar', nl: 'luisteren' },
    { v: 'mirar', nl: 'kijken' },
    { v: 'cocinar', nl: 'koken' },
    { v: 'caminar', nl: 'lopen / wandelen' },
    { v: 'ayudar', nl: 'helpen' },
    { v: 'terminar', nl: 'afmaken / eindigen' },
    { v: 'cambiar', nl: 'veranderen' },
    { v: 'olvidar', nl: 'vergeten (iets)' },
    { v: 'usar', nl: 'gebruiken' },
    { v: 'ganar', nl: 'winnen / verdienen' },
    { v: 'practicar', nl: 'oefenen' },
    { v: 'bailar', nl: 'dansen' },
    { v: 'cantar', nl: 'zingen' },
    { v: 'visitar', nl: 'bezoeken' },
  ];

  // Wederkerende werkwoorden (me levanto). base = neem de uitzonderingen over van dat werkwoord.
  const REFLEXIVE = [
    { v: 'levantarse', nl: 'opstaan' },
    { v: 'llamarse', nl: 'heten' },
    { v: 'ducharse', nl: 'douchen' },
    { v: 'lavarse', nl: 'zich wassen' },
    { v: 'acostarse', nl: 'naar bed gaan', sc: 'ue' },
    { v: 'despertarse', nl: 'wakker worden', sc: 'ie' },
    { v: 'irse', nl: 'weggaan / vertrekken', base: 'ir' },
    { v: 'sentirse', nl: 'zich voelen', base: 'sentir' },
    { v: 'quedarse', nl: 'blijven' },
    { v: 'sentarse', nl: 'gaan zitten', sc: 'ie' },
    { v: 'vestirse', nl: 'zich aankleden', sc: 'i' },
    { v: 'ponerse', nl: 'aantrekken / worden', base: 'poner' },
    { v: 'dormirse', nl: 'in slaap vallen', base: 'dormir' },
    { v: 'preocuparse', nl: 'zich zorgen maken' },
    { v: 'divertirse', nl: 'plezier hebben', sc: 'ie' },
    { v: 'casarse', nl: 'trouwen' },
    { v: 'acordarse', nl: 'zich herinneren (aan, wederkerend)', sc: 'ue' },
    { v: 'olvidarse', nl: 'vergeten (wederkerend)' },
    { v: 'equivocarse', nl: 'zich vergissen' },
    { v: 'relajarse', nl: 'ontspannen' },
    { v: 'enamorarse', nl: 'verliefd worden' },
    { v: 'mudarse', nl: 'verhuizen' },
    { v: 'quejarse', nl: 'klagen' },
    { v: 'bañarse', nl: 'in bad gaan / zwemmen' },
    { v: 'afeitarse', nl: 'zich scheren' },
    { v: 'peinarse', nl: 'zich kammen' },
    { v: 'cepillarse', nl: 'zich borstelen / tanden poetsen' },
  ];
  for (const r of REFLEXIVE) {
    const base = r.base ? VERBS.find(x => x.v === r.base) : {};
    VERBS.push(Object.assign({}, base, r, { refl: true }));
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = VERBS;
  else root.VERBS = VERBS;
})(this);
