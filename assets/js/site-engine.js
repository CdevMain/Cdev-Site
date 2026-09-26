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


  // ------------------------------------------------------------------ Imagens
  // Fotos do Unsplash recebem tamanho/qualidade/srcset automaticamente (carregam leves no celular).
  // Qualquer outra URL (foto do cliente, CDN propria) e usada como esta.
  // Se a imagem falhar, o bloco mostra o degrade da marca no lugar (nunca fica "quebrado").
  const isUnsplash = (u) => /^https:\/\/images\.unsplash\.com\//i.test(u);
  const sized = (u, w, h) => {
    if (!isUnsplash(u)) return u;
    const base = u.split('?')[0];
    return `${base}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=70`;
  };
  const pic = (src, alt, { cls = '', w = 1200, ratio = '', eager = false } = {}) => {
    const u = safeUrl(src);
    const style = ratio ? ` style="aspect-ratio:${ratio}"` : '';
    if (!u) return `<div class="media ph ${cls}"${style} role="img" aria-label="${esc(alt || 'imagem')}"></div>`;
    const set = isUnsplash(u) ? ` srcset="${[480, 800, 1200, 1800].filter((x) => x <= w * 1.6).map((x) => `${esc(sized(u, x))} ${x}w`).join(', ')}" sizes="(max-width: 820px) 100vw, ${Math.round(w / 12)}vw"` : '';
    return `<div class="media ${cls}"${style}><img src="${esc(sized(u, w))}"${set} alt="${esc(alt || '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.remove()"></div>`;
  };
  const bgImage = (src, w = 1800) => { const u = safeUrl(src); return u ? `background-image:url('${esc(sized(u, w)).replace(/'/g, '%27')}')` : ''; };

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
    fb: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    wa: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ICON.check}</svg>`;
  const stars = (n = 5) => `<span class="stars" aria-label="${n} de 5 estrelas">${icon('star').repeat(Math.max(0, Math.min(5, Math.round(n))))}</span>`;
  const statsRow = (stats, cls = '') => (stats || []).filter((s) => s && (s.value || s.label)).length
    ? `<dl class="stats ${cls}">${stats.filter((s) => s && (s.value || s.label)).map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>` : '';
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  // Variantes de layout por secao (escolhidas no template e editaveis no editor)
  const VARIANTS = {
    hero: [['split', 'Texto + foto'], ['overlay', 'Foto de fundo inteira'], ['center', 'Centralizado sobre foto']],
    services: [['cards', 'Cards com foto'], ['menu', 'Lista de preços (cardápio)'], ['features', 'Lista numerada']],
    gallery: [['grid', 'Grade'], ['mosaic', 'Mosaico (1 destaque)'], ['masonry', 'Colunas (alturas livres)']],
    about: [['image-left', 'Foto à esquerda'], ['image-right', 'Foto à direita']]
  };

  // ---------------------------------------------------------------- Componentes
  const COMPONENTS = {
    topbar(ctx) {
      const c = ctx.contact; const h = (c.hours || [])[0];
      const bits = [
        c.phone && `<a href="tel:${esc(digits(c.phone))}">${icon('phone')}${esc(c.phone)}</a>`,
        h && (h.label || h.value) && `<span>${icon('clock')}${esc([h.label, h.value].filter(Boolean).join(' · '))}</span>`,
        (c.address || c.city) && `<span class="tb-addr">${icon('pin')}${esc([c.address, c.city].filter(Boolean).join(' - '))}</span>`
      ].filter(Boolean);
      return bits.length ? `<div class="s-topbar"><div class="wrap">${bits.join('')}</div></div>` : '';
    },
    header(ctx, sections, over) {
      const links = sections.filter((s) => NAV_LABELS[s.type]).map((s) => `<a href="#${SECTION_IDS[s.type]}">${NAV_LABELS[s.type]}</a>`).join('');
      const logo = safeUrl(ctx.brand.logo);
      return `<header class="s-header${over ? ' over' : ''}" id="s-header"><div class="wrap"><a class="brand" href="#inicio">${logo ? `<img src="${esc(logo)}" alt="${esc(ctx.brand.name)}">` : esc(ctx.brand.name)}</a>
        <nav class="s-nav" id="s-nav">${links}</nav>
        <div class="s-header-cta">${button(ctx.settings.headerCta || 'Fale conosco', 'whatsapp', ctx, 'btn btn-sm')}<button class="s-burger" aria-label="Menu" aria-controls="s-nav" data-burger>${icon('menu')}</button></div></div></header>`;
    },
    hero(d, ctx) {
      const v = d.variant || 'split';
      const text = `${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h1>${esc(d.title || ctx.brand.name)}</h1>${d.subtitle ? `<p class="lead">${esc(d.subtitle)}</p>` : ''}
        <div class="actions">${button(d.buttonText, d.buttonUrl, ctx)}${button(d.secondaryText, d.secondaryUrl, ctx, 'btn btn-ghost')}</div>`;
      if (v === 'overlay' || v === 'center') {
        return `<section class="s-hero hero-${v}" id="inicio" style="${bgImage(d.image)}"><div class="hero-shade"></div>
          <div class="wrap hero-inner">${text}${statsRow(d.stats, 'on-dark')}</div></section>`;
      }
      const badge = d.badge && (d.badge.value || d.badge.label)
        ? `<div class="float-badge">${d.badge.stars ? stars(d.badge.stars) : ''}<strong>${esc(d.badge.value || '')}</strong><span>${esc(d.badge.label || '')}</span></div>` : '';
      return `<section class="s-hero hero-split" id="inicio"><div class="wrap hero-grid">
        <div>${text}${statsRow(d.stats)}</div>
        <div class="hero-media">${pic(d.image, d.title, { cls: 'r', w: 1100, ratio: '4/5', eager: true })}${badge}</div></div></section>`;
    },
    about(d) {
      const right = d.variant === 'image-right';
      const media = `<div class="about-media${d.image2 ? ' has-2' : ''}">${pic(d.image, d.title, { cls: 'r main', w: 1000, ratio: '4/5' })}${d.image2 ? pic(d.image2, '', { cls: 'r second', w: 600, ratio: '1' }) : ''}
        ${d.badge && d.badge.value ? `<div class="about-badge"><strong>${esc(d.badge.value)}</strong><span>${esc(d.badge.label || '')}</span></div>` : ''}</div>`;
      const body = `<div>${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h2>${esc(d.title || 'Sobre')}</h2><p class="pre muted-text">${esc(d.text || '')}</p>
        ${(d.highlights || []).length ? `<ul class="checks">${d.highlights.map((h) => `<li>${icon('check')}${esc(h)}</li>`).join('')}</ul>` : ''}${statsRow(d.stats, 'compact')}</div>`;
      return `<section class="s-about" id="sobre"><div class="wrap two${right ? ' flip' : ''}">${media}${body}</div></section>`;
    },
    services(d) {
      const v = d.variant || 'cards';
      const items = d.items || [];
      const head = `<div class="head">${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h2>${esc(d.title || 'Serviços')}</h2>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>`;
      let body;
      if (v === 'menu') {
        body = `<div class="menu-list">${items.map((it) => `<div class="menu-item">${it.image ? pic(it.image, it.name, { cls: 'thumb', w: 200, ratio: '1' }) : ''}<div class="mi-body"><div class="mi-line"><h3>${esc(it.name)}</h3><span class="dots"></span>${it.price ? `<strong class="price">${esc(it.price)}</strong>` : ''}</div>${it.description ? `<p>${esc(it.description)}</p>` : ''}</div></div>`).join('')}</div>`;
      } else if (v === 'features') {
        body = `<div class="features">${items.map((it, i) => `<article class="feature"><span class="num">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(it.name)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ''}${it.price ? `<strong class="price">${esc(it.price)}</strong>` : ''}</div></article>`).join('')}</div>`;
      } else {
        body = `<div class="cards svc">${items.map((it) => `<article class="card svc-card">${it.image ? pic(it.image, it.name, { w: 700, ratio: '3/2' }) : ''}<div class="svc-body"><h3>${esc(it.name)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ''}${it.price ? `<strong class="price">${esc(it.price)}</strong>` : ''}</div></article>`).join('')}</div>`;
      }
      return `<section class="s-services" id="servicos"><div class="wrap">${head}${body}</div></section>`;
    },
    gallery(d) {
      const v = d.variant || 'grid';
      const imgs = (d.images || []).length ? d.images : [{}, {}, {}, {}, {}, {}];
      return `<section class="s-gallery" id="galeria"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Galeria')}</h2>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>
        <div class="gal gal-${v}">${imgs.map((g, i) => `<figure>${pic(g.src, g.alt, { w: v === 'mosaic' && i === 0 ? 1200 : 700 })}${g.alt ? `<figcaption>${esc(g.alt)}</figcaption>` : ''}</figure>`).join('')}</div></div></section>`;
    },
    testimonials(d) {
      const items = d.items || [];
      const summary = d.rating ? `<div class="rating-sum">${stars(5)}<strong>${esc(d.rating)}</strong>${d.ratingLabel ? `<span>${esc(d.ratingLabel)}</span>` : ''}</div>` : '';
      return `<section class="s-testimonials" id="depoimentos"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Depoimentos')}</h2>${summary}</div>
        <div class="cards">${items.map((t) => `<blockquote class="card quote">${icon('quote')}<p>${esc(t.text)}</p><footer>${safeUrl(t.photo) ? `<img class="avatar" src="${esc(sized(safeUrl(t.photo), 96, 96))}" alt="" loading="lazy" onerror="this.remove()">` : `<span class="avatar ini">${esc(initials(t.name))}</span>`}<cite>${esc(t.name)}${t.role ? `<small>${esc(t.role)}</small>` : ''}</cite>${stars(5)}</footer></blockquote>`).join('')}</div></div></section>`;
    },
    faq(d) {
      return `<section class="s-faq" id="faq"><div class="wrap narrow"><div class="head"><h2>${esc(d.title || 'Perguntas frequentes')}</h2></div>
        ${(d.items || []).map((f, i) => `<details class="card"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></section>`;
    },
    cta(d, ctx) {
      const photo = safeUrl(d.image);
      return `<section class="s-cta" id="agendar"><div class="wrap"><div class="cta-box${photo ? ' has-photo' : ''}" style="${bgImage(d.image, 1600)}"><div>${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h2>${esc(d.title || '')}</h2>${d.text ? `<p>${esc(d.text)}</p>` : ''}</div>${button(d.buttonText, d.buttonUrl || 'whatsapp', ctx, 'btn btn-invert')}</div></div></section>`;
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
      // Formulario sem backend: monta a mensagem e abre o WhatsApp do cliente (custo zero, sem spam).
      const form = c.whatsapp && d.form !== false ? `<form class="card wa-form" data-wa-form="${esc(digits(c.whatsapp))}" data-brand="${esc(ctx.brand.name || '')}">
          <h3>${esc(d.formTitle || 'Envie sua mensagem')}</h3>
          <label>Nome<input name="nome" required autocomplete="name"></label>
          <label>Telefone<input name="telefone" inputmode="tel" autocomplete="tel"></label>
          <label>Mensagem<textarea name="mensagem" rows="3" required placeholder="${esc(d.formPlaceholder || 'Como podemos ajudar?')}"></textarea></label>
          <button class="btn" type="submit">${icon('wa')} Enviar pelo WhatsApp</button></form>` : '';
      return `<section class="s-contact" id="contato"><div class="wrap"><div class="head"><h2>${esc(d.title || 'Contato')}</h2>${d.text ? `<p>${esc(d.text)}</p>` : ''}</div>
        <div class="contact-grid${form ? ' with-form' : ''}"><div class="contact-col"><div class="card contact-list">${items.join('')}</div>
        ${hours.length ? `<div class="card hours"><h3>${icon('clock')} Horários</h3>${hours.map((h) => `<div class="hr"><span>${esc(h.label)}</span><b>${esc(h.value)}</b></div>`).join('')}</div>` : ''}</div>${form}</div></div></section>`;
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
    footer(ctx, sections) {
      const c = ctx.contact;
      const links = sections.filter((s) => NAV_LABELS[s.type]).map((s) => `<a href="#${SECTION_IDS[s.type]}">${NAV_LABELS[s.type]}</a>`).join('');
      const social = [
        c.instagram && `<a href="https://instagram.com/${esc(String(c.instagram).replace(/^@|https?:\/\/(www\.)?instagram\.com\//g, ''))}" target="_blank" rel="noopener" aria-label="Instagram">${icon('ig')}</a>`,
        safeUrl(c.facebook) && `<a href="${esc(safeUrl(c.facebook))}" target="_blank" rel="noopener" aria-label="Facebook">${icon('fb')}</a>`,
        c.whatsapp && `<a href="${esc(wa(c.whatsapp))}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('wa')}</a>`
      ].filter(Boolean).join('');
      const hours = (c.hours || []).filter((h) => h.label || h.value);
      return `<footer class="s-footer"><div class="wrap foot-grid">
          <div><strong class="brand">${esc(ctx.brand.name)}</strong>${ctx.brand.tagline ? `<p>${esc(ctx.brand.tagline)}</p>` : ''}${social ? `<div class="social">${social}</div>` : ''}</div>
          ${links ? `<nav><h4>Navegação</h4>${links}</nav>` : ''}
          <div><h4>Contato</h4>${c.phone ? `<p>${esc(c.phone)}</p>` : ''}${c.email ? `<p>${esc(c.email)}</p>` : ''}${c.address || c.city ? `<p>${esc([c.address, c.city].filter(Boolean).join(' - '))}</p>` : ''}</div>
          ${hours.length ? `<div><h4>Horários</h4>${hours.map((h) => `<p>${esc(h.label)}: ${esc(h.value)}</p>`).join('')}</div>` : ''}
        </div><div class="wrap foot-bottom"><small>© ${new Date().getFullYear()} ${esc(ctx.brand.name)}. Todos os direitos reservados.</small><small>Site por <a href="https://cdev.com.br" target="_blank" rel="noopener">CDEV</a></small></div></footer>`;
    }
  };

  const css = (t) => {
    const c = t.colors; const dark = t.mode === 'dark';
    const onP = dark ? '#0b0b0b' : '#fff';
    return `
    :root{--p:${c.primary};--a:${c.accent};--bg:${c.bg};--sf:${c.surface};--tx:${c.text};--mu:${c.muted};--r:${t.radius || '10px'};--onp:${onP};
      --line:${dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.08)'};--shadow:${dark ? '0 20px 50px rgba(0,0,0,.45)' : '0 20px 50px rgba(20,30,40,.12)'};
      --fh:'${t.fonts.heading}',system-ui,sans-serif;--fb:'${t.fonts.body}',system-ui,sans-serif;--alt:${dark ? 'color-mix(in srgb,var(--sf) 55%,var(--bg))' : 'color-mix(in srgb,var(--p) 4%,var(--bg))'}}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:80px}body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--fb);line-height:1.65;-webkit-font-smoothing:antialiased;font-size:clamp(1rem,.96rem + .2vw,1.075rem)}
    img{max-width:100%;display:block}a{color:inherit}
    .wrap{width:min(1180px,100% - 2.5rem);margin:0 auto}.narrow{width:min(780px,100% - 2.5rem)}
    h1,h2,h3,h4{font-family:var(--fh);line-height:1.08;margin:0 0 .55em;letter-spacing:-.01em}h1{font-size:clamp(2.4rem,1.6rem + 3.8vw,4.6rem)}h2{font-size:clamp(1.8rem,1.3rem + 2.2vw,3rem)}h3{font-size:clamp(1.08rem,1rem + .35vw,1.25rem)}
    section{padding:clamp(4rem,3rem + 5vw,7.5rem) 0}.head{text-align:center;max-width:680px;margin:0 auto clamp(2rem,1.5rem + 2vw,3.5rem)}.head p,.muted-text{color:var(--mu)}
    .s-services,.s-testimonials{background:var(--alt)}
    .pre{white-space:pre-line}.r{border-radius:var(--r)}
    .media{position:relative;overflow:hidden;background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--a) 45%,transparent),transparent 60%),linear-gradient(135deg,color-mix(in srgb,var(--p) 80%,var(--bg)),color-mix(in srgb,var(--p) 25%,var(--bg)))}
    .media img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}.media.ph{aspect-ratio:4/3;border-radius:var(--r)}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.95rem 1.6rem;border-radius:var(--r);background:var(--p);color:var(--onp);font-weight:700;text-decoration:none;white-space:nowrap;border:2px solid var(--p);transition:transform .15s,filter .15s,background .15s;cursor:pointer;font:inherit;font-weight:700}
    .btn svg{width:18px;height:18px}.btn:hover{transform:translateY(-2px);filter:brightness(1.08)}.btn-ghost{background:transparent;color:var(--tx);border-color:color-mix(in srgb,var(--tx) 25%,transparent)}.btn-sm{padding:.55rem 1rem;font-size:.9rem}
    .btn-invert{background:#fff;color:#111;border-color:#fff}
    .eyebrow{display:inline-block;margin-bottom:1rem;color:var(--p);font-weight:700;letter-spacing:.18em;text-transform:uppercase;font-size:.78rem}
    .s-topbar{background:var(--p);color:var(--onp);font-size:.85rem}.s-topbar .wrap{display:flex;gap:1.5rem;align-items:center;min-height:38px;flex-wrap:wrap}.s-topbar a,.s-topbar span{display:inline-flex;gap:.4rem;align-items:center;text-decoration:none}.s-topbar svg{width:14px;height:14px}.tb-addr{margin-left:auto}
    @media(max-width:700px){.tb-addr{display:none}}
    .s-header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);transition:background .25s,border-color .25s}
    .s-header .wrap{display:flex;align-items:center;gap:1.5rem;height:72px}.brand{font-family:var(--fh);font-weight:800;font-size:1.35rem;text-decoration:none;letter-spacing:.02em}.brand img{height:42px}
    .s-nav{display:flex;gap:1.5rem;margin-left:auto}.s-nav a{text-decoration:none;color:var(--mu);font-size:.95rem;font-weight:500}.s-nav a:hover{color:var(--p)}
    .s-header.over{position:fixed;left:0;right:0;background:linear-gradient(rgba(0,0,0,.45),transparent);border-color:transparent;backdrop-filter:none;color:#fff}.s-header.over .s-nav a{color:rgba(255,255,255,.85)}.s-header.over .s-burger{color:#fff}
    .s-header.over.scrolled{background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(14px);border-color:var(--line);color:var(--tx)}.s-header.over.scrolled .s-nav a{color:var(--mu)}.s-header.over.scrolled .s-burger{color:var(--tx)}
    .s-header-cta{display:flex;align-items:center;gap:.6rem}.s-burger{display:none;background:none;border:0;color:var(--tx);width:42px;height:42px;cursor:pointer}.s-burger svg{width:24px;height:24px}
    @media(max-width:880px){.s-nav{display:none;position:absolute;top:72px;left:0;right:0;flex-direction:column;gap:0;padding:.5rem 1.25rem 1rem;background:var(--bg);border-bottom:1px solid var(--line)}.s-nav a{padding:.8rem 0;border-bottom:1px solid var(--line);color:var(--tx)!important}.s-nav.open{display:flex}.s-burger{display:grid;place-items:center}.s-header-cta{margin-left:auto}.s-header-cta .btn{display:none}}
    .hero-split{padding-top:clamp(3rem,2rem + 4vw,6rem)}
    .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(2rem,1rem + 4vw,5rem);align-items:center}
    .lead{font-size:clamp(1.05rem,1rem + .35vw,1.25rem);color:var(--mu);max-width:36rem}.actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}
    .hero-media{position:relative}.hero-media .media{box-shadow:var(--shadow)}
    .float-badge{position:absolute;left:-1.5rem;bottom:2rem;display:grid;gap:.15rem;padding:1rem 1.2rem;border-radius:var(--r);background:var(--sf);border:1px solid var(--line);box-shadow:var(--shadow);min-width:11rem}.float-badge strong{font-family:var(--fh);font-size:1.6rem;line-height:1}.float-badge span{color:var(--mu);font-size:.85rem}
    .hero-overlay,.hero-center{position:relative;min-height:min(92vh,860px);display:flex;align-items:flex-end;background-size:cover;background-position:center;color:#fff;padding:9rem 0 clamp(3rem,2rem + 4vw,5.5rem);background-color:color-mix(in srgb,var(--p) 30%,#111)}
    .hero-center{align-items:center;text-align:center}.hero-center .hero-inner{max-width:860px}.hero-center .lead{margin-inline:auto}.hero-center .actions{justify-content:center}.hero-center .stats{justify-content:center}
    .hero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.25) 35%,rgba(0,0,0,.78) 100%)}.hero-center .hero-shade{background:rgba(0,0,0,.55)}
    .hero-inner{position:relative}.hero-overlay h1,.hero-center h1{max-width:15ch;color:#fff}.hero-center h1{margin-inline:auto}.hero-overlay .lead,.hero-center .lead{color:rgba(255,255,255,.85)}
    .hero-overlay .eyebrow,.hero-center .eyebrow{color:color-mix(in srgb,var(--a) 70%,#fff)}.hero-overlay .btn-ghost,.hero-center .btn-ghost{color:#fff;border-color:rgba(255,255,255,.5)}
    .stats{display:flex;flex-wrap:wrap;gap:clamp(1.2rem,1rem + 2vw,3rem);margin:2.5rem 0 0;padding-top:1.5rem;border-top:1px solid var(--line)}.stats div{display:flex;flex-direction:column-reverse}.stats dt{color:var(--mu);font-size:.85rem}.stats dd{margin:0;font-family:var(--fh);font-size:clamp(1.6rem,1.3rem + 1.2vw,2.3rem);font-weight:700;color:var(--p);line-height:1.1}
    .stats.on-dark{border-color:rgba(255,255,255,.2)}.stats.on-dark dt{color:rgba(255,255,255,.75)}.stats.on-dark dd{color:#fff}.stats.compact{margin-top:1.8rem}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,1rem + 4vw,5rem);align-items:center}.two.flip>.about-media{order:2}
    .about-media{position:relative}.about-media.has-2{padding:0 12% 12% 0}.about-media .second{position:absolute;right:0;bottom:0;width:45%;border:6px solid var(--bg);box-shadow:var(--shadow)}
    .about-badge{position:absolute;top:1.5rem;left:-1rem;background:var(--p);color:var(--onp);padding:1rem 1.2rem;border-radius:var(--r);display:grid;box-shadow:var(--shadow)}.about-badge strong{font-family:var(--fh);font-size:2rem;line-height:1}.about-badge span{font-size:.8rem;opacity:.9}
    @media(max-width:880px){.hero-grid,.two{grid-template-columns:1fr}.two.flip>.about-media{order:0}.hero-media .media{aspect-ratio:4/3!important}.float-badge{left:1rem;bottom:1rem}.about-badge{left:1rem}}
    .checks{list-style:none;padding:0;margin:1.5rem 0 0;display:grid;gap:.7rem}.checks li{display:flex;gap:.7rem;align-items:center;font-weight:500}.checks svg{width:22px;height:22px;padding:3px;border-radius:50%;background:color-mix(in srgb,var(--p) 15%,transparent);color:var(--p);flex-shrink:0}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:1.3rem}
    .card{background:var(--sf);border:1px solid var(--line);border-radius:var(--r);padding:1.6rem}.card p{color:var(--mu);margin:.2rem 0 0}
    .svc-card{padding:0;overflow:hidden;display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s}.svc-card:hover{transform:translateY(-4px);box-shadow:var(--shadow)}.svc-card:hover img{transform:scale(1.05)}.svc-body{padding:1.4rem 1.5rem 1.6rem;display:flex;flex-direction:column;flex:1}.svc-body .price{margin-top:auto;padding-top:1rem}
    .price{display:block;margin-top:.8rem;color:var(--p);font-family:var(--fh);font-size:1.25rem;font-weight:700}
    .menu-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:1.4rem 3rem}
    .menu-item{display:flex;gap:1rem;align-items:center;padding-bottom:1.3rem;border-bottom:1px solid var(--line)}.menu-item .thumb{width:76px;height:76px;flex-shrink:0;border-radius:50%}.mi-body{flex:1;min-width:0}
    .mi-line{display:flex;align-items:baseline;gap:.6rem}.mi-line h3{margin:0}.mi-line .dots{flex:1;border-bottom:2px dotted color-mix(in srgb,var(--mu) 50%,transparent);transform:translateY(-4px)}.mi-line .price{margin:0;white-space:nowrap}.menu-item p{margin:.3rem 0 0;color:var(--mu);font-size:.95rem}
    .features{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:0;border-top:1px solid var(--line)}
    .feature{display:flex;gap:1.1rem;padding:1.8rem 1.4rem 1.8rem 0;border-bottom:1px solid var(--line)}.feature .num{font-family:var(--fh);font-size:1.1rem;color:var(--p);font-weight:700;min-width:2rem}.feature p{margin:.2rem 0 0;color:var(--mu)}
    .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:.8rem}.gal figure{margin:0;position:relative}.gal .media{aspect-ratio:1;border-radius:var(--r)}.gal figure:hover img{transform:scale(1.05)}
    .gal figcaption{position:absolute;left:.6rem;bottom:.6rem;right:.6rem;font-size:.8rem;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);padding:.35rem .6rem;border-radius:calc(var(--r) * .6);opacity:0;transition:opacity .2s}.gal figure:hover figcaption{opacity:1}
    .gal-mosaic{grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(150px,17vw)}.gal-mosaic .media{aspect-ratio:auto;height:100%}.gal-mosaic figure:first-child{grid-column:span 2;grid-row:span 2}
    @media(max-width:700px){.gal-mosaic{grid-template-columns:1fr 1fr;grid-auto-rows:42vw}}
    .gal-masonry{display:block;columns:3 240px;column-gap:.8rem}.gal-masonry figure{break-inside:avoid;margin-bottom:.8rem}.gal-masonry .media{aspect-ratio:auto}.gal-masonry figure:nth-child(3n+1) .media{aspect-ratio:3/4}.gal-masonry figure:nth-child(3n+2) .media{aspect-ratio:4/3}.gal-masonry figure:nth-child(3n) .media{aspect-ratio:1}
    .stars,.float-badge .stars,.rating-sum .stars{display:inline-flex;gap:2px;color:#f5b301}.stars svg{width:16px;height:16px;fill:currentColor}
    .rating-sum{display:inline-flex;align-items:center;gap:.6rem;margin-top:.4rem;padding:.5rem 1rem;border-radius:999px;background:var(--sf);border:1px solid var(--line)}.rating-sum strong{font-family:var(--fh)}.rating-sum span{color:var(--mu);font-size:.9rem}
    blockquote{margin:0}.quote{display:flex;flex-direction:column;gap:1rem}.quote>svg{width:30px;height:30px;color:var(--p);opacity:.5}.quote p{color:var(--tx);font-size:1.02rem;flex:1}
    .quote footer{display:flex;align-items:center;gap:.8rem;padding-top:1rem;border-top:1px solid var(--line)}.quote cite{font-style:normal;font-weight:700;display:grid;flex:1;line-height:1.3}.quote cite small{font-weight:400;color:var(--mu)}
    .avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0}.avatar.ini{display:grid;place-items:center;background:color-mix(in srgb,var(--p) 20%,var(--sf));color:var(--p);font-weight:700;font-size:.9rem}
    details{margin-bottom:.8rem;cursor:pointer;padding:1.2rem 1.4rem}summary{font-weight:700;font-family:var(--fh);font-size:1.05rem;list-style:none;display:flex;justify-content:space-between;gap:1rem}summary::-webkit-details-marker{display:none}summary::after{content:'+';color:var(--p);font-size:1.4rem;line-height:1}details[open] summary::after{content:'–'}details p{margin-top:.8rem}
    .cta-box{position:relative;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5rem;padding:clamp(2.2rem,1.5rem + 4vw,4.5rem);border-radius:var(--r);background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 60%,var(--a)));color:var(--onp);background-size:cover;background-position:center}
    .cta-box.has-photo{color:#fff}.cta-box.has-photo::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.45))}.cta-box>*{position:relative}.cta-box .eyebrow{color:var(--a)}
    .cta-box h2{margin:0;max-width:20ch}.cta-box p{margin:.5rem 0 0;opacity:.88;max-width:40ch}
    .contact-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:1.3rem}.contact-grid.with-form{grid-template-columns:1fr 1fr}.contact-col{display:grid;gap:1.3rem;align-content:start}@media(max-width:880px){.contact-grid,.contact-grid.with-form{grid-template-columns:1fr}}
    .contact-list{display:grid;gap:1.1rem}.contact-list>*{display:flex;gap:.9rem;align-items:center;text-decoration:none;color:var(--mu)}.contact-list b{color:var(--tx);font-weight:600;word-break:break-word}
    .contact-list svg,.hours h3 svg{width:22px;height:22px;color:var(--p);flex-shrink:0}.hours h3{display:flex;gap:.5rem;align-items:center}.hr{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0;border-bottom:1px solid var(--line)}.hr span{color:var(--mu)}
    .wa-form{display:grid;gap:.9rem;align-content:start}.wa-form label{display:grid;gap:.35rem;font-size:.85rem;font-weight:600;color:var(--mu)}
    .wa-form input,.wa-form textarea{font:inherit;color:var(--tx);background:var(--bg);border:1px solid var(--line);border-radius:calc(var(--r) * .7);padding:.8rem .9rem;outline:none}.wa-form input:focus,.wa-form textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 20%,transparent)}.wa-form .btn{width:100%}
    .map{width:100%;height:clamp(280px,40vw,420px);border:0;filter:${dark ? 'grayscale(.4) invert(.9) hue-rotate(180deg)' : 'none'}}
    .s-wa{position:fixed;right:1.2rem;bottom:1.2rem;z-index:30;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:transform .2s}.s-wa:hover{transform:scale(1.08)}.s-wa svg{width:30px;height:30px}
    .s-footer{padding:clamp(3rem,2rem + 3vw,4.5rem) 0 1.5rem;border-top:1px solid var(--line);background:var(--alt);font-size:.93rem}
    .foot-grid{display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:2rem}.foot-grid p{margin:.3rem 0;color:var(--mu)}.foot-grid h4{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);font-family:var(--fb)}
    .foot-grid nav{display:grid;gap:.35rem;align-content:start}.foot-grid nav a{text-decoration:none;color:var(--mu)}.foot-grid nav a:hover{color:var(--p)}
    .social{display:flex;gap:.5rem;margin-top:1rem}.social a{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line);color:var(--tx)}.social a:hover{background:var(--p);color:var(--onp);border-color:var(--p)}.social svg{width:17px;height:17px}
    .foot-bottom{display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-top:2.5rem;padding-top:1.3rem;border-top:1px solid var(--line);color:var(--mu)}
    @media(max-width:880px){.foot-grid{grid-template-columns:1fr 1fr}.foot-grid>div:first-child{grid-column:1/-1}}
    .reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}.reveal.in{opacity:1;transform:none}
    @media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}*{transition:none!important;scroll-behavior:auto!important}}
    .s-preview-bar{position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:40;background:#111;color:#fff;font:600 12px/1 system-ui;padding:.6rem 1rem;border-radius:999px;opacity:.85}`;
  };

  const fontLink = (t) => {
    const fams = [...new Set([t.fonts.heading, t.fonts.body])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800`).join('&');
    return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
  };

  // Comportamentos (menu mobile, header sobre a foto, animacao de entrada, formulario WhatsApp).
  // Delegados no documento uma unica vez: o editor re-renderiza o site varias vezes.
  const bindBehaviors = (doc, preview) => {
    const win = doc.defaultView || window;
    if (!win.__cdevSiteBound) {
      win.__cdevSiteBound = true;
      doc.addEventListener('click', (e) => {
        const burger = e.target.closest('[data-burger]');
        if (burger) { doc.getElementById('s-nav')?.classList.toggle('open'); return; }
        if (e.target.closest('.s-nav a')) doc.getElementById('s-nav')?.classList.remove('open');
      });
      doc.addEventListener('submit', (e) => {
        const form = e.target.closest('[data-wa-form]');
        if (!form) return;
        e.preventDefault();
        const f = new FormData(form);
        const text = [`Olá! Vim pelo site da ${form.dataset.brand}.`, `Nome: ${f.get('nome') || ''}`, f.get('telefone') ? `Telefone: ${f.get('telefone')}` : '', `Mensagem: ${f.get('mensagem') || ''}`].filter(Boolean).join('\n');
        win.open(wa(form.dataset.waForm, text), '_blank', 'noopener');
      });
      const onScroll = () => doc.getElementById('s-header')?.classList.toggle('scrolled', win.scrollY > 40);
      win.addEventListener('scroll', onScroll, { passive: true });
    }
    doc.getElementById('s-header')?.classList.toggle('scrolled', win.scrollY > 40);
    // Animacao de entrada apenas no site publicado (no preview do editor atrapalharia).
    if (!preview && 'IntersectionObserver' in win && !win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const io = new win.IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
      doc.querySelectorAll('main section:not(.s-hero) .head, .card, .menu-item, .feature, .gal figure, .about-media, .cta-box').forEach((el) => { el.classList.add('reveal'); io.observe(el); });
    }
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
    const first = sections[0];
    const over = first && first.type === 'hero' && ['overlay', 'center'].includes(first.data?.variant) && !ctx.settings.topbar;
    doc.body.innerHTML = (ctx.settings.topbar ? COMPONENTS.topbar(ctx) : '') + COMPONENTS.header(ctx, sections, over)
      + `<main>${sections.map((s) => COMPONENTS[s.type](s.data || {}, ctx)).join('')}</main>`
      + COMPONENTS.footer(ctx, sections) + COMPONENTS.whatsapp(ctx)
      + (preview ? `<div class="s-preview-bar">Pré-visualização${site.status ? ' · ' + esc(site.status) : ''}</div>` : '');
    bindBehaviors(doc, preview);
  };

  window.CDEVSiteEngine = { render, resolveTheme, PRESETS, FONTS, SECTION_IDS, COMPONENTS, VARIANTS, version: '2.0.0' };
})();
