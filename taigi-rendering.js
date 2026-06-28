(() => {
  const TAIGI_DECK_ID = "taigi";

  function normalizeElementText(element) {
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const normalized = node.nodeValue.normalize("NFC");
        if (normalized !== node.nodeValue) node.nodeValue = normalized;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        normalizeElementText(node);
      }
    }
  }

  function updateTaigiRendering() {
    const deckSelect = document.getElementById("deckSelect");
    const backText = document.getElementById("backText");
    const backLabel = document.getElementById("backLabel");
    if (!deckSelect || !backText || !backLabel) return;

    const isTaigi = deckSelect.value === TAIGI_DECK_ID;
    document.documentElement.dataset.deckLanguage = isTaigi ? "nan-Latn" : "";
    backText.lang = isTaigi ? "nan-Latn" : "zh-CN";
    backLabel.lang = backText.lang;

    if (isTaigi) normalizeElementText(backText);
  }

  const deckSelect = document.getElementById("deckSelect");
  const backText = document.getElementById("backText");

  deckSelect?.addEventListener("change", updateTaigiRendering);
  if (backText) {
    new MutationObserver(updateTaigiRendering).observe(backText, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  updateTaigiRendering();
})();
