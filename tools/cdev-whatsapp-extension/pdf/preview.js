(async () => {
  const id = location.hash.slice(1);
  const key = `waw:preview:${id}`;
  const data = (await chrome.storage.session.get(key))[key];
  if (!data) {
    document.body.insertAdjacentHTML("beforeend", "<p>Visualização expirada. Gere o documento novamente no WhatsApp.</p>");
    return;
  }
  const blob = await (await fetch(data.dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  document.getElementById("frame").src = url;
  document.getElementById("name").textContent = data.name;
  document.title = data.name;
  const dl = document.getElementById("dl");
  dl.href = url;
  dl.download = data.name;
  chrome.storage.session.remove(key);
})();
