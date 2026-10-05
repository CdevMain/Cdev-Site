/* CDEV - consentimento de dados de uso (LGPD)
 * O Google Analytics so e carregado DEPOIS que o visitante aceita.
 * Textos em assets/js/i18n.js (chaves consent-*); o site.js traduz pelo atributo data-i.
 * Carregar ANTES do site.js. Escolha guardada por 12 meses em localStorage ("cdev-consent").
 */
(function () {
  var GA_ID = 'G-MNTYE8V4WH';
  var KEY = 'cdev-consent';
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  var gaLoaded = false;

  var store = (function () { try { return window.localStorage; } catch (e) { return null; } })();
  var memoryChoice = null; // sem storage: vale so para esta visita

  function readChoice() {
    if (!store) return memoryChoice;
    try {
      var raw = JSON.parse(store.getItem(KEY) || 'null');
      if (!raw || (raw.v !== 'granted' && raw.v !== 'denied')) return null;
      if (!raw.at || Date.now() - raw.at > MAX_AGE) return null;
      return raw.v;
    } catch (e) { return null; }
  }
  function saveChoice(v) {
    memoryChoice = v;
    if (store) { try { store.setItem(KEY, JSON.stringify({ v: v, at: Date.now() })); } catch (e) { /* ignora */ } }
  }

  function loadGA() {
    window['ga-disable-' + GA_ID] = false;
    if (gaLoaded) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }

  function stopGA() {
    window['ga-disable-' + GA_ID] = true;
    // remove os cookies do Analytics que ja tenham sido gravados
    var host = location.hostname.replace(/^www\./, '');
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^_ga($|_)|^_gid$|^_gat/.test(name)) {
        ['', '; domain=' + host, '; domain=.' + host].forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + d;
        });
      }
    });
  }

  var css = '' +
    '.cdev-consent{position:fixed;z-index:9000;left:16px;right:16px;bottom:16px;max-width:520px;' +
    'background:#0c1518;color:#e8f2f5;border:1px solid rgba(43,139,165,.45);border-radius:12px;' +
    'box-shadow:0 18px 50px rgba(0,0,0,.55);padding:20px 20px 18px;font-size:14px;line-height:1.6;' +
    'opacity:0;transform:translateY(12px);transition:opacity .35s cubic-bezier(.16,1,.3,1),transform .35s cubic-bezier(.16,1,.3,1)}' +
    '.cdev-consent.is-open{opacity:1;transform:none}' +
    '.cdev-consent[hidden]{display:none}' +
    '.cdev-consent h2{margin:0 0 6px;font-size:15px;font-weight:700;letter-spacing:0;color:#e8f2f5}' +
    '.cdev-consent p{margin:0;color:#a9c0c8}' +
    '.cdev-consent p strong{color:#e8f2f5;font-weight:600}' +
    '.cdev-consent-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}' +
    '.cdev-consent button{font:inherit;font-size:13px;font-weight:600;letter-spacing:.02em;height:40px;padding:0 18px;' +
    'border-radius:8px;border:1px solid rgba(43,139,165,.55);background:transparent;color:#e8f2f5;transition:background-color .2s,border-color .2s,color .2s}' +
    '.cdev-consent button:hover{border-color:#2b8ba5;background:rgba(43,139,165,.12)}' +
    '.cdev-consent button[data-consent="granted"]{background:#2b8ba5;border-color:#2b8ba5;color:#fff}' +
    '.cdev-consent button[data-consent="granted"]:hover{background:#1e6275;border-color:#1e6275}' +
    '.cdev-consent button:focus-visible,.cdev-consent-link:focus-visible{outline:2px solid #2b8ba5;outline-offset:3px}' +
    '.cdev-consent-link{font:inherit;background:none;border:0;padding:0;color:inherit;text-transform:inherit;letter-spacing:inherit;text-decoration:underline;text-underline-offset:3px}' +
    '.cdev-consent-link:hover{color:#e8f2f5}' +
    '@media (min-width:640px){.cdev-consent{left:24px;right:auto;bottom:24px}}' +
    '@media (prefers-reduced-motion:reduce){.cdev-consent{transition:none}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('section');
  box.className = 'cdev-consent';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-labelledby', 'cdev-consent-title');
  box.hidden = true;
  box.innerHTML =
    '<h2 id="cdev-consent-title" data-i="consent-title">Privacidade e dados de uso</h2>' +
    '<p data-i="consent-text">Uso o Google Analytics para entender como o site é visitado: páginas vistas, origem do acesso e tipo de dispositivo. Nada é coletado antes da sua escolha, e você pode mudar de ideia depois em <strong>Privacidade</strong>, no rodapé.</p>' +
    '<div class="cdev-consent-actions">' +
    '<button type="button" data-consent="granted" data-i="consent-accept">Aceitar</button>' +
    '<button type="button" data-consent="denied" data-i="consent-reject">Recusar</button>' +
    '</div>';
  document.body.appendChild(box);

  function open() {
    box.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add('is-open'); }); });
  }
  function close() {
    box.classList.remove('is-open');
    setTimeout(function () { box.hidden = true; }, 350);
  }

  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-consent]');
    if (!b) return;
    var v = b.getAttribute('data-consent');
    saveChoice(v);
    if (v === 'granted') loadGA(); else stopGA();
    close();
  });

  // link "Privacidade" no rodape para rever a escolha
  var footer = document.querySelector('footer');
  var holder = footer && (footer.querySelector('div') || footer);
  var link = document.createElement('button');
  link.type = 'button';
  link.className = 'cdev-consent-link';
  link.setAttribute('data-i', 'consent-manage');
  link.textContent = 'Privacidade';
  link.addEventListener('click', function () { open(); var f = box.querySelector('[data-consent="granted"]'); if (f) f.focus(); });
  if (holder) holder.appendChild(link);
  else { link.style.cssText = 'position:fixed;right:16px;bottom:12px;z-index:8999;font-size:12px;color:#6f8d98'; document.body.appendChild(link); }

  window.cdevConsent = { open: open, get: readChoice };

  var choice = readChoice();
  if (choice === 'granted') loadGA();
  else if (choice !== 'denied') open();
})();
