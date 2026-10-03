/* CDEV WhatsApp — motor do orçamento em PDF (usa jsPDF, vetorial).
 * build(template, data) → jsPDF. Cada bloco do layout é desenhado na ordem
 * configurada, com quebra de página automática. */
(() => {
  const { util: U } = WAW;
  const PT = 0.3528; // mm por ponto

  const rgb = (hex) => {
    const v = U.sanitizeHex(hex, "#000000").slice(1);
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  const mix = (hex, amount) => rgb(hex).map((c) => Math.round(c + (255 - c) * amount)); // clareia

  /** Remove caracteres fora do Latin-1 (fontes padrão do PDF não têm emoji). */
  const safe = (t) =>
    String(t ?? "")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/•/g, "·")
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")
      .trim();

  /* ---------- valor por extenso (pt-BR) ---------- */
  const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const CT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  function ate999(n) {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const c = Math.floor(n / 100);
    const r = n % 100;
    const parts = [];
    if (c) parts.push(CT[c]);
    if (r) parts.push(r < 20 ? UN[r] : DZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ""));
    return parts.join(" e ");
  }
  function inteiroExtenso(n) {
    if (n === 0) return "zero";
    const grupos = [];
    let x = n;
    while (x > 0) {
      grupos.push(x % 1000);
      x = Math.floor(x / 1000);
    }
    const nomes = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
    const partes = [];
    for (let i = grupos.length - 1; i >= 0; i -= 1) {
      const g = grupos[i];
      if (!g) continue;
      let t = i === 1 && g === 1 ? "mil" : `${ate999(g)}${nomes[i][0] ? ` ${g === 1 ? nomes[i][0] : nomes[i][1]}` : ""}`;
      partes.push({ t, g, i });
    }
    return partes
      .map((p, k) => {
        if (k === 0) return p.t;
        const conj = p.i === 0 ? (p.g < 100 || p.g % 100 === 0 ? " e " : " ") : ", ";
        return conj + p.t;
      })
      .join("");
  }
  function extenso(valor) {
    const v = Math.round(Math.abs(Number(valor) || 0) * 100);
    const reais = Math.floor(v / 100);
    const cent = v % 100;
    const parts = [];
    if (reais) {
      const big = reais >= 1000000 && reais % 1000000 === 0;
      parts.push(`${inteiroExtenso(reais)}${big ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
    }
    if (cent) parts.push(`${inteiroExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
    return parts.length ? parts.join(" e ") : "zero real";
  }

  const ORDINAIS = ["PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA", "QUINTA", "SEXTA", "SÉTIMA", "OITAVA", "NONA", "DÉCIMA", "DÉCIMA PRIMEIRA", "DÉCIMA SEGUNDA", "DÉCIMA TERCEIRA", "DÉCIMA QUARTA", "DÉCIMA QUINTA", "DÉCIMA SEXTA", "DÉCIMA SÉTIMA", "DÉCIMA OITAVA", "DÉCIMA NONA", "VIGÉSIMA"];

  /** Modelo efetivo: contrato herda empresa, logo, assinatura e visual do orçamento. */
  function template(config, docType = "quote") {
    if (docType !== "contract") return config.pdf;
    const c = config.contract || {};
    return { ...config.pdf, numberPrefix: c.numberPrefix, nextNumber: c.nextNumber, numberPad: c.numberPad, blocks: c.blocks || [], watermark: "" };
  }

  function quoteNumber(tpl, n) {
    return `${tpl.numberPrefix || ""}${String(n).padStart(tpl.numberPad || 1, "0")}`;
  }

  function computeTotals(data) {
    const subtotal = (data.items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
    const discount = Math.min(subtotal, Math.max(0, Number(data.discount) || 0));
    return { subtotal, discount, total: subtotal - discount };
  }

  function vars(tpl, data) {
    const t = computeTotals(data);
    const cl = data.client || {};
    const co = tpl.company || {};
    const itens = (data.items || [])
      .map((i) => `- ${i.name}${Number(i.qty) > 1 ? ` (${i.qty}x)` : ""}${i.description ? `: ${i.description}` : ""} - ${U.money((Number(i.price) || 0) * (Number(i.qty) || 1))}`)
      .join("\n");
    return {
      clientedoc: cl.doc || "",
      clienteendereco: [cl.address, cl.city].filter(Boolean).join(", "),
      clientetelefone: cl.phone || "",
      clienteemail: cl.email || "",
      itens,
      totalextenso: extenso(t.total),
      cidade: String(co.address || "").split(/[,-]/).map((x) => x.trim()).filter(Boolean).slice(-1)[0] || cl.city || "",
      meudoc: co.doc || "",
      meuendereco: co.address || "",
      orcamento: data.quoteNumber || "",
      cliente: data.client?.name || "",
      nomecompleto: data.client?.name || "",
      nome: WAW.writer?.firstName(data.client?.name) || data.client?.name || "",
      empresa: data.client?.company || "",
      numero: data.number || "",
      data: new Date(data.date || Date.now()).toLocaleDateString("pt-BR"),
      validade: data.validUntil ? new Date(data.validUntil).toLocaleDateString("pt-BR") : "",
      total: U.money(t.total),
      minhaempresa: tpl.company?.name || "",
      meunome: tpl.signerName || "",
      site: tpl.company?.site || "",
      telefone: tpl.company?.phone || "",
      email: tpl.company?.email || "",
    };
  }
  const fill = (text, v) =>
    safe(String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m)))
      .replace(/ ?· ?$/g, "")
      .replace(/^ ?· ?/g, "");

  function build(tplRaw, data) {
    const JsPDF = globalThis.jspdf?.jsPDF;
    if (!JsPDF) throw new Error("jsPDF não carregado");
    const tpl = tplRaw;
    const doc = new JsPDF({ unit: "mm", format: tpl.paper || "a4", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = tpl.margin || 16;
    const CW = W - M * 2;
    const font = tpl.font || "helvetica";
    const C = { primary: rgb(tpl.primary), text: rgb(tpl.text), muted: rgb(tpl.muted), light: mix(tpl.primary, 0.92), soft: [246, 247, 249], line: [226, 229, 234] };
    const V = vars(tpl, data);
    const totals = computeTotals(data);
    const footerBlock = tpl.blocks.find((b) => b.type === "footer" && b.on);
    const bottom = H - M - (footerBlock ? 10 : 0);
    let y = M;

    const setText = (size, style = "normal", color = C.text) => {
      doc.setFont(font, style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };
    const lh = (size) => size * PT * 1.4;
    const ensure = (h) => {
      if (y + h > bottom) {
        doc.addPage();
        y = M;
        return true;
      }
      return false;
    };
    const paragraph = (text, { size = 10, style = "normal", color = C.text, x = M, width = CW, align = "left" } = {}) => {
      setText(size, style, color);
      const lines = doc.splitTextToSize(fill(text, V), width);
      for (const line of lines) {
        ensure(lh(size));
        const tx = align === "center" ? x + width / 2 : align === "right" ? x + width : x;
        doc.text(line, tx, y + size * PT, { align });
        y += lh(size);
      }
    };
    const sectionTitle = (title) => {
      if (!title) return;
      ensure(12);
      setText(9, "bold", C.primary);
      doc.text(fill(title, V).toUpperCase(), M, y + 9 * PT, { charSpace: 0.4 });
      y += 5;
      doc.setDrawColor(...C.primary);
      doc.setLineWidth(0.4);
      doc.line(M, y, M + 14, y);
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.2);
      doc.line(M + 14, y, W - M, y);
      y += 4;
    };
    const image = (dataUrl, x, yy, maxW, maxH) => {
      try {
        const p = doc.getImageProperties(dataUrl);
        let w = maxW;
        let h = (p.height / p.width) * w;
        if (maxH && h > maxH) {
          h = maxH;
          w = (p.width / p.height) * h;
        }
        doc.addImage(dataUrl, dataUrl.includes("image/png") ? "PNG" : "JPEG", x, yy, w, h, undefined, "FAST");
        return { w, h };
      } catch {
        return { w: 0, h: 0 };
      }
    };

    const co = tpl.company || {};
    const companyLines = [co.doc && (co.doc.match(/^\d/) ? `CNPJ/CPF ${co.doc}` : co.doc), co.address, [co.phone, co.email].filter(Boolean).join("  ·  "), co.site].filter(Boolean).map(safe);

    const R = {};

    R.header = (b) => {
      const style = b.style || "classic";
      if (style === "band") {
        const h = 30;
        const top = y <= M ? 0 : y;
        doc.setFillColor(...C.primary);
        doc.rect(0, top, W, h, "F");
        let x = M;
        if (tpl.logo) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(M, top + 5, 20, 20, 3, 3, "F");
          image(tpl.logo, M + 2, top + 7, 16, 16);
          x = M + 25;
        }
        setText(15, "bold", [255, 255, 255]);
        doc.text(safe(co.name || "Sua empresa"), x, top + 13);
        setText(8.5, "normal", [255, 255, 255]);
        companyLines.slice(0, 2).forEach((l, i) => doc.text(l, x, top + 18.5 + i * 4));
        companyLines.slice(2).forEach((l, i) => doc.text(l, W - M, top + 13 + i * 4.5, { align: "right" }));
        y = top + h + 9;
        return;
      }
      if (style === "centered") {
        if (tpl.logo) {
          const im = image(tpl.logo, W / 2 - tpl.logoWidth / 2, y, tpl.logoWidth, 26);
          y += im.h + 4;
        }
        setText(15, "bold", C.text);
        doc.text(safe(co.name || "Sua empresa"), W / 2, y + 5, { align: "center" });
        y += 9;
        setText(8.5, "normal", C.muted);
        companyLines.forEach((l) => {
          doc.text(l, W / 2, y + 3, { align: "center" });
          y += 4.2;
        });
        y += 3;
        doc.setDrawColor(...C.primary);
        doc.setLineWidth(0.8);
        doc.line(M, y, W - M, y);
        y += 8;
        return;
      }
      // classic
      const top = y;
      let logoH = 0;
      let infoX = M;
      if (tpl.logo) {
        const im = image(tpl.logo, M, y, tpl.logoWidth, 24);
        logoH = im.h;
        infoX = M + im.w + 6;
      }
      setText(15, "bold", C.text);
      doc.text(safe(co.name || "Sua empresa"), infoX, top + 6);
      setText(8.5, "normal", C.muted);
      companyLines.forEach((l, i) => doc.text(l, infoX, top + 11.5 + i * 4.2));
      y = Math.max(top + logoH, top + 11.5 + companyLines.length * 4.2) + 3;
      doc.setDrawColor(...C.primary);
      doc.setLineWidth(0.8);
      doc.line(M, y, W - M, y);
      y += 8;
    };

    R.title = (b) => {
      ensure(24);
      const boxW = 62;
      setText(18, "bold", C.primary);
      const titleLines = doc.splitTextToSize(fill(b.text || "PROPOSTA COMERCIAL", V), CW - boxW - 6);
      titleLines.forEach((l, i) => doc.text(l, M, y + 7 + i * 7.5));
      setText(9, "normal", C.muted);
      doc.text(safe(`Emitida em ${V.data}`), M, y + 8 + titleLines.length * 7.5);
      const bx = W - M - boxW;
      doc.setFillColor(...C.light);
      doc.roundedRect(bx, y, boxW, 22, 2, 2, "F");
      const row = (label, value, yy, bold) => {
        setText(8, "normal", C.muted);
        doc.text(label, bx + 4, yy);
        setText(bold ? 11 : 9, "bold", bold ? C.primary : C.text);
        doc.text(safe(value), bx + boxW - 4, yy, { align: "right" });
      };
      row("Nº", data.number || "-", y + 6.5, true);
      row("Data", V.data, y + 12.5);
      if (b.showValidity !== false) row("Válida até", V.validade || "-", y + 18);
      else if (data.quoteNumber) row("Ref. orçamento", data.quoteNumber, y + 18);
      y += Math.max(24, 10 + titleLines.length * 7.5) + 6;
    };

    R.client = (b) => {
      const cl = data.client || {};
      const lines = [
        ["Nome", cl.name],
        ["Empresa", cl.company],
        ["Documento", cl.doc],
        ["Telefone", cl.phone],
        ["E-mail", cl.email],
        ["Cidade", cl.city],
      ].filter(([, v]) => v);
      if (!lines.length) return;
      const rows = Math.ceil(lines.length / 2);
      const h = 10 + rows * 6;
      ensure(h + 4);
      doc.setFillColor(...C.soft);
      doc.setDrawColor(...C.line);
      doc.roundedRect(M, y, CW, h, 2, 2, "FD");
      doc.setFillColor(...C.primary);
      doc.rect(M, y, 1.4, h, "F");
      setText(8, "bold", C.primary);
      doc.text(fill(b.title || "CLIENTE", V).toUpperCase(), M + 5, y + 5.5, { charSpace: 0.4 });
      lines.forEach(([k, v], i) => {
        const col = i % 2;
        const r = Math.floor(i / 2);
        const x = M + 5 + col * (CW / 2);
        const yy = y + 11.5 + r * 6;
        setText(8, "normal", C.muted);
        doc.text(`${k}:`, x, yy);
        setText(9.5, "bold", C.text);
        doc.text(doc.splitTextToSize(safe(v), CW / 2 - 26)[0] || "", x + 18, yy);
      });
      y += h + 7;
    };

    R.intro = (b) => {
      paragraph(b.text, { size: 10 });
      y += 5;
    };

    R.items = (b) => {
      const items = data.items || [];
      sectionTitle(b.title);
      const showQty = b.showQty !== false;
      const showUnit = b.showUnit !== false;
      const cols = [];
      cols.push({ key: "idx", label: "#", w: 9, align: "center" });
      const fixed = (showQty ? 16 : 0) + (showUnit ? 30 : 0) + 32 + 9;
      cols.push({ key: "name", label: "Descrição", w: CW - fixed, align: "left" });
      if (showQty) cols.push({ key: "qty", label: "Qtd.", w: 16, align: "center" });
      if (showUnit) cols.push({ key: "unit", label: "Valor unit.", w: 30, align: "right" });
      cols.push({ key: "sub", label: "Subtotal", w: 32, align: "right" });
      const pad = 2.5;
      const drawHead = () => {
        doc.setFillColor(...C.primary);
        doc.roundedRect(M, y, CW, 8, 1.2, 1.2, "F");
        setText(8.5, "bold", [255, 255, 255]);
        let x = M;
        for (const c of cols) {
          const tx = c.align === "right" ? x + c.w - pad : c.align === "center" ? x + c.w / 2 : x + pad;
          doc.text(c.label, tx, y + 5.3, { align: c.align });
          x += c.w;
        }
        y += 8;
      };
      ensure(18);
      drawHead();
      items.forEach((it, idx) => {
        setText(9.5, "bold", C.text);
        const nameLines = doc.splitTextToSize(safe(it.name), cols[1].w - pad * 2);
        setText(8.3, "normal", C.muted);
        const descLines = b.showDescription !== false && it.description ? doc.splitTextToSize(safe(it.description), cols[1].w - pad * 2) : [];
        const h = 4 + nameLines.length * 4.4 + descLines.length * 3.8 + 1.5;
        if (ensure(h)) drawHead();
        if (b.zebra !== false && idx % 2 === 1) {
          doc.setFillColor(...C.soft);
          doc.rect(M, y, CW, h, "F");
        }
        let x = M;
        const baseY = y + 5.2;
        for (const c of cols) {
          const tx = c.align === "right" ? x + c.w - pad : c.align === "center" ? x + c.w / 2 : x + pad;
          if (c.key === "name") {
            setText(9.5, "bold", C.text);
            nameLines.forEach((l, i) => doc.text(l, tx, baseY + i * 4.4));
            setText(8.3, "normal", C.muted);
            descLines.forEach((l, i) => doc.text(l, tx, baseY + nameLines.length * 4.4 + i * 3.8 - 0.4));
          } else {
            setText(9.5, "normal", C.text);
            const val =
              c.key === "idx" ? String(idx + 1) : c.key === "qty" ? String(it.qty || 1) : c.key === "unit" ? U.money(it.price) : U.money((Number(it.price) || 0) * (Number(it.qty) || 1));
            if (c.key === "sub") setText(9.5, "bold", C.text);
            doc.text(safe(val), tx, baseY, { align: c.align });
          }
          x += c.w;
        }
        y += h;
        doc.setDrawColor(...C.line);
        doc.setLineWidth(0.2);
        doc.line(M, y, W - M, y);
      });
      if (!items.length) {
        setText(9, "normal", C.muted);
        doc.text("Nenhum item selecionado.", M + pad, y + 6);
        y += 9;
      }
      y += 5;
    };

    R.totals = () => {
      const rows = [["Subtotal", U.money(totals.subtotal)]];
      if (totals.discount) rows.push(["Desconto", `- ${U.money(totals.discount)}`]);
      const bw = 78;
      const h = rows.length * 6 + 13;
      ensure(h + 4);
      const bx = W - M - bw;
      rows.forEach(([k, v], i) => {
        setText(9.5, "normal", C.muted);
        doc.text(k, bx + 3, y + 5 + i * 6);
        setText(9.5, "normal", C.text);
        doc.text(safe(v), W - M - 3, y + 5 + i * 6, { align: "right" });
      });
      const ty = y + rows.length * 6 + 1.5;
      doc.setFillColor(...C.primary);
      doc.roundedRect(bx, ty, bw, 11, 1.8, 1.8, "F");
      setText(10, "bold", [255, 255, 255]);
      doc.text("TOTAL", bx + 4, ty + 7.2);
      setText(13, "bold", [255, 255, 255]);
      doc.text(safe(U.money(totals.total)), W - M - 4, ty + 7.6, { align: "right" });
      y += h + 6;
    };

    const textSection = (b) => {
      if (!b.text) return;
      sectionTitle(b.title);
      paragraph(b.text, { size: 9.5 });
      y += 5;
    };
    R.payment = textSection;
    R.terms = (b) => {
      if (!b.text && !data.notes) return;
      sectionTitle(b.title);
      if (data.notes) {
        paragraph(data.notes, { size: 9.5 });
        y += 2;
      }
      if (b.text) paragraph(b.text, { size: 9.5, color: C.muted });
      y += 5;
    };
    R.text = textSection;
    R.divider = () => {
      ensure(6);
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.3);
      doc.line(M, y + 2, W - M, y + 2);
      y += 6;
    };
    R.spacer = (b) => {
      y += Math.min(80, Math.max(1, Number(b.height) || 8));
    };

    R.signature = (b) => {
      const two = Boolean(b.clientAccept);
      const blockH = 48;
      ensure(blockH + (b.dateLine ? 8 : 0));
      if (b.dateLine) {
        setText(9, "normal", C.muted);
        const city = safe(tpl.company?.address?.split(",").slice(-1)[0] || "");
        doc.text(`${city ? `${city}, ` : ""}${new Date(data.date || Date.now()).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.`, two ? M : b.align === "left" ? M : b.align === "right" ? W - M : W / 2, y + 4, {
          align: two ? "left" : b.align || "center",
        });
        y += 10;
      }
      const colW = two ? (CW - 16) / 2 : 80;
      const slots = two
        ? [{ x: M, who: "company" }, { x: M + colW + 16, who: "client" }]
        : [{ x: b.align === "left" ? M : b.align === "right" ? W - M - colW : W / 2 - colW / 2, who: "company" }];
      const lineY = y + 22;
      let maxLines = 1;
      for (const s of slots) {
        if (s.who === "company" && tpl.signature) image(tpl.signature, s.x + colW / 2 - 25, y, 50, 20);
        doc.setDrawColor(...C.text);
        doc.setLineWidth(0.3);
        doc.line(s.x, lineY, s.x + colW, lineY);
        const cx = s.x + colW / 2;
        if (s.who === "company") {
          setText(9.5, "bold", C.text);
          doc.text(safe(tpl.signerName || tpl.company?.name || "Responsável"), cx, lineY + 5, { align: "center" });
          setText(8.3, "normal", C.muted);
          const sub = [b.companyLabel && safe(b.companyLabel).toUpperCase(), tpl.signerRole, tpl.company?.name && tpl.signerName ? tpl.company.name : "", tpl.signerDoc].filter(Boolean).map(safe);
          sub.forEach((l, i) => doc.text(l, cx, lineY + 9.5 + i * 4, { align: "center" }));
          maxLines = Math.max(maxLines, sub.length);
        } else {
          setText(9.5, "bold", C.text);
          doc.text(safe(data.client?.name || "Cliente"), cx, lineY + 5, { align: "center" });
          setText(8.3, "normal", C.muted);
          const subs = b.clientLabel ? [safe(b.clientLabel).toUpperCase(), data.client?.company, data.client?.doc].filter(Boolean).map(safe) : ["De acordo (aceite do cliente)"];
          subs.forEach((l, k) => doc.text(l, cx, lineY + 9.5 + k * 4, { align: "center" }));
          maxLines = Math.max(maxLines, subs.length);
        }
      }
      y = lineY + 10 + maxLines * 4 + 6;
    };

    R.parties = (b) => {
      sectionTitle(b.title);
      const cl = data.client || {};
      const party = (label, name, details) => {
        ensure(14);
        setText(9.5, "bold", C.primary);
        doc.text(label, M, y + 9.5 * PT);
        y += 4.8;
        paragraph([name, ...details].filter(Boolean).join(", "), { size: 9.8 });
        y += 3;
      };
      party(
        "CONTRATANTE",
        safe(cl.company ? `${cl.company}, neste ato representada por ${cl.name}` : cl.name || "________________________"),
        [cl.doc && `inscrita(o) no CPF/CNPJ sob o nº ${safe(cl.doc)}`, (cl.address || cl.city) && `com endereço em ${safe([cl.address, cl.city].filter(Boolean).join(", "))}`, cl.email && `e-mail ${safe(cl.email)}`, cl.phone && `telefone ${safe(cl.phone)}`],
      );
      party(
        "CONTRATADA",
        safe(co.name || "________________________"),
        [co.doc && `inscrita(o) no CPF/CNPJ sob o nº ${safe(co.doc)}`, co.address && `com endereço em ${safe(co.address)}`, tpl.signerName && `neste ato representada por ${safe(tpl.signerName)}${tpl.signerRole ? ` (${safe(tpl.signerRole)})` : ""}`],
      );
      paragraph("As partes acima identificadas têm, entre si, justo e acertado o presente contrato, que se regerá pelas cláusulas seguintes.", { size: 9.8, color: C.muted });
      y += 5;
    };

    R.clauses = (b) => {
      const list = Array.isArray(data.clauses) ? data.clauses : b.clauses || [];
      list.forEach((c, i) => {
        ensure(16);
        setText(9.8, "bold", C.text);
        const head = `CLÁUSULA ${ORDINAIS[i] || `${i + 1}ª`}${c.title ? ` - ${fill(c.title, V).toUpperCase()}` : ""}`;
        doc.splitTextToSize(safe(head), CW).forEach((l) => {
          ensure(lh(9.8));
          doc.text(l, M, y + 9.8 * PT);
          y += lh(9.8);
        });
        y += 1;
        String(c.text || "")
          .split(/\n/)
          .forEach((para) => {
            if (!para.trim()) return;
            paragraph(para, { size: 9.8 });
            y += 1;
          });
        y += 4;
      });
    };

    R.witnesses = (b) => {
      ensure(34);
      setText(8.5, "bold", C.muted);
      doc.text(fill(b.title || "TESTEMUNHAS", V).toUpperCase(), M, y + 3, { charSpace: 0.4 });
      y += 16;
      const colW = (CW - 16) / 2;
      [M, M + colW + 16].forEach((x, i) => {
        doc.setDrawColor(...C.text);
        doc.setLineWidth(0.3);
        doc.line(x, y, x + colW, y);
        setText(8.5, "normal", C.muted);
        doc.text(`${i + 1}. Nome:`, x, y + 4.5);
        doc.text("CPF:", x, y + 9);
      });
      y += 15;
    };

    R.footer = () => {}; // desenhado em todas as páginas no final

    for (const b of tpl.blocks) {
      if (!b.on || !R[b.type]) continue;
      R[b.type](b);
    }

    // Marca d'água e rodapé em todas as páginas.
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      if (tpl.watermark) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.06 }));
          setText(64, "bold", C.primary);
          doc.text(safe(tpl.watermark).toUpperCase(), W / 2, H / 2, { align: "center", angle: 30 });
          doc.restoreGraphicsState();
        } catch {
          /* sem suporte a transparência */
        }
      }
      if (footerBlock) {
        doc.setDrawColor(...C.line);
        doc.setLineWidth(0.2);
        doc.line(M, H - M - 5, W - M, H - M - 5);
        setText(8, "normal", C.muted);
        const ft = fill(footerBlock.text, V);
        if (ft) doc.text(ft, M, H - M);
        if (footerBlock.pageNumbers !== false) doc.text(`Página ${i} de ${pages}`, W - M, H - M, { align: "right" });
      }
    }

    doc.setProperties({ title: `${fill(tpl.blocks.find((b) => b.type === "title")?.text || "Proposta", V)} ${data.number || ""}`.trim(), author: safe(tpl.company?.name || ""), creator: "CDEV WhatsApp" });
    return doc;
  }

  /** Texto com variáveis preenchidas (para pré-preencher cláusulas editáveis). */
  function fillText(tpl, data, text) {
    const v = vars(tpl, data);
    return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m));
  }

  /** Dados de exemplo para a pré-visualização nas configurações. */
  function sampleData(tpl, catalog = []) {
    const items = (catalog.length ? catalog.slice(0, 3) : [
      { name: "Site institucional", description: "Até 5 páginas, responsivo, SEO básico", price: 1500 },
      { name: "Hospedagem (12 meses)", description: "", price: 50 },
    ]).map((i, idx) => ({ name: i.name, description: i.description, price: i.price, qty: idx === 1 ? 12 : 1 }));
    return {
      number: quoteNumber(tpl, tpl.nextNumber || 1),
      date: Date.now(),
      validUntil: Date.now() + (tpl.validityDays || 15) * 86400000,
      client: { name: "João da Silva", company: "Academia Alpha", doc: "98.765.432/0001-10", address: "Av. Brasil, 500", phone: "+55 51 99999-0000", email: "joao@alpha.com.br", city: "Porto Alegre" },
      quoteNumber: "ORC-0007",
      items,
      discount: 100,
      notes: "",
    };
  }

  function fileName(tpl, data) {
    const client = String(data.client?.company || data.client?.name || "cliente")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return `${data.number || "orcamento"}-${client}.pdf`;
  }

  WAW.pdf = { build, sampleData, quoteNumber, computeTotals, fileName, template, fillText, extenso };
})();
