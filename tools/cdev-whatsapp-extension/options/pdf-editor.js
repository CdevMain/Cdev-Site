/* CDEV WhatsApp — editor do modelo de orçamento em PDF (página de configurações).
 * Layout em blocos reordenáveis com arrastar e soltar, pré-visualização real
 * do PDF ao lado, upload de logo e assinatura (desenhada ou imagem). */
(() => {
  const { util: U, store } = WAW;
  const I = (n) => WAW.icon(n);
  const esc = U.esc;
  const ed = { open: "", dragIndex: -1, previewUrl: "", timer: null, doc: "pdf" };
  const docKey = () => ed.doc; // "pdf" (orçamento) | "contract"
  const docBlocks = (d) => d[docKey()].blocks;

  /** API injetada pelo options.js: { draft(), markDirty(), render(), toast() } */
  let api = null;

  const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? "selected" : ""}>${esc(l)}</option>`;
  const field = (path, label, value, { type = "text", attrs = "", help = "" } = {}) =>
    `<label class="f"><span>${esc(label)}</span><input type="${type}" data-bind="${path}" value="${esc(value ?? "")}" ${attrs}/>${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  const area = (path, label, value, rows = 3, help = "Variáveis: {{cliente}} {{empresa}} {{numero}} {{data}} {{validade}} {{total}} {{minhaempresa}} {{site}}") =>
    `<label class="f"><span>${esc(label)}</span><textarea data-bind="${path}" rows="${rows}">${esc(value || "")}</textarea><small>${esc(help)}</small></label>`;
  const chk = (path, label, value) => `<label class="check"><input type="checkbox" data-bind="${path}" ${value ? "checked" : ""}/><span>${esc(label)}</span></label>`;

  function blockSettings(b, i) {
    const p = `${docKey()}.blocks.${i}`;
    switch (b.type) {
      case "header":
        return `<div class="grid g2"><label class="f"><span>Estilo</span><select data-bind="${p}.style" data-pdf-rerender="1">${opt("classic", "Clássico (logo à esquerda)", b.style)}${opt("band", "Faixa colorida", b.style)}${opt("centered", "Centralizado", b.style)}</select></label>
          <p class="muted small" style="align-self:end">Logo e dados da empresa ficam no cartão “Empresa”.</p></div>`;
      case "title":
        return `${field(`${p}.text`, "Título do documento", b.text)}<div style="margin-top:8px">${chk(`${p}.showValidity`, "Mostrar “Válida até” (senão mostra a referência do orçamento)", b.showValidity !== false)}</div>`;
      case "parties":
      case "witnesses":
        return `${field(`${p}.title`, "Título", b.title)}${b.type === "parties" ? '<p class="muted small">Qualificação automática: nome/empresa, CPF/CNPJ, endereço e contato do cliente (CONTRATANTE) e da sua empresa (CONTRATADA).</p>' : ""}`;
      case "clauses":
        return `<p class="muted small">Cláusulas numeradas automaticamente (PRIMEIRA, SEGUNDA…). Variáveis: {{itens}} {{total}} {{totalextenso}} {{cliente}} {{clientedoc}} {{clienteendereco}} {{cidade}} {{meudoc}} {{orcamento}} {{data}}. No WhatsApp você ainda pode editar cada cláusula antes de gerar.</p>
          <ol class="cl-list">${(b.clauses || [])
            .map(
              (c, j) => `<li><div class="row"><input data-bind="${p}.clauses.${j}.title" value="${esc(c.title)}" placeholder="Título da cláusula"/>
              <button type="button" class="icon-btn" data-do="cl-move" data-i="${i}" data-j="${j}" data-d="-1">↑</button><button type="button" class="icon-btn" data-do="cl-move" data-i="${i}" data-j="${j}" data-d="1">↓</button><button type="button" class="icon-btn danger" data-do="cl-del" data-i="${i}" data-j="${j}">${I("trash")}</button></div>
              <textarea data-bind="${p}.clauses.${j}.text" rows="4">${esc(c.text)}</textarea></li>`,
            )
            .join("")}</ol>
          <button type="button" class="btn sm" data-do="cl-add" data-i="${i}">+ Cláusula</button>`;
      case "client":
        return field(`${p}.title`, "Rótulo do bloco", b.title);
      case "intro":
        return area(`${p}.text`, "Texto de abertura", b.text, 4);
      case "items":
        return `${field(`${p}.title`, "Título da tabela", b.title)}<div class="row wrap" style="margin-top:8px;gap:16px">${chk(`${p}.showDescription`, "Mostrar descrição", b.showDescription)}${chk(`${p}.showQty`, "Coluna quantidade", b.showQty)}${chk(`${p}.showUnit`, "Coluna valor unitário", b.showUnit)}${chk(`${p}.zebra`, "Linhas alternadas", b.zebra)}</div>`;
      case "totals":
        return '<p class="muted small">Subtotal, desconto (se houver) e total em destaque com a cor principal.</p>';
      case "payment":
      case "terms":
      case "text":
        return `${field(`${p}.title`, "Título", b.title)}${area(`${p}.text`, "Texto", b.text, 3)}${b.type === "terms" ? '<p class="muted small">As observações digitadas no momento do orçamento aparecem antes deste texto.</p>' : ""}`;
      case "signature":
        return `<div class="grid g2"><label class="f"><span>Alinhamento (uma assinatura)</span><select data-bind="${p}.align" data-pdf-rerender="1">${opt("left", "Esquerda", b.align)}${opt("center", "Centro", b.align)}${opt("right", "Direita", b.align)}</select></label><div></div></div>
          <div class="row wrap" style="margin-top:8px;gap:16px">${chk(`${p}.clientAccept`, "Linha de aceite do cliente (duas assinaturas)", b.clientAccept)}${chk(`${p}.dateLine`, "Local e data acima", b.dateLine)}</div>
          <div class="grid g2" style="margin-top:8px">${field(`${p}.companyLabel`, "Rótulo da sua assinatura", b.companyLabel, { attrs: 'placeholder="Ex.: CONTRATADA"' })}${field(`${p}.clientLabel`, "Rótulo da assinatura do cliente", b.clientLabel, { attrs: 'placeholder="Ex.: CONTRATANTE (vazio = De acordo)"' })}</div>
          <p class="muted small">A imagem da assinatura e os dados do responsável ficam no cartão “Assinatura”.</p>`;
      case "footer":
        return `${field(`${p}.text`, "Texto do rodapé", b.text, { help: "Aparece em todas as páginas." })}<div style="margin-top:8px">${chk(`${p}.pageNumbers`, "Numerar páginas (Página 1 de 2)", b.pageNumbers)}</div>`;
      case "spacer":
        return field(`${p}.height`, "Altura (mm)", b.height, { type: "number", attrs: 'min="1" max="80" data-type="number"' });
      default:
        return '<p class="muted small">Sem configurações.</p>';
    }
  }

  function blocksHtml(pdf) {
    return pdf.blocks
      .map((b, i) => {
        const meta = store.PDF_BLOCKS[b.type];
        const open = ed.open === b.id;
        const label = b.type === "text" && b.title ? `${meta.label}: ${b.title}` : meta.label;
        return `<li class="blk ${b.on ? "" : "is-off"} ${open ? "is-open" : ""}" data-blk="${i}">
          <div class="blk-row">
            <span class="blk-grip" draggable="true" data-grip-i="${i}" title="Arraste para reordenar">${I("grip")}</span>
            <span class="blk-ic">${I(meta.icon)}</span>
            <button type="button" class="blk-name" data-do="blk-open" data-id="${esc(b.id)}">${esc(label)}</button>
            <button type="button" class="icon-btn" data-do="blk-move" data-i="${i}" data-d="-1" title="Subir">↑</button>
            <button type="button" class="icon-btn" data-do="blk-move" data-i="${i}" data-d="1" title="Descer">↓</button>
            ${meta.unique ? "" : `<button type="button" class="icon-btn danger" data-do="blk-del" data-i="${i}" title="Remover">${I("trash")}</button>`}
            <label class="switch" title="${b.on ? "Visível" : "Oculto"}"><input type="checkbox" data-bind="${docKey()}.blocks.${i}.on" data-pdf-rerender="1" ${b.on ? "checked" : ""}/><span></span></label>
            <button type="button" class="icon-btn" data-do="blk-open" data-id="${esc(b.id)}" title="Configurar">${I(open ? "chevronDown" : "chevronRight")}</button>
          </div>
          ${open ? `<div class="blk-body">${blockSettings(b, i)}</div>` : ""}
        </li>`;
      })
      .join("");
  }

  function imageSlot(path, label, value, extra = "") {
    return `<div class="img-slot">
      <div class="img-prev ${value ? "" : "is-empty"}">${value ? `<img src="${value}" alt=""/>` : `${I("upload")}<span>Sem imagem</span>`}</div>
      <div class="img-acts">
        <strong>${esc(label)}</strong>
        <label class="btn sm"><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-img="${path}" hidden/>${I("upload")}Enviar imagem</label>
        ${value ? `<button type="button" class="btn sm ghost" data-do="img-clear" data-path="${path}">Remover</button>` : ""}
        ${extra}
      </div>
    </div>`;
  }

  function render() {
    const d = api.draft();
    const pdf = d.pdf;
    const co = pdf.company;
    const isContract = ed.doc === "contract";
    const num = d[docKey()];
    return `
    <div class="doc-switch">
      <button type="button" class="${isContract ? "" : "is-on"}" data-do="doc-switch" data-doc="pdf">${I("calc")}Orçamento</button>
      <button type="button" class="${isContract ? "is-on" : ""}" data-do="doc-switch" data-doc="contract">${I("briefcase")}Contrato</button>
    </div>
    <p class="lead">${isContract ? "Modelo de contrato: edite as cláusulas, arraste os blocos pelo ⠿ e veja o PDF ao lado. Empresa, logo, assinatura e cores são os mesmos do orçamento. No WhatsApp: painel › Ferramentas › Orçamento › <b>Gerar contrato</b> (as cláusulas podem ser editadas para cada cliente)." : "Monte o seu modelo de orçamento. Arraste os blocos pelo ⠿ para mudar a ordem, ligue/desligue cada parte e veja o PDF real ao lado. No WhatsApp: painel › Ferramentas › Orçamento › <b>Gerar PDF</b>."}</p>
    <div class="pdf-editor">
      <div class="pdf-left">
        <div class="card">
          <div class="card-head"><div class="title">${I("lists")}Layout do documento</div><span class="muted small">arraste para reordenar</span></div>
          <ul class="blk-list" id="blk-list">${blocksHtml(d[docKey()])}</ul>
          <div class="row wrap" style="margin-top:10px">
            <button type="button" class="btn sm" data-do="blk-add" data-type="text">+ Texto livre</button>
            <button type="button" class="btn sm" data-do="blk-add" data-type="divider">+ Linha</button>
            <button type="button" class="btn sm" data-do="blk-add" data-type="spacer">+ Espaço</button>
            <span style="flex:1"></span>
            <button type="button" class="btn sm ghost" data-do="pdf-reset-layout">Restaurar layout padrão</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="title">${I("briefcase")}Empresa</div></div>
          ${imageSlot("pdf.logo", "Logo / ícone", pdf.logo, `<label class="f" style="min-width:160px"><span>Largura no PDF <b>${pdf.logoWidth} mm</b></span><input type="range" min="10" max="80" step="1" data-bind="pdf.logoWidth" data-type="number" value="${pdf.logoWidth}"/></label>`)}
          <div class="grid g2" style="margin-top:12px">
            ${field("pdf.company.name", "Nome da empresa", co.name)}
            ${field("pdf.company.doc", "CNPJ / CPF", co.doc)}
            ${field("pdf.company.address", "Endereço (termine com a cidade)", co.address)}
            ${field("pdf.company.phone", "Telefone / WhatsApp", co.phone)}
            ${field("pdf.company.email", "E-mail", co.email)}
            ${field("pdf.company.site", "Site", co.site)}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="title">${I("edit")}Assinatura</div></div>
          ${imageSlot("pdf.signature", "Imagem da assinatura", pdf.signature)}
          <div class="sig-pad">
            <canvas id="sig-canvas" width="520" height="150"></canvas>
            <div class="row"><span class="muted small">Ou desenhe aqui com o mouse/caneta</span><span style="flex:1"></span><button type="button" class="btn sm ghost" data-do="sig-clear">Limpar</button><button type="button" class="btn sm primary" data-do="sig-use">Usar desenho</button></div>
          </div>
          <div class="grid g3" style="margin-top:12px">
            ${field("pdf.signerName", "Nome do responsável", pdf.signerName)}
            ${field("pdf.signerRole", "Cargo", pdf.signerRole)}
            ${field("pdf.signerDoc", "Documento (opcional)", pdf.signerDoc)}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="title">${I("panel")}Visual</div></div>
          <div class="grid g3">
            <div class="f"><span class="muted small">Cor principal</span><div class="row"><input type="color" data-bind="pdf.primary" value="${pdf.primary}"/>${["#0f766e", "#1d4ed8", "#7c3aed", "#b91c1c", "#c2410c", "#111827"].map((c) => `<button type="button" class="swatch" style="background:${c}" data-do="pdf-color" data-c="${c}" title="${c}"></button>`).join("")}</div></div>
            <div class="f"><span class="muted small">Cor do texto</span><input type="color" data-bind="pdf.text" value="${pdf.text}"/></div>
            <div class="f"><span class="muted small">Cor secundária</span><input type="color" data-bind="pdf.muted" value="${pdf.muted}"/></div>
            <label class="f"><span>Fonte</span><select data-bind="pdf.font">${opt("helvetica", "Helvetica (moderna)", pdf.font)}${opt("times", "Times (clássica)", pdf.font)}${opt("courier", "Courier (máquina)", pdf.font)}</select></label>
            <label class="f"><span>Papel</span><select data-bind="pdf.paper">${opt("a4", "A4", pdf.paper)}${opt("letter", "Carta", pdf.paper)}</select></label>
            ${field("pdf.margin", "Margem (mm)", pdf.margin, { type: "number", attrs: 'min="8" max="30" data-type="number"' })}
            ${field("pdf.watermark", "Marca d'água (opcional)", pdf.watermark, { attrs: 'placeholder="Ex.: PROPOSTA"' })}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="title">${I("hash")}Numeração ${isContract ? "do contrato" : "e validade"}</div></div>
          <div class="grid g4">
            ${field(`${docKey()}.numberPrefix`, "Prefixo", num.numberPrefix)}
            ${field(`${docKey()}.nextNumber`, "Próximo número", num.nextNumber, { type: "number", attrs: 'min="1" data-type="number"' })}
            ${field(`${docKey()}.numberPad`, "Dígitos", num.numberPad, { type: "number", attrs: 'min="1" max="8" data-type="number"' })}
            ${isContract ? "" : field("pdf.validityDays", "Validade (dias)", pdf.validityDays, { type: "number", attrs: 'min="0" max="365" data-type="number"' })}
          </div>
          <div style="margin-top:10px">${isContract ? chk("contract.markClosed", "Ao gerar, marcar o contato como “Fechado” e registrar nota no histórico", num.markClosed) : chk("pdf.markProposal", "Ao gerar, marcar o contato como “Proposta enviada” e registrar no histórico", pdf.markProposal)}</div>
        </div>
      </div>

      <div class="pdf-right">
        <div class="pdf-preview-card">
          <div class="row"><strong>Pré-visualização</strong><span class="muted small" id="pdf-status">dados de exemplo</span><span style="flex:1"></span><button type="button" class="btn sm ghost" data-do="pdf-open">Abrir em nova aba</button><button type="button" class="btn sm" data-do="pdf-download">${I("download")}Baixar exemplo</button></div>
          <iframe id="pdf-frame" title="Pré-visualização do PDF"></iframe>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- pré-visualização ---------------- */
  function buildDoc() {
    const d = api.draft();
    const tpl = WAW.pdf.template(store.normalizeConfig(d), ed.doc === "contract" ? "contract" : "quote");
    return WAW.pdf.build(tpl, WAW.pdf.sampleData(tpl, d.catalog));
  }

  function schedulePreview() {
    clearTimeout(ed.timer);
    ed.timer = setTimeout(updatePreview, 350);
  }

  function updatePreview() {
    const frame = document.getElementById("pdf-frame");
    const status = document.getElementById("pdf-status");
    if (!frame) return;
    try {
      const t0 = performance.now();
      const doc = buildDoc();
      const url = URL.createObjectURL(doc.output("blob"));
      frame.src = `${url}#toolbar=0&navpanes=0&view=FitH`;
      if (ed.previewUrl) setTimeout(((old) => () => URL.revokeObjectURL(old))(ed.previewUrl), 2000);
      ed.previewUrl = url;
      if (status) status.textContent = `dados de exemplo · ${doc.getNumberOfPages()} página(s) · ${Math.round(performance.now() - t0)} ms`;
    } catch (error) {
      if (status) status.textContent = `erro: ${error.message}`;
    }
  }

  /* ---------------- imagens ---------------- */
  function fileToDataUrl(file, maxSide = 700) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Imagem inválida"));
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png")); // PNG mantém transparência
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Recorta o espaço vazio em volta do desenho. */
  function trimCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1)
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
    if (maxX < 0) return null;
    const pad = 6;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d").drawImage(canvas, minX - pad, minY - pad, w, h, 0, 0, w, h);
    return out.toDataURL("image/png");
  }

  function bindSignaturePad() {
    const canvas = document.getElementById("sig-canvas");
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = "1";
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4b";
    let drawing = false;
    let last = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height, p: e.pressure || 0.5 };
    };
    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      last = pos(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineWidth = 1.6 + p.p * 2.4;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });
    const stop = () => (drawing = false);
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointerleave", stop);
  }

  /* ---------------- arrastar e soltar ---------------- */
  function bindDnd() {
    const list = document.getElementById("blk-list");
    if (!list || list.dataset.bound) return;
    list.dataset.bound = "1";
    list.addEventListener("dragstart", (e) => {
      const g = e.target.closest("[data-grip-i]");
      if (!g) return e.preventDefault();
      ed.dragIndex = Number(g.dataset.gripI);
      const li = g.closest(".blk");
      li.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(ed.dragIndex));
      e.dataTransfer.setDragImage(li, 20, 20);
    });
    list.addEventListener("dragover", (e) => {
      if (ed.dragIndex < 0) return;
      e.preventDefault();
      const li = e.target.closest(".blk");
      list.querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
      if (!li) return;
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
    });
    list.addEventListener("dragleave", (e) => {
      if (!list.contains(e.relatedTarget)) list.querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
    });
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      const li = e.target.closest(".blk");
      const from = ed.dragIndex;
      ed.dragIndex = -1;
      if (!li || from < 0) return api.render();
      const blocks = docBlocks(api.draft());
      let to = Number(li.dataset.blk);
      const r = li.getBoundingClientRect();
      if (e.clientY >= r.top + r.height / 2) to += 1;
      const [moved] = blocks.splice(from, 1);
      if (from < to) to -= 1;
      blocks.splice(to, 0, moved);
      api.markDirty();
      api.render();
    });
    list.addEventListener("dragend", () => {
      ed.dragIndex = -1;
      list.querySelectorAll(".is-dragging, .drop-before, .drop-after").forEach((n) => n.classList.remove("is-dragging", "drop-before", "drop-after"));
    });
  }

  function afterRender() {
    bindDnd();
    bindSignaturePad();
    schedulePreview();
  }

  /* ---------------- ações ---------------- */
  async function onClick(t) {
    const d = api.draft();
    const blocks = docBlocks(d);
    switch (t.dataset.do) {
      case "doc-switch":
        ed.doc = t.dataset.doc === "contract" ? "contract" : "pdf";
        ed.open = "";
        return api.render();
      case "cl-add": {
        const b = blocks[Number(t.dataset.i)];
        b.clauses = b.clauses || [];
        b.clauses.push({ id: U.uid("cl"), title: "NOVA CLÁUSULA", text: "" });
        api.markDirty();
        return api.render();
      }
      case "cl-del":
        blocks[Number(t.dataset.i)].clauses.splice(Number(t.dataset.j), 1);
        api.markDirty();
        return api.render();
      case "cl-move": {
        const list = blocks[Number(t.dataset.i)].clauses;
        const j = Number(t.dataset.j);
        const k = j + Number(t.dataset.d);
        if (k < 0 || k >= list.length) return true;
        [list[j], list[k]] = [list[k], list[j]];
        api.markDirty();
        return api.render();
      }
      case "blk-open":
        ed.open = ed.open === t.dataset.id ? "" : t.dataset.id;
        return api.render();
      case "blk-move": {
        const i = Number(t.dataset.i);
        const j = i + Number(t.dataset.d);
        if (j < 0 || j >= blocks.length) return true;
        [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
        api.markDirty();
        return api.render();
      }
      case "blk-del":
        blocks.splice(Number(t.dataset.i), 1);
        api.markDirty();
        return api.render();
      case "blk-add": {
        const b = store.makePdfBlock(t.dataset.type);
        const footerAt = blocks.findIndex((x) => x.type === "footer");
        blocks.splice(footerAt >= 0 ? footerAt : blocks.length, 0, b);
        ed.open = b.id;
        api.markDirty();
        return api.render();
      }
      case "pdf-reset-layout":
        if (!confirm("Restaurar a ordem e os textos padrão dos blocos?")) return true;
        d[docKey()].blocks = ed.doc === "contract" ? store.CONTRACT_DEFAULT().blocks : store.PDF_DEFAULT().blocks;
        api.markDirty();
        return api.render();
      case "pdf-color":
        d.pdf.primary = t.dataset.c;
        api.markDirty();
        return api.render();
      case "img-clear":
        setPathPublic(d, t.dataset.path, "");
        api.markDirty();
        return api.render();
      case "sig-clear": {
        const c = document.getElementById("sig-canvas");
        c.getContext("2d").clearRect(0, 0, c.width, c.height);
        return true;
      }
      case "sig-use": {
        const url = trimCanvas(document.getElementById("sig-canvas"));
        if (!url) return api.toast("Desenhe a assinatura primeiro");
        d.pdf.signature = url;
        api.markDirty();
        api.toast("Assinatura aplicada — lembre de salvar");
        return api.render();
      }
      case "pdf-open":
        if (ed.previewUrl) window.open(ed.previewUrl, "_blank");
        return true;
      case "pdf-download": {
        const doc = buildDoc();
        doc.save(`${ed.doc === "contract" ? "contrato" : "orcamento"}-exemplo.pdf`);
        return true;
      }
      default:
        return false;
    }
  }

  function setPathPublic(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  }

  async function onChange(el) {
    if (!el.dataset.img) return false;
    const file = el.files?.[0];
    if (!file) return true;
    try {
      const url = await fileToDataUrl(file, el.dataset.img.endsWith("signature") ? 900 : 700);
      setPathPublic(api.draft(), el.dataset.img, url);
      api.markDirty();
      api.render();
    } catch (error) {
      api.toast(error.message);
    }
    return true;
  }

  WAW.pdfEditor = {
    init: (a) => (api = a),
    render,
    afterRender,
    schedulePreview,
    onClick,
    onChange,
  };
})();
