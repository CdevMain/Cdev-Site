(function () {
  const STORAGE_KEY = 'cdev-lang';
  const LEGACY_KEY = 'lang';
  const I18N = window.CDEV_I18N || {};
  let currentLang = 'pt';
  let errorRedirectStarted = false;
  let translatables = null;
  let shockActive = false;

  const safeStorage = () => {
    try { return window.localStorage; } catch (err) { return null; }
  };

  const getStoredLang = () => {
    const store = safeStorage();
    if (!store) return null;
    const read = (key) => {
      const value = store.getItem(key);
      return value === 'pt' || value === 'en' ? value : null;
    };
    return read(STORAGE_KEY) || read(LEGACY_KEY);
  };

  const getBrowserLang = () => {
    const lang = (navigator.language || 'pt').toLowerCase();
    return lang.startsWith('pt') ? 'pt' : 'en';
  };

  const applyLang = (lang) => {
    const dict = I18N[lang] || I18N.en || {};
    const nodes = translatables || document.querySelectorAll('[data-i]');
    nodes.forEach(el => {
      const key = el.getAttribute('data-i');
      if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    const toggleText = document.getElementById('ltxt');
    if (toggleText) toggleText.textContent = lang === 'pt' ? 'EN' : 'PT';
    updateErrorContent(lang);
  };

  const setLang = (lang, { persist = true } = {}) => {
    const next = lang === 'pt' ? 'pt' : 'en';
    if (next === currentLang) {
      if (persist) {
        const store = safeStorage();
        if (store) {
          store.setItem(STORAGE_KEY, next);
          store.setItem(LEGACY_KEY, next);
        }
      }
      return;
    }
    currentLang = next;
    applyLang(next);
    if (persist) {
      const store = safeStorage();
      if (store) {
        store.setItem(STORAGE_KEY, next);
        store.setItem(LEGACY_KEY, next);
      }
    }
  };

  const animateShock = (originEl, nextLang) => {
    if (shockActive) return;
    const shock = document.getElementById('shock');
    const ring = document.getElementById('shock-ring');
    const fill = document.getElementById('shock-fill');
    if (!shock || !ring || !fill || !originEl) {
      setLang(nextLang);
      return;
    }
    shockActive = true;

    const rect = originEl.getBoundingClientRect();
    const ox = rect.left + rect.width / 2;
    const oy = rect.top + rect.height / 2;
    const maxR = Math.sqrt(
      Math.max(ox, window.innerWidth - ox) ** 2 +
      Math.max(oy, window.innerHeight - oy) ** 2
    ) * 2.2;

    fill.style.background = `radial-gradient(circle at ${ox}px ${oy}px, rgba(30,98,117,.22) 0%, transparent 70%)`;
    const dur = 850;
    ring.style.transition = 'none';
    ring.style.left = ox + 'px';
    ring.style.top = oy + 'px';
    ring.style.width = '0px';
    ring.style.height = '0px';
    ring.style.opacity = '1';
    fill.style.opacity = '1';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ring.style.transition = `width ${dur}ms cubic-bezier(.2,.8,.4,1), height ${dur}ms cubic-bezier(.2,.8,.4,1), opacity ${dur}ms ease`;
        ring.style.width = maxR + 'px';
        ring.style.height = maxR + 'px';
        ring.style.opacity = '0';
      });
    });

    setTimeout(() => {
      requestAnimationFrame(() => setLang(nextLang));
      document.body.style.transition = 'filter .18s';
      document.body.style.filter = 'brightness(1.07)';
      setTimeout(() => { document.body.style.filter = ''; }, 220);
    }, dur * 0.42);

    setTimeout(() => { fill.style.opacity = '0'; }, dur * 0.55);
    setTimeout(() => {
      ring.style.transition = 'none';
      ring.style.width = ring.style.height = '0px';
      ring.style.opacity = '0';
      shockActive = false;
    }, dur + 60);
  };

  const toggleLang = (originEl) => {
    const nextLang = currentLang === 'pt' ? 'en' : 'pt';
    animateShock(originEl, nextLang);
  };

  const initLang = () => {
    const stored = getStoredLang();
    const initial = stored || getBrowserLang();
    setLang(initial, { persist: true });
  };

  const initLangToggle = () => {
    const btn = document.getElementById('ltoggle');
    if (!btn) return;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleLang(btn);
    });
  };

  // ==================== CURSOR CORRIGIDO ====================
  const getZoom = () => {
    // Prioriza a propriedade CSS 'zoom'
    let z = window.getComputedStyle(document.documentElement).zoom;
    if (z && z !== 'normal') {
      const value = parseFloat(z);
      if (Number.isFinite(value) && value > 0) return value;
    }
    // Fallback confiável para zoom do navegador
    return Math.round(window.devicePixelRatio * 100) / 100 || 1;
  };

  const updateCursorSize = () => {
    const z = getZoom();
    const cdot = document.getElementById('cdot');
    const cring = document.getElementById('cring');
    if (!cdot || !cring) return;

    // === AJUSTE AQUI OS TAMANHOS BASE (em pixels no zoom 100%) ===
    const baseDotSize = 14;   // tamanho desejado do ponto central
    const baseRingSize = 48;  // tamanho desejado do anel externo

    const scaledDot = baseDotSize / z;
    const scaledRing = baseRingSize / z;

    cdot.style.width = `${scaledDot}px`;
    cdot.style.height = `${scaledDot}px`;

    cring.style.width = `${scaledRing}px`;
    cring.style.height = `${scaledRing}px`;
  };

  const initCursor = () => {
    const cdot = document.getElementById('cdot');
    const cring = document.getElementById('cring');
    if (!cdot || !cring) return;

    let cx = 0, cy = 0, rx = 0, ry = 0;

    document.addEventListener('mousemove', e => {
      const z = getZoom();
      cx = e.clientX / z;
      cy = e.clientY / z;
      cdot.style.left = cx + 'px';
      cdot.style.top = cy + 'px';
    });

    (function lerp() {
      rx += (cx - rx) * 0.11;
      ry += (cy - ry) * 0.11;
      cring.style.left = rx + 'px';
      cring.style.top = ry + 'px';
      requestAnimationFrame(lerp);
    })();

    // Atualiza tamanho do cursor
    updateCursorSize();

    // Atualiza ao redimensionar janela ou alterar zoom
    window.addEventListener('resize', updateCursorSize);

    // Observa mudanças na propriedade zoom (para casos de zoom via CSS)
    const zoomObserver = new MutationObserver(updateCursorSize);
    zoomObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    document.addEventListener('mousedown', () => document.body.classList.add('down'));
    document.addEventListener('mouseup', () => document.body.classList.remove('down'));
    document.addEventListener('mouseleave', () => document.body.classList.remove('down'));
  };
  // ============================================================

  const initHover = () => {
    const selector = 'a, button, .card, .skill-card, .pc, .plink, [data-cursor="hover"]';
    document.addEventListener('mouseover', (event) => {
      if (event.target.closest(selector)) document.body.classList.add('hov');
    });
    document.addEventListener('mouseout', (event) => {
      const from = event.target.closest(selector);
      const to = event.relatedTarget && event.relatedTarget.closest(selector);
      if (from && !to) document.body.classList.remove('hov');
    });
  };

  const initReveal = () => {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('vis');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    items.forEach(el => io.observe(el));
  };

  const updateErrorContent = (lang) => {
    const page = document.querySelector('[data-error-code]');
    if (!page) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || page.getAttribute('data-error-code') || '404';
    const entry = (I18N.errors && (I18N.errors[code] || I18N.errors.default)) || {};
    const text = entry[lang] || entry.en || {};

    const codeEl = document.getElementById('error-code');
    const titleEl = document.getElementById('error-title');
    const subtitleEl = document.getElementById('error-subtitle');

    if (codeEl) codeEl.textContent = code;
    if (titleEl && text.title) titleEl.textContent = text.title;
    if (subtitleEl && text.subtitle) subtitleEl.textContent = text.subtitle;
    if (text.title) document.title = `${code} — ${text.title}`;
  };

  const initErrorRedirect = () => {
    const page = document.querySelector('[data-error-code]');
    if (!page || errorRedirectStarted) return;
    errorRedirectStarted = true;

    const countdownEl = document.getElementById('countdown');
    const target = page.getAttribute('data-redirect') || 'index.html';
    let remaining = parseInt(page.getAttribute('data-redirect-seconds') || '5', 10);
    if (Number.isNaN(remaining) || remaining < 1) remaining = 5;

    if (countdownEl) countdownEl.textContent = remaining;
    const interval = setInterval(() => {
      remaining -= 1;
      if (countdownEl) countdownEl.textContent = Math.max(remaining, 0);
      if (remaining <= 0) {
        clearInterval(interval);
        window.location.href = target;
      }
    }, 1000);
  };

  const initErrorPage = () => {
    if (document.querySelector('[data-error-code]')) {
      updateErrorContent(currentLang);
      initErrorRedirect();
    }
  };

  const init = () => {
    translatables = Array.from(document.querySelectorAll('[data-i]'));
    initLang();
    initLangToggle();
    initCursor();
    initHover();
    initReveal();
    initErrorPage();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Site = {
    setLang,
    toggleLang,
    updateErrorContent
  };
})();