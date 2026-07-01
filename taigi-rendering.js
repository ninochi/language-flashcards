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
    const quizOptions = document.getElementById("quizOptions");
    if (!deckSelect || !backText || !backLabel || !quizOptions) return;

    const isTaigi = deckSelect.value === TAIGI_DECK_ID;
    const lang = isTaigi ? "nan-Latn" : "zh-CN";
    document.documentElement.dataset.deckLanguage = isTaigi ? "nan-Latn" : "";
    backText.lang = lang;
    backLabel.lang = lang;
    quizOptions.lang = lang;

    if (isTaigi) {
      normalizeElementText(backText);
      normalizeElementText(quizOptions);
    }
  }

  const deckSelect = document.getElementById("deckSelect");
  const backText = document.getElementById("backText");
  const quizOptions = document.getElementById("quizOptions");

  deckSelect?.addEventListener("change", updateTaigiRendering);
  if (backText) {
    new MutationObserver(updateTaigiRendering).observe(backText, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  if (quizOptions) {
    new MutationObserver(updateTaigiRendering).observe(quizOptions, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  updateTaigiRendering();
})();
