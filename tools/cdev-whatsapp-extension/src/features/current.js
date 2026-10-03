/* CDEV WhatsApp — detecção do contato da conversa aberta. */
(() => {
  const { util: U, wa, crm, store } = WAW;

  // WAW.current = { info, key, contact, ambiguous }
  WAW.current = { info: null, key: "", contact: null, ambiguous: false };
  let lastSig = "";

  function refresh(force = false) {
    const info = wa.currentChat();
    const sig = info ? `${info.name}|${info.jid}` : "";
    if (!force && sig === lastSig) {
      // Mesmo chat: apenas atualiza os tempos observados (barato).
      if (WAW.current.contact && store.config.features.trackMessages) {
        crm.recordMessageTimes(WAW.current.contact.key, wa.messageTimes());
      }
      return;
    }
    const prevName = lastSig.split("|")[0];
    lastSig = sig;
    if (!info) {
      WAW.current = { info: null, key: "", contact: null, ambiguous: false };
      WAW.emit("current", WAW.current);
      return;
    }
    const res = crm.ensureForChat(info);
    WAW.current = { info, key: res.contact?.key || "", contact: res.contact || null, ambiguous: Boolean(res.ambiguous), weak: !info.jid };
    // Só conta como "aberto" quando o nome muda (não quando o JID aparece depois).
    if (res.contact && info.name !== prevName) crm.markOpened(res.contact);
    if (res.contact && store.config.features.trackMessages) crm.recordMessageTimes(res.contact.key, wa.messageTimes());
    U.log("conversa atual", { name: info.name, jid: info.jid || "(sem id)", ambiguous: res.ambiguous });
    WAW.emit("current", WAW.current);
  }

  // Se o contato atual for alterado (painel/opções), mantém a referência fresca.
  WAW.on("contacts", () => {
    if (WAW.current.key) {
      WAW.current.contact = crm.get(WAW.current.key);
      if (!WAW.current.contact) refresh(true);
    }
  });

  /** Garante um contato atual ou avisa. */
  function require() {
    if (WAW.current.contact) return WAW.current.contact;
    if (WAW.current.ambiguous) {
      WAW.ui.toast("Há mais de um contato com esse nome. Role a conversa até aparecer uma mensagem para identificá-lo.", { kind: "warn", ms: 4200 });
    } else {
      WAW.ui.toast("Abra uma conversa primeiro", { kind: "warn" });
    }
    return null;
  }

  WAW.currentChat = { refresh, require };
})();
