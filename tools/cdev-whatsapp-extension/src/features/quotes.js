/* CDEV WhatsApp — orçamento em PDF no WhatsApp.
 * O jsPDF só é carregado quando o primeiro PDF é gerado (injeção sob demanda),
 * para não pesar o WhatsApp. O PDF é anexado na conversa como arquivo (a
 * janela de envio do próprio WhatsApp abre) — nunca é enviado automaticamente. */
(() => {
  const { util: U, store, crm, ui, wa } = WAW;
  let loading = null;

  function ensureLib() {
    if (globalThis.jspdf?.jsPDF && WAW.pdf) return Promise.resolve(true);
    if (!loading) {
      loading = WAW.actions.send({ type: "waw:load-pdf" }).then((r) => {
        loading = null;
        if (!r?.ok || !globalThis.jspdf?.jsPDF) throw new Error(r?.error || "Não foi possível carregar o gerador de PDF");
        return true;
      });
    }
    return loading;
  }

  /** Monta os dados do orçamento a partir do estado do painel. */
  function collect(q, cfg = store.config) {
    const items = [
      ...cfg.catalog.filter((i) => q.selected[i.id]).map((i) => ({ name: i.name, description: i.description, price: Number(i.price) || 0, qty: Number(q.qty[i.id]) || 1 })),
      ...q.extras.filter((e) => e.name && e.price).map((e) => ({ name: e.name, description: "", price: U.parseMoney(e.price), qty: 1 })),
    ];
    const days = Number(q.validity ?? cfg.pdf.validityDays) || 0;
    return {
      date: Date.now(),
      validUntil: days ? Date.now() + days * 86400000 : 0,
      client: { ...(q.client || {}) },
      items,
      discount: U.parseMoney(q.discount),
      notes: String(q.notes || "").trim(),
    };
  }

  const tplFor = (type) => WAW.pdf.template(store.config, type === "contract" ? "contract" : "quote");

  async function makeDoc(data, type = "quote") {
    await ensureLib();
    return WAW.pdf.build(tplFor(type), data);
  }

  function nextNumber() {
    const pdf = store.config.pdf;
    const number = WAW.pdf.quoteNumber(pdf, pdf.nextNumber);
    store.patchConfig((cfg) => (cfg.pdf.nextNumber = (cfg.pdf.nextNumber || 1) + 1));
    return number;
  }

  /** Gera, numera e registra. Retorna { record, doc, file }. */
  async function create(q) {
    const data = collect(q);
    if (!data.items.length) throw new Error("Selecione pelo menos um item");
    await ensureLib();
    data.number = nextNumber();
    const doc = WAW.pdf.build(store.config.pdf, data);
    const totals = WAW.pdf.computeTotals(data);
    const contact = WAW.current.contact;
    const record = {
      id: U.uid("qt"),
      type: "quote",
      number: data.number,
      createdAt: Date.now(),
      contactKey: contact?.key || "",
      clientName: data.client.name || contact?.name || "",
      total: totals.total,
      data,
    };
    store.state.quotes = [record, ...store.state.quotes].slice(0, 300);
    store.persist("quotes", true);
    crm.log("quote", `Orçamento ${data.number} (${U.money(totals.total)}) para ${record.clientName || "cliente"}`, record.contactKey);
    if (contact && store.config.pdf.markProposal) {
      if (crm.statusById("proposta") && contact.statusId !== "proposta") crm.setStatus(contact.key, "proposta");
      crm.addNote(contact.key, `📄 Orçamento ${data.number} — ${U.money(totals.total)}`);
    }
    WAW.emit("quotes", store.state.quotes);
    return { record, doc, file: toFile(doc, data) };
  }

  /** Cláusulas do modelo com variáveis já preenchidas (para edição antes de gerar). */
  async function contractDraft(data) {
    await ensureLib();
    const tpl = tplFor("contract");
    const block = tpl.blocks.find((b) => b.type === "clauses");
    return (block?.clauses || []).map((c) => ({ title: WAW.pdf.fillText(tpl, data, c.title), text: WAW.pdf.fillText(tpl, data, c.text) }));
  }

  async function createContract(data) {
    await ensureLib();
    const c = store.config.contract;
    data.number = WAW.pdf.quoteNumber(c, c.nextNumber);
    store.patchConfig((cfg) => (cfg.contract.nextNumber = (cfg.contract.nextNumber || 1) + 1));
    data.date = Date.now();
    const doc = WAW.pdf.build(tplFor("contract"), data);
    const totals = WAW.pdf.computeTotals(data);
    const contact = WAW.current.contact;
    const record = { id: U.uid("ct"), type: "contract", number: data.number, createdAt: Date.now(), contactKey: contact?.key || "", clientName: data.client?.name || contact?.name || "", total: totals.total, data };
    store.state.quotes = [record, ...store.state.quotes].slice(0, 300);
    store.persist("quotes", true);
    crm.log("contract", `Contrato ${data.number} (${U.money(totals.total)}) para ${record.clientName || "cliente"}`, record.contactKey);
    if (contact) {
      crm.addNote(contact.key, `📝 Contrato ${data.number} — ${U.money(totals.total)}${data.quoteNumber ? ` (ref. ${data.quoteNumber})` : ""}`);
      if (c.markClosed && crm.statusById("fechado")) crm.setStatus(contact.key, "fechado");
    }
    WAW.emit("quotes", store.state.quotes);
    return { record, doc, file: toFile(doc, data) };
  }

  function toFile(doc, data) {
    return new File([doc.output("blob")], WAW.pdf.fileName(store.config.pdf, data), { type: "application/pdf" });
  }

  async function regenerate(record) {
    const doc = await makeDoc(record.data, record.type);
    return { doc, file: toFile(doc, record.data) };
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function preview(doc, name) {
    const r = await WAW.actions.send({ type: "waw:pdf-preview", dataUrl: doc.output("datauristring"), name });
    if (!r?.ok) ui.toast("Não consegui abrir a visualização", { kind: "warn" });
  }

  const previewOpened = (name) => document.body.textContent.includes(name.replace(/\.pdf$/, ""));

  /** Anexa o arquivo na conversa aberta simulando "arrastar e soltar" (não envia). */
  async function attach(file) {
    const main = wa.mainPane();
    if (!main) return { ok: false, reason: "no-chat" };
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = main.querySelector("[data-testid='conversation-panel-wrapper'], [data-testid='conversation-panel-body'], .copyable-area") || main;
    const r = target.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    try {
      for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, init));
    } catch {
      /* DragEvent indisponível */
    }
    for (let i = 0; i < 10; i += 1) {
      await U.sleep(150);
      if (previewOpened(file.name)) return { ok: true, method: "drop" };
    }
    const box = wa.findComposer();
    if (box) {
      box.focus();
      try {
        const dt2 = new DataTransfer();
        dt2.items.add(file);
        box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt2, bubbles: true, cancelable: true }));
      } catch {
        /* ignore */
      }
      for (let i = 0; i < 10; i += 1) {
        await U.sleep(150);
        if (previewOpened(file.name)) return { ok: true, method: "paste" };
      }
    }
    return { ok: false, reason: "not-opened" };
  }

  async function attachOrDownload(file) {
    const r = await attach(file);
    if (r.ok) {
      ui.toast("PDF anexado — confira a janela do WhatsApp e envie você mesmo", { ms: 4200 });
      crm.bump("inserts");
      return true;
    }
    download(file);
    ui.toast(r.reason === "no-chat" ? "Abra uma conversa para anexar — PDF baixado" : "Não consegui anexar automaticamente — PDF baixado, arraste para a conversa", { kind: "warn", ms: 5000 });
    return false;
  }

  WAW.quotes = { ensureLib, collect, create, createContract, contractDraft, regenerate, download, preview, attach, attachOrDownload };
})();
