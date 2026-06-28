const DAY = 24 * 60 * 60 * 1000;
const LAST_DECK_KEY = "language-flashcards:last-deck";
const $ = (id) => document.getElementById(id);

let manifest = null;
let deckMeta = null;
let deck = null;
let words = [];
let state = null;
let queue = [];
let currentId = null;
let flipped = false;

function blankProgress() {
  return { mastered: false, wrong: 0, streak: 0, due: 0 };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function progressKey() {
  return `language-flashcards:${deckMeta.storageKey}:v1`;
}

function loadState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(progressKey()));
  } catch (error) {
    console.warn("学習履歴を読み込めませんでした。", error);
  }

  const loaded = saved && typeof saved === "object" ? saved : {};
  loaded.progress = loaded.progress && typeof loaded.progress === "object" ? loaded.progress : {};
  loaded.srs = Boolean(loaded.srs ?? loaded.settings?.srs ?? false);

  for (const word of words) {
    const existing = loaded.progress[word.id] || blankProgress();
    if (existing.wrong == null && existing.wrongCount != null) existing.wrong = existing.wrongCount;
    existing.mastered = Boolean(existing.mastered);
    existing.wrong = Number(existing.wrong || 0);
    existing.streak = Number(existing.streak || 0);
    existing.due = Number(existing.due || existing.dueAt || 0);
    loaded.progress[word.id] = existing;
  }
  return loaded;
}

function saveState() {
  localStorage.setItem(progressKey(), JSON.stringify(state));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function eligible(word) {
  const progress = state.progress[word.id] || blankProgress();
  return !progress.mastered || (state.srs && progress.due <= Date.now());
}

function currentWord() {
  return words.find((word) => word.id === currentId) || null;
}

function setControlsEnabled(enabled) {
  for (const id of ["deckSelect", "srsToggle", "shuffleBtn", "resetSessionBtn", "resetAllBtn"]) {
    $(id).disabled = !enabled;
  }
}

function renderAnswer(word) {
  const container = $("backText");
  container.replaceChildren();
  container.append(document.createTextNode(word.back));
  if (word.reading) {
    const reading = document.createElement("small");
    reading.textContent = word.reading;
    container.append(reading);
  }
}

function updateStats() {
  const values = words.map((word) => state.progress[word.id] || blankProgress());
  $("remainingCount").textContent = String(queue.length + (currentId ? 1 : 0));
  $("masteredCount").textContent = String(values.filter((item) => item.mastered).length);
  $("wrongCount").textContent = String(values.reduce((sum, item) => sum + Number(item.wrong || 0), 0));
  $("totalCount").textContent = String(words.length);
}

function renderEmpty() {
  $("studyArea").hidden = true;
  $("emptyArea").hidden = false;
  const future = words
    .map((word) => state.progress[word.id])
    .filter((item) => item?.mastered && item.due > Date.now() && item.due < Number.MAX_SAFE_INTEGER)
    .sort((a, b) => a.due - b.due);
  $("emptyMessage").textContent = state.srs && future.length
    ? `復習対象は現在ありません。次の復習予定は ${new Date(future[0].due).toLocaleDateString("ja-JP")} です。`
    : "未習得の単語はありません。";
}

function nextCard() {
  flipped = false;
  $("card").classList.remove("flipped");
  $("againBtn").disabled = true;
  $("knownBtn").disabled = true;
  currentId = queue.shift() || null;

  if (!currentId) {
    renderEmpty();
    updateStats();
    return;
  }

  const word = currentWord();
  $("frontText").textContent = word.front;
  renderAnswer(word);
  $("studyArea").hidden = false;
  $("emptyArea").hidden = true;
  updateStats();
}

function buildQueue() {
  queue = shuffle(words.filter(eligible).map((word) => word.id));
  currentId = null;
  nextCard();
}

function flipCard() {
  if (!currentId) return;
  flipped = !flipped;
  $("card").classList.toggle("flipped", flipped);
  $("againBtn").disabled = !flipped;
  $("knownBtn").disabled = !flipped;
}

function answerAgain() {
  if (!currentId || !flipped) return;
  const progress = state.progress[currentId];
  progress.mastered = false;
  progress.wrong = Number(progress.wrong || 0) + 1;
  progress.streak = 0;
  progress.due = 0;
  queue.splice(Math.min(2, queue.length), 0, currentId);
  saveState();
  nextCard();
}

function answerKnown() {
  if (!currentId || !flipped) return;
  const progress = state.progress[currentId];
  progress.mastered = true;
  progress.streak = Number(progress.streak || 0) + 1;
  const intervals = [1, 3, 7, 14, 30, 60];
  progress.due = state.srs
    ? Date.now() + intervals[Math.min(progress.streak - 1, intervals.length - 1)] * DAY
    : Number.MAX_SAFE_INTEGER;
  saveState();
  nextCard();
}

async function selectDeck(id) {
  setControlsEnabled(false);
  $("studyArea").hidden = true;
  $("emptyArea").hidden = true;
  $("errorArea").hidden = true;
  $("subtitle").textContent = "教材を読み込んでいます…";

  deckMeta = manifest.decks.find((item) => item.id === id);
  if (!deckMeta) throw new Error(`Unknown deck: ${id}`);
  deck = await fetchJson(`data/${deckMeta.file}`);
  if (deck.cardCount !== deck.cards.length) throw new Error(`${deck.title}: cardCountが一致しません`);
  words = deck.cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    reading: card.reading,
  }));
  state = loadState();
  localStorage.setItem(LAST_DECK_KEY, deckMeta.id);
  $("subtitle").textContent = deckMeta.subtitle;
  $("backLabel").textContent = deckMeta.backLabel;
  $("srsToggle").checked = state.srs;
  setControlsEnabled(true);
  buildQueue();
}

