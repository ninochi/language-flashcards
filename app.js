const DAY = 24 * 60 * 60 * 1000;
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];
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
const retryIds = new Set();

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

function reviewIntervalDays(streak) {
  return REVIEW_INTERVALS[Math.min(Math.max(Number(streak || 1) - 1, 0), REVIEW_INTERVALS.length - 1)];
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

  let migrated = false;
  for (const word of words) {
    const existing = loaded.progress[word.id] || blankProgress();
    if (existing.wrong == null && existing.wrongCount != null) {
      existing.wrong = existing.wrongCount;
      migrated = true;
    }
    existing.mastered = Boolean(existing.mastered);
    existing.wrong = Number(existing.wrong || 0);
    existing.streak = Number(existing.streak || 0);
    existing.due = Number(existing.due || existing.dueAt || 0);

    if (existing.mastered && (!Number.isFinite(existing.due) || existing.due <= 0 || existing.due >= Number.MAX_SAFE_INTEGER)) {
      const effectiveStreak = Math.max(existing.streak, 1);
      existing.streak = effectiveStreak;
      existing.due = Date.now() + reviewIntervalDays(effectiveStreak) * DAY;
      migrated = true;
    }

    loaded.progress[word.id] = existing;
  }

  if ("srs" in loaded || "settings" in loaded) migrated = true;
  delete loaded.srs;
  delete loaded.settings;

  if (migrated) {
    localStorage.setItem(progressKey(), JSON.stringify(loaded));
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
  return !progress.mastered || progress.due <= Date.now();
}

function currentWord() {
  return words.find((word) => word.id === currentId) || null;
}

function setControlsEnabled(enabled) {
  for (const id of ["deckSelect", "shuffleBtn"]) {
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

function renderCardReason(word) {
  const progress = state.progress[word.id] || blankProgress();
  const badge = $("cardBadge");
  const reason = $("cardReason");

  if (retryIds.has(word.id)) {
    badge.textContent = "もう一度";
    badge.dataset.kind = "retry";
    reason.textContent = "先ほど「もう一度」を選んだため再出題しています";
    return;
  }

  if (progress.mastered && progress.due <= Date.now()) {
    const days = reviewIntervalDays(progress.streak);
    badge.textContent = "復習カード";
    badge.dataset.kind = "review";
    reason.textContent = `前回正解から${days}日以上経過したため再出題しています`;
    return;
  }

  if (!progress.mastered && progress.wrong > 0) {
    badge.textContent = "再学習カード";
    badge.dataset.kind = "retry";
    reason.textContent = "以前「もう一度」を選んだカードです";
    return;
  }

  badge.textContent = "新しいカード";
  badge.dataset.kind = "new";
  reason.textContent = "";
}

function updateStats() {
  const values = words.map((word) => state.progress[word.id] || blankProgress());
  $("remainingCount").textContent = String(queue.length + (currentId ? 1 : 0));
  $("masteredCount").textContent = String(values.filter((item) => item.mastered).length);
  $("wrongCount").textContent = String(values.reduce((sum, item) => sum + Number(item.wrong || 0), 0));
  $("totalCount").textContent = String(words.length);
}

function nextReviewDate() {
  const future = words
    .map((word) => state.progress[word.id])
    .filter((item) => item?.mastered && item.due > Date.now() && Number.isFinite(item.due))
    .sort((a, b) => a.due - b.due);
  return future[0]?.due || null;
}

function renderEmpty() {
  $("studyArea").hidden = true;
  $("emptyArea").hidden = false;
  const nextDue = nextReviewDate();
  $("emptyMessage").textContent = nextDue
    ? `次の復習予定は ${new Date(nextDue).toLocaleDateString("ja-JP")} です。`
    : "この教材の学習記録をリセットすると、最初から学習できます。";
}

function resetCardPositionImmediately() {
  const card = $("card");
  card.classList.add("no-transition");
  card.classList.remove("flipped");
  void card.offsetWidth;
}

function restoreCardTransition() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => $("card").classList.remove("no-transition"));
  });
}

function nextCard() {
  resetCardPositionImmediately();
  flipped = false;
  $("againBtn").disabled = true;
  $("knownBtn").disabled = true;
  currentId = queue.shift() || null;

  if (!currentId) {
    restoreCardTransition();
    renderEmpty();
    updateStats();
    return;
  }

  const word = currentWord();
  $("frontText").textContent = word.front;
  renderAnswer(word);
  renderCardReason(word);
  $("studyArea").hidden = false;
  $("emptyArea").hidden = true;
  restoreCardTransition();
  updateStats();
}

function buildQueue() {
  retryIds.clear();
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
  const answeredId = currentId;
  const progress = state.progress[answeredId];
  progress.mastered = false;
  progress.wrong = Number(progress.wrong || 0) + 1;
  progress.streak = 0;
  progress.due = 0;
  retryIds.add(answeredId);
  queue.splice(Math.min(2, queue.length), 0, answeredId);
  saveState();
  nextCard();
}

function answerKnown() {
  if (!currentId || !flipped) return;
  const answeredId = currentId;
  const progress = state.progress[answeredId];
  progress.mastered = true;
  progress.streak = Number(progress.streak || 0) + 1;
  progress.due = Date.now() + reviewIntervalDays(progress.streak) * DAY;
  retryIds.delete(answeredId);
  saveState();
  nextCard();
}

function resetLearningHistory() {
  if (!confirm("この教材の学習記録をリセットしますか？\n単語データは消えません。覚えた状態・誤答回数・復習予定だけが最初に戻ります。")) {
    return;
  }
  state = { progress: {} };
  for (const word of words) state.progress[word.id] = blankProgress();
  saveState();
  buildQueue();
}

function showError(error) {
  console.error(error);
  $("studyArea").hidden = true;
  $("emptyArea").hidden = true;
  $("errorArea").hidden = false;
  $("errorMessage").textContent = "通信状態を確認して、再読み込みしてください。";
  $("subtitle").textContent = "教材の読み込みに失敗しました";
  setControlsEnabled(false);
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
    showError(error);
  }
}

$("deckSelect").addEventListener("change", async (event) => {
  try {
    await selectDeck(event.target.value);
  } catch (error) {
    showError(error);
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
$("resetAllBtn").addEventListener("click", resetLearningHistory);
$("retryBtn").addEventListener("click", init);
document.addEventListener("keydown", (event) => {
  if (!currentId || !flipped) return;
  if (event.key === "1") answerAgain();
  if (event.key === "2") answerKnown();
});

init();
