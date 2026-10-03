/* Toca sons quando nenhuma aba do WhatsApp está aberta. */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "waw:offscreen-sound") return;
  WAW.sound.play(msg.kind || "reminder", { force: true, volume: msg.volume });
});
