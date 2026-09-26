/* CDEV SITE ENGINE
 * Uma unica base de codigo renderiza todos os sites: Template + Theme + Content.
 * Usado por site.html (sites publicados/demos) e pelo editor do Control Center (preview ao vivo).
 * Componentes: Header, Hero, About, Services, Gallery, Testimonials, FAQ, CTA, Contact, WhatsApp, Location, Footer.
 * Para um novo componente: adicione em COMPONENTS e (opcional) em SECTION_SCHEMAS do editor.
 */
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(s)) return s;
    return '';
  };
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const wa = (num, text) => { let d = digits(num); if (!d) return ''; if (d.length <= 11) d = '55' + d; return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`; };

  const PRESETS = {
    'dark-gold': { mode: 'dark', colors: { primary: '#c9a14a', accent: '#e8c776', bg: '#0d0d0f', surface: '#17171b', text: '#f3efe6', muted: '#9a9387' }, fonts: { heading: 'Oswald', body: 'Inter' }, radius: '4px' },
    'warm-terracotta': { mode: 'light', colors: { primary: '#b5452b', accent: '#e0892f', bg: '#fbf6ef', surface: '#ffffff', text: '#2a1f1a', muted: '#7a6a60' }, fonts: { heading: 'Playfair Display', body: 'Inter' }, radius: '12px' },
    'clean-teal': { mode: 'light', colors: { primary: '#0f8b8d', accent: '#43b3ae', bg: '#f5fafa', surface: '#ffffff', text: '#123033', muted: '#5b7477' }, fonts: { heading: 'Poppins', body: 'Inter' }, radius: '12px' },
    'navy-classic': { mode: 'dark', colors: { primary: '#b8975a', accent: '#d8bd86', bg: '#0e1624', surface: '#162235', text: '#eef1f6', muted: '#98a3b5' }, fonts: { heading: 'Cormorant Garamond', body: 'Inter' }, radius: '2px' },
    'urban-blue': { mode: 'light', colors: { primary: '#1f5fbf', accent: '#f2a900', bg: '#f6f8fb', surface: '#ffffff', text: '#15213a', muted: '#5d6b84' }, fonts: { heading: 'Montserrat', body: 'Inter' }, radius: '12px' },
    'garage-red': { mode: 'dark', colors: { primary: '#e03a2f', accent: '#ffb627', bg: '#101214', surface: '#1a1d21', text: '#f1f1f1', muted: '#9aa0a6' }, fonts: { heading: 'Barlow Condensed', body: 'Inter' }, radius: '6px' },
    'rose-nude': { mode: 'light', colors: { primary: '#c2587a', accent: '#e8a0b4', bg: '#fdf7f8', surface: '#ffffff', text: '#3a2430', muted: '#8a6f7a' }, fonts: { heading: 'Playfair Display', body: 'Inter' }, radius: '18px' },
    'neon-lime': { mode: 'dark', colors: { primary: '#b4f000', accent: '#00d1ff', bg: '#0a0b0d', surface: '#15171b', text: '#f5f7fa', muted: '#8e949c' }, fonts: { heading: 'Bebas Neue', body: 'Inter' }, radius: '8px' },
    'mono-minimal': { mode: 'light', colors: { primary: '#111111', accent: '#8c8c8c', bg: '#fafafa', surface: '#ffffff', text: '#111111', muted: '#6b6b6b' }, fonts: { heading: 'DM Serif Display', body: 'Inter' }, radius: '0px' },
    'cdev-aqua': { mode: 'dark', colors: { primary: '#2b8ba5', accent: '#e07b24', bg: '#080e10', surface: '#111d21', text: '#e8f2f5', muted: '#6f8d98' }, fonts: { heading: 'Syne', body: 'Inter' }, radius: '8px' }
  };
  const FONTS = ['Inter', 'Poppins', 'Montserrat', 'Oswald', 'Bebas Neue', 'Barlow Condensed', 'Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Syne', 'Lora', 'Raleway', 'Nunito', 'Roboto'];
  const SECTION_IDS = { hero: 'inicio', about: 'sobre', services: 'servicos', gallery: 'galeria', testimonials: 'depoimentos', faq: 'faq', cta: 'agendar', contact: 'contato', location: 'localizacao' };
  const NAV_LABELS = { about: 'Sobre', services: 'Serviços', gallery: 'Galeria', testimonials: 'Depoimentos', faq: 'Dúvidas', contact: 'Contato', location: 'Localização' };

  const resolveTheme = (theme = {}) => {
    const base = PRESETS[theme.preset] || PRESETS['cdev-aqua'];
    return { ...base, ...theme, colors: { ...base.colors, ...(theme.colors || {}) }, fonts: { ...base.fonts, ...(theme.fonts || {}) } };
  };

  const img = (src, alt, cls = '') => {
    const u = safeUrl(src);
    return u ? `<img class="${cls}" src="${esc(u)}" alt="${esc(alt || '')}" loading="lazy">` : `<div class="ph ${cls}" role="img" aria-label="${esc(alt || 'imagem')}"></div>`;
  };
  const button = (text, url, ctx, cls = 'btn') => {
    if (!text) return '';
    const href = url === 'whatsapp' ? wa(ctx.contact.whatsapp, `Olá! Vim pelo site da ${ctx.brand.name || ''}.`) : safeUrl(url || '#contato');
    return href ? `<a class="${cls}" href="${esc(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ''}>${esc(text)}</a>` : '';
  };
  const ICON = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    ig: '<rect width="20" height="20" x="2" y="2" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    wa: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  // ---------------------------------------------------------------- Componentes
  const COMPONENTS = {
    header(ctx, sections) {
      const links = sections.filter((s) => NAV_LABELS[s.type]).map((s) => `<a href="#${SECTION_IDS[s.type]}">${NAV_LABELS[s.type]}</a>`).join('');
      const logo = safeUrl(ctx.brand.logo);
      return `<header class="s-header"><div class="wrap"><a class="brand" href="#inicio">${logo ? `<img src="${esc(logo)}" alt="${esc(ctx.brand.name)}">` : esc(ctx.brand.name)}</a>
        <nav class="s-nav" id="s-nav">${links}</nav>
        <div class="s-header-cta">${button('Fale conosco', 'whatsapp', ctx, 'btn btn-sm')}<button class="s-burger" aria-label="Menu" onclick="document.getElementById('s-nav').classList.toggle('open')">${icon('menu')}</button></div></div></header>`;
    },
    hero(d, ctx) {
      return `<section class="s-hero" id="inicio"><div class="wrap hero-grid">
        <div>${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h1>${esc(d.title || ctx.brand.name)}</h1>${d.subtitle ? `<p class="lead">${esc(d.subtitle)}</p>` : ''}
        <div class="actions">${button(d.buttonText, d.buttonUrl, ctx)}${button(d.secondaryText, d.secondaryUrl, ctx, 'btn btn-ghost')}</div></div>
        <div class="hero-media">${img(d.image, d.title, 'r')}</div></div></section>`;
    },
    about(d) {
      return `<section class="s-about" id="sobre"><div class="wrap two">${img(d.image, d.title, 'r')}
        <div><h2>${esc(d.title || 'Sobre')}</h2><p class="pre">${esc(d.text || '')}</p>
        ${(d.highlights || []).length ? `<ul class="checks">${d.highlights.map((h) => `<li>${icon('check')}${esc(h)}</li>`).join('')}</ul>` : ''}</div></div></section>`;
    },
    services(d) {
      return `<section class="s-services" id="servicos"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Serviços')}</h2>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>
        <div class="cards">${(d.items || []).map((it) => `<article class="card"><h3>${esc(it.name)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ''}${it.price ? `<strong class="price">${esc(it.price)}</strong>` : ''}</article>`).join('')}</div></div></section>`;
    },
    gallery(d) {
      const imgs = (d.images || []).length ? d.images : [{}, {}, {}, {}, {}, {}];
      return `<section class="s-gallery" id="galeria"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Galeria')}</h2></div>
        <div class="gal">${imgs.map((g) => `<figure>${img(g.src, g.alt)}${g.alt ? `<figcaption>${esc(g.alt)}</figcaption>` : ''}</figure>`).join('')}</div></div></section>`;
    },
    testimonials(d) {
      return `<section class="s-testimonials" id="depoimentos"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Depoimentos')}</h2></div>
        <div class="cards">${(d.items || []).map((t) => `<blockquote class="card"><div class="stars">${icon('star').repeat(5)}</div><p>“${esc(t.text)}”</p><cite>${esc(t.name)}${t.role ? ` · ${esc(t.role)}` : ''}</cite></blockquote>`).join('')}</div></div></section>`;
    },
    faq(d) {
      return `<section class="s-faq" id="faq"><div class="wrap narrow"><div class="head"><h2>${esc(d.title || 'Perguntas frequentes')}</h2></div>
        ${(d.items || []).map((f) => `<details class="card"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></section>`;
    },
    cta(d, ctx) {
      return `<section class="s-cta" id="agendar"><div class="wrap"><div class="cta-box"><div><h2>${esc(d.title || '')}</h2>${d.text ? `<p>${esc(d.text)}</p>` : ''}</div>${button(d.buttonText, d.buttonUrl || 'whatsapp', ctx, 'btn btn-invert')}</div></div></section>`;
    },
    contact(d, ctx) {
      const c = ctx.contact;
      const items = [
        c.whatsapp && `<a href="${esc(wa(c.whatsapp))}" target="_blank" rel="noopener">${icon('wa')}<span>WhatsApp<br><b>${esc(c.phone || c.whatsapp)}</b></span></a>`,
        c.phone && !c.whatsapp && `<a href="tel:${esc(digits(c.phone))}">${icon('phone')}<span>Telefone<br><b>${esc(c.phone)}</b></span></a>`,
        c.email && `<a href="mailto:${esc(c.email)}">${icon('mail')}<span>E-mail<br><b>${esc(c.email)}</b></span></a>`,
        c.instagram && `<a href="https://instagram.com/${esc(String(c.instagram).replace(/^@|https?:\/\/(www\.)?instagram\.com\//g, ''))}" target="_blank" rel="noopener">${icon('ig')}<span>Instagram<br><b>${esc(c.instagram)}</b></span></a>`,
        (c.address || c.city) && `<div>${icon('pin')}<span>Endereço<br><b>${esc([c.address, c.city].filter(Boolean).join(' - '))}</b></span></div>`
      ].filter(Boolean);
      const hours = (c.hours || []).filter((h) => h.label || h.value);
      return `<section class="s-contact" id="contato"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Contato')}</h2>${d.text ? `<p>${esc(d.text)}</p>` : ''}</div>
        <div class="contact-grid"><div class="card contact-list">${items.join('')}</div>
        ${hours.length ? `<div class="card hours"><h3>${icon('clock')} Horários</h3>${hours.map((h) => `<div class="hr"><span>${esc(h.label)}</span><b>${esc(h.value)}</b></div>`).join('')}</div>` : ''}</div></div></section>`;
    },
    location(d, ctx) {
      const q = ctx.contact.mapsQuery || [ctx.contact.address, ctx.contact.city].filter(Boolean).join(', ');
      if (!q) return '';
      return `<section class="s-location" id="localizacao"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Onde estamos')}</h2>${d.text ? `<p>${esc(d.text)}</p>` : ''}</div>
        <iframe class="map r" title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed"></iframe></div></section>`;
    },
    whatsapp(ctx) {
      if (!ctx.contact.whatsapp || ctx.settings.whatsappFloat === false) return '';
      return `<a class="s-wa" href="${esc(wa(ctx.contact.whatsapp, `Olá! Vim pelo site da ${ctx.brand.name || ''}.`))}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('wa')}</a>`;
    },
    footer(ctx) {
      return `<footer class="s-footer"><div class="wrap"><strong>${esc(ctx.brand.name)}</strong>${ctx.brand.tagline ? `<span>${esc(ctx.brand.tagline)}</span>` : ''}
        <small>© ${new Date().getFullYear()} ${esc(ctx.brand.name)} · Site por <a href="https://cdev.com.br" target="_blank" rel="noopener">CDEV</a></small></div></footer>`;
    }
  };

  const css = (t) => {
    const c = t.colors; const dark = t.mode === 'dark';
    return `
    :root{--p:${c.primary};--a:${c.accent};--bg:${c.bg};--sf:${c.surface};--tx:${c.text};--mu:${c.muted};--r:${t.radius || '10px'};
      --line:${dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.08)'};--fh:'${t.fonts.heading}',system-ui,sans-serif;--fb:'${t.fonts.body}',system-ui,sans-serif}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--fb);line-height:1.6;-webkit-font-smoothing:antialiased}
    img{max-width:100%;display:block}a{color:inherit}
    .wrap{width:min(1120px,100% - 2.5rem);margin:0 auto}.narrow{width:min(760px,100% - 2.5rem)}
    h1,h2,h3{font-family:var(--fh);line-height:1.1;margin:0 0 .6em}h1{font-size:clamp(2.2rem,5.5vw,4rem)}h2{font-size:clamp(1.7rem,3.5vw,2.6rem)}h3{font-size:1.15rem}
    section{padding:clamp(3.5rem,8vw,6rem) 0}.head{text-align:center;max-width:640px;margin:0 auto 2.5rem}.head p{color:var(--mu)}
    .pre{white-space:pre-line}.r{border-radius:var(--r)}
    .btn{display:inline-flex;align-items:center;justify-content:center;padding:.9rem 1.5rem;border-radius:var(--r);background:var(--p);color:${dark ? '#0b0b0b' : '#fff'};font-weight:700;text-decoration:none;white-space:nowrap;border:2px solid var(--p);transition:transform .15s,filter .15s}
    .btn:hover{transform:translateY(-2px);filter:brightness(1.08)}.btn-ghost{background:transparent;color:var(--tx);border-color:var(--line)}.btn-sm{padding:.55rem 1rem;font-size:.9rem}
    .btn-invert{background:var(--bg);color:var(--tx);border-color:var(--bg)}
    .ph{width:100%;aspect-ratio:4/3;border-radius:var(--r);background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--a) 55%,transparent),transparent 55%),linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 35%,var(--bg)));opacity:.85}
    .s-header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
    .s-header .wrap{display:flex;align-items:center;gap:1.5rem;height:68px}.brand{font-family:var(--fh);font-weight:800;font-size:1.3rem;text-decoration:none;letter-spacing:.02em}.brand img{height:40px}
    .s-nav{display:flex;gap:1.3rem;margin-left:auto}.s-nav a{text-decoration:none;color:var(--mu);font-size:.95rem}.s-nav a:hover{color:var(--p)}
    .s-header-cta{display:flex;align-items:center;gap:.6rem}.s-burger{display:none;background:none;border:0;color:var(--tx);width:40px;height:40px;cursor:pointer}.s-burger svg{width:24px;height:24px}
    @media(max-width:820px){.s-nav{display:none;position:absolute;top:68px;left:0;right:0;flex-direction:column;padding:1rem 1.25rem;background:var(--bg);border-bottom:1px solid var(--line)}.s-nav.open{display:flex}.s-burger{display:grid;place-items:center}.s-header-cta{margin-left:auto}}
    .hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:3rem;align-items:center}.eyebrow{display:inline-block;margin-bottom:1rem;color:var(--p);font-weight:700;letter-spacing:.18em;text-transform:uppercase;font-size:.8rem}
    .lead{font-size:1.15rem;color:var(--mu);max-width:36rem}.actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}
    .hero-media img,.hero-media .ph{aspect-ratio:4/5;object-fit:cover;width:100%}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center}.two img{aspect-ratio:4/3;object-fit:cover}
    @media(max-width:820px){.hero-grid,.two{grid-template-columns:1fr}.hero-media{order:-1}.hero-media img,.hero-media .ph{aspect-ratio:16/10}}
    .checks{list-style:none;padding:0;margin:1.5rem 0 0;display:grid;gap:.6rem}.checks li{display:flex;gap:.6rem;align-items:center}.checks svg{width:20px;height:20px;color:var(--p);flex-shrink:0}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.2rem}
    .card{background:var(--sf);border:1px solid var(--line);border-radius:var(--r);padding:1.5rem}.card p{color:var(--mu);margin:.2rem 0 0}
    .price{display:block;margin-top:1rem;color:var(--p);font-family:var(--fh);font-size:1.3rem}
    .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.8rem}.gal figure{margin:0}.gal img,.gal .ph{aspect-ratio:1;object-fit:cover;border-radius:var(--r)}.gal figcaption{font-size:.85rem;color:var(--mu);margin-top:.4rem}
    .stars{display:flex;gap:2px;color:var(--a);margin-bottom:.6rem}.stars svg{width:16px;height:16px;fill:currentColor}blockquote{margin:0}cite{display:block;margin-top:1rem;font-style:normal;font-weight:700}
    details{margin-bottom:.8rem;cursor:pointer}summary{font-weight:700;font-family:var(--fh);font-size:1.05rem}details p{margin-top:.8rem}
    .cta-box{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5rem;padding:clamp(2rem,5vw,3.5rem);border-radius:var(--r);background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 60%,var(--a)));color:${dark ? '#0b0b0b' : '#fff'}}
    .cta-box h2{margin:0}.cta-box p{margin:.4rem 0 0;opacity:.85}
    .contact-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:1.2rem}@media(max-width:820px){.contact-grid{grid-template-columns:1fr}}
    .contact-list{display:grid;gap:1.1rem}.contact-list>*{display:flex;gap:.9rem;align-items:center;text-decoration:none;color:var(--mu)}.contact-list b{color:var(--tx);font-weight:600}
    .contact-list svg,.hours h3 svg{width:22px;height:22px;color:var(--p);flex-shrink:0}.hours h3{display:flex;gap:.5rem;align-items:center}.hr{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0;border-bottom:1px solid var(--line)}.hr span{color:var(--mu)}
    .map{width:100%;height:380px;border:0}
    .s-wa{position:fixed;right:1.2rem;bottom:1.2rem;z-index:30;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.3)}.s-wa svg{width:30px;height:30px}
    .s-footer{padding:2.5rem 0;border-top:1px solid var(--line);text-align:center}.s-footer .wrap{display:grid;gap:.3rem}.s-footer span,.s-footer small{color:var(--mu)}
    .s-preview-bar{position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:40;background:#111;color:#fff;font:600 12px/1 system-ui;padding:.6rem 1rem;border-radius:999px;opacity:.85}`;
  };

  const fontLink = (t) => {
    const fams = [...new Set([t.fonts.heading, t.fonts.body])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700;800`).join('&');
    return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
  };

  // Renderiza site completo no documento atual
  const render = (site, { preview = false, target = document } = {}) => {
    const theme = resolveTheme(site.theme);
    const content = site.content || {};
    const ctx = {
      brand: { name: site.name || '', ...(content.brand || {}) },
      contact: { hours: [], ...(content.contact || {}) },
      settings: content.settings || {}
    };
    const sections = (content.sections || []).filter((s) => s.enabled !== false && COMPONENTS[s.type]);
    const doc = target;
    doc.title = content.seo?.title || ctx.brand.name || 'Site';
    let meta = doc.querySelector('meta[name="description"]');
    if (!meta) { meta = doc.createElement('meta'); meta.name = 'description'; doc.head.appendChild(meta); }
    meta.content = content.seo?.description || ctx.brand.tagline || '';
    if (site.status === 'DEMO' || preview) {
      let robots = doc.querySelector('meta[name="robots"]');
      if (!robots) { robots = doc.createElement('meta'); robots.name = 'robots'; doc.head.appendChild(robots); }
      robots.content = 'noindex,nofollow';
    }
    let font = doc.getElementById('site-font');
    if (!font) { font = doc.createElement('link'); font.id = 'site-font'; font.rel = 'stylesheet'; doc.head.appendChild(font); }
    const href = fontLink(theme); if (font.href !== href) font.href = href;
    let style = doc.getElementById('site-style');
    if (!style) { style = doc.createElement('style'); style.id = 'site-style'; doc.head.appendChild(style); }
    style.textContent = css(theme);
    doc.body.innerHTML = COMPONENTS.header(ctx, sections)
      + `<main>${sections.map((s) => COMPONENTS[s.type](s.data || {}, ctx)).join('')}</main>`
      + COMPONENTS.footer(ctx) + COMPONENTS.whatsapp(ctx)
      + (preview ? `<div class="s-preview-bar">Pré-visualização${site.status ? ' · ' + esc(site.status) : ''}</div>` : '');
  };

  window.CDEVSiteEngine = { render, resolveTheme, PRESETS, FONTS, SECTION_IDS, COMPONENTS, version: '1.0.0' };
})();