async function init() {
  try {
    manifest = await fetchJson("data/manifest.json");
    const select = $("deckSelect");
    select.replaceChildren();
    for (const item of [...manifest.decks].sort((a, b) => a.order - b.order)) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.title;
      select.append(option);
    }

    const remembered = localStorage.getItem(LAST_DECK_KEY);
    const initial = manifest.decks.find((item) => item.id === remembered || item.storageKey === remembered)
      || manifest.decks[0];
    select.value = initial.id;
    await selectDeck(initial.id);
  } catch (error) {
    console.error(error);
    $("studyArea").hidden = true;
    $("emptyArea").hidden = true;
    $("errorArea").hidden = false;
    $("errorMessage").textContent = error.message;
    $("subtitle").textContent = "読み込みエラー";
    setControlsEnabled(false);
  }
}

$("deckSelect").addEventListener("change", async (event) => {
  try {
    await selectDeck(event.target.value);
  } catch (error) {
    console.error(error);
    $("errorArea").hidden = false;
    $("errorMessage").textContent = error.message;
  }
});
$("card").addEventListener("click", flipCard);
$("card").addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    flipCard();
  }
});
$("againBtn").addEventListener("click", answerAgain);
$("knownBtn").addEventListener("click", answerKnown);
$("shuffleBtn").addEventListener("click", buildQueue);
$("restartBtn").addEventListener("click", buildQueue);
$("resetSessionBtn").addEventListener("click", buildQueue);
$("resetAllBtn").addEventListener("click", () => {
  if (!confirm("この教材の学習履歴を初期化しますか？")) return;
  state = { progress: {}, srs: state.srs };
  for (const word of words) state.progress[word.id] = blankProgress();
  saveState();
  buildQueue();
});
$("srsToggle").addEventListener("change", (event) => {
  state.srs = event.target.checked;
  saveState();
  buildQueue();
});
$("retryBtn").addEventListener("click", init);
document.addEventListener("keydown", (event) => {
  if (!currentId || !flipped) return;
  if (event.key === "1") answerAgain();
  if (event.key === "2") answerKnown();
});

init();
