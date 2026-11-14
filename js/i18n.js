// Taal van de app: nl of en. Kies via Instellingen, of open de app met ?lang=en / ?lang=nl.
// Zonder keuze: Nederlands als de browser Nederlands is, anders Engels.
(function () {
  const K = 'spaanstool-lang';
  let l = null;
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'nl' || q === 'en') localStorage.setItem(K, q);
    l = localStorage.getItem(K);
  } catch (e) {}
  if (l !== 'nl' && l !== 'en') l = /^nl/i.test(navigator.language || '') ? 'nl' : 'en';
  window.LANG = l;
  window.setLang = v => { try { localStorage.setItem(K, v); } catch (e) {} };
  document.documentElement.lang = l;
})();
