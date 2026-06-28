const DAY = 24 * 60 * 60 * 1000;
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];
const UNCERTAIN_REVIEW_DAYS = 1;
const UNKNOWN_REVIEW_DAYS = 1;
const RETRY_REINSERT_DELAY = 8;
const MILESTONE_ADVANCE_DELAY_MS = 900;
const LAST_DECK_KEY = "language-flashcards:last-deck";
const CONFETTI_COLORS = ["#1769aa", "#46a76f", "#f0bf68", "#e06b5f", "#8f7be8"];
const QUEUE_BUCKET = {
  RETRY: 0,
  UNKNOWN_DUE: 1,
  UNSURE_DUE: 2,
  REVIEW_DUE: 3,
  UNSURE_RECENT: 4,
  NEW: 5,
  LONG_UNSEEN: 6,
};
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
  return {
    mastered: false,
    wrong: 0,
    unsure: 0,
    streak: 0,
    due: 0,
    seen: 0,
    lastSeenAt: 0,
    lastResult: null,
    everEasy: false,
    firstEasyAt: 0,
  };
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

function normalizeProgress(savedProgress) {
  const existing = savedProgress && typeof savedProgress === "object" ? savedProgress : blankProgress();
  let migrated = false;

  if (existing.wrong == null && existing.wrongCount != null) {
    existing.wrong = existing.wrongCount;
    migrated = true;
  }
  if (existing.unsure == null && existing.unsureCount != null) {
    existing.unsure = existing.unsureCount;
    migrated = true;
  }
  if (existing.seen == null && existing.seenCount != null) {
    existing.seen = existing.seenCount;
    migrated = true;
  }

  existing.mastered = Boolean(existing.mastered);
  existing.wrong = Number(existing.wrong || 0);
  existing.unsure = Number(existing.unsure || 0);
  existing.streak = Number(existing.streak || 0);
  existing.due = Number(existing.due || existing.dueAt || 0);
  existing.seen = Number(existing.seen || 0);
  existing.lastSeenAt = Number(existing.lastSeenAt || 0);
  existing.firstEasyAt = Number(existing.firstEasyAt || 0);
  existing.everEasy = Boolean(existing.everEasy || existing.mastered);

  if (existing.lastResult == null) {
    const inferredResult = existing.mastered ? "easy" : existing.wrong > 0 ? "unknown" : null;
    if (existing.lastResult !== inferredResult) migrated = true;
    existing.lastResult = inferredResult;
  } else if (!["unknown", "unsure", "easy"].includes(existing.lastResult)) {
    existing.lastResult = null;
    migrated = true;
  }

  if (existing.seen <= 0 && (existing.mastered || existing.wrong > 0 || existing.unsure > 0 || existing.due > 0)) {
    existing.seen = 1;
    migrated = true;
  }

  if (existing.everEasy && existing.firstEasyAt <= 0) {
    existing.firstEasyAt = existing.lastSeenAt || Date.now();
    migrated = true;
  }

  if (existing.mastered && (!Number.isFinite(existing.due) || existing.due <= 0 || existing.due >= Number.MAX_SAFE_INTEGER)) {
    const effectiveStreak = Math.max(existing.streak, 1);
    existing.streak = effectiveStreak;
    existing.due = Date.now() + reviewIntervalDays(effectiveStreak) * DAY;
    migrated = true;
  }

  return { progress: existing, migrated };
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
  loaded.milestones = loaded.milestones && typeof loaded.milestones === "object" ? loaded.milestones : {};

  let migrated = false;
  for (const word of words) {
    const normalized = normalizeProgress(loaded.progress[word.id]);
    if (normalized.migrated) migrated = true;
    loaded.progress[word.id] = normalized.progress;
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

function hasReachedAllSeen() {
  return words.length > 0 && words.every((word) => Number(state.progress[word.id]?.seen || 0) > 0);
}

function hasReachedAllEasy() {
  return words.length > 0 && words.every((word) => Boolean(state.progress[word.id]?.everEasy));
}

function nextMilestoneMessage() {
  state.milestones = state.milestones && typeof state.milestones === "object" ? state.milestones : {};
  const now = Date.now();

  if (!state.milestones.allEasyAt && hasReachedAllEasy()) {
    state.milestones.allEasyAt = now;
    if (!state.milestones.allSeenAt) state.milestones.allSeenAt = now;
    return "全カードを一度すぐ思い出せました";
  }

  if (!state.milestones.allSeenAt && hasReachedAllSeen()) {
    state.milestones.allSeenAt = now;
    return "このデッキを一周しました";
  }

  return null;
}

function launchConfetti(message) {
  const celebration = $("celebration");
  const stage = $("confettiStage");
  $("celebrationMessage").textContent = message;
  stage.replaceChildren();
  celebration.hidden = false;
  celebration.classList.remove("show");
  void celebration.offsetWidth;
  celebration.classList.add("show");

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (let i = 0; i < 36; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${8 + Math.random() * 84}%`;
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = `${Math.random() * 0.18}s`;
      piece.style.setProperty("--fall-x", `${Math.random() * 180 - 90}px`);
      piece.style.setProperty("--spin", `${Math.random() * 540 + 180}deg`);
      stage.append(piece);
    }
  }

  window.setTimeout(() => {
    celebration.classList.remove("show");
    window.setTimeout(() => {
      celebration.hidden = true;
      stage.replaceChildren();
    }, 250);
  }, 2600);
}

function priorityForWord(word) {
  const progress = state.progress[word.id] || blankProgress();
  const now = Date.now();

  if (retryIds.has(word.id)) {
    return { bucket: QUEUE_BUCKET.RETRY, score: 0 };
  }
  if (progress.seen && progress.due <= now) {
    if (progress.lastResult === "unknown") {
      return { bucket: QUEUE_BUCKET.UNKNOWN_DUE, score: progress.due || 0 };
    }
    if (progress.lastResult === "unsure") {
      return { bucket: QUEUE_BUCKET.UNSURE_DUE, score: progress.due || 0 };
    }
    return { bucket: QUEUE_BUCKET.REVIEW_DUE, score: progress.due || 0 };
  }
  if (progress.lastResult === "unsure") {
    return { bucket: QUEUE_BUCKET.UNSURE_RECENT, score: -(progress.lastSeenAt || 0) };
  }
  if (!progress.seen) {
    return { bucket: QUEUE_BUCKET.NEW, score: 0 };
  }
  return { bucket: QUEUE_BUCKET.LONG_UNSEEN, score: progress.lastSeenAt || 0 };
}

function buildPrioritizedQueue() {
  return words
    .map((word) => ({ id: word.id, random: Math.random(), priority: priorityForWord(word) }))
    .sort((a, b) =>
      a.priority.bucket - b.priority.bucket
      || a.priority.score - b.priority.score
      || a.random - b.random
    )
    .map((item) => item.id);
}

function currentWord() {
  return words.find((word) => word.id === currentId) || null;
}

function setControlsEnabled(enabled) {
  for (const id of ["deckSelect", "shuffleBtn"]) {
    $(id).disabled = !enabled;
  }
  for (const button of document.querySelectorAll(".reset-history")) {
    button.disabled = !enabled;
  }
}

function setAnswerControlsEnabled(enabled) {
  for (const id of ["unknownBtn", "unsureBtn", "easyBtn"]) {
    $(id).disabled = !enabled;
  }
}

function updateCardFaceAccessibility() {
  $("cardFront").setAttribute("aria-hidden", String(flipped));
  $("cardBack").setAttribute("aria-hidden", String(!flipped));
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
    badge.textContent = "再挑戦";
    badge.dataset.kind = "retry";
    reason.textContent = "先ほど「分からなかった」を選んだため、間を空けて再出題しています";
    return;
  }

  if (progress.seen && progress.due <= Date.now()) {
    badge.textContent = "復習カード";
    badge.dataset.kind = progress.lastResult === "unknown" ? "retry" : "review";
    if (progress.lastResult === "unsure") {
      reason.textContent = "前回迷ったため短めの間隔で再出題しています";
    } else if (progress.lastResult === "unknown") {
      reason.textContent = "前回分からなかったカードです";
    } else {
      const days = reviewIntervalDays(progress.streak);
      reason.textContent = `前回正解から${days}日以上経過したため再出題しています`;
    }
    return;
  }

  if (progress.lastResult === "unsure") {
    badge.textContent = "迷いカード";
    badge.dataset.kind = "unsure";
    reason.textContent = "前回「迷った」を選んだカードです";
    return;
  }

  if (progress.lastResult === "unknown") {
    badge.textContent = "再学習カード";
    badge.dataset.kind = "retry";
    reason.textContent = "以前「分からなかった」を選んだカードです";
    return;
  }

  if (progress.seen) {
    badge.textContent = "練習カード";
    badge.dataset.kind = "practice";
    reason.textContent = "復習予定前ですが、もう一周として出題しています";
    return;
  }

  badge.textContent = "新しいカード";
  badge.dataset.kind = "new";
  reason.textContent = "";
}

function updateStats() {
  const values = words.map((word) => state.progress[word.id] || blankProgress());
  $("remainingCount").textContent = String(queue.length + (currentId ? 1 : 0));
  $("easyCount").textContent = String(values.filter((item) => item.everEasy).length);
  $("unsureCount").textContent = String(values.filter((item) => item.lastResult === "unsure").length);
  $("totalCount").textContent = String(words.length);
}

function nextReviewDate() {
  const future = words
    .map((word) => state.progress[word.id])
    .filter((item) => item?.seen && item.due > Date.now() && Number.isFinite(item.due))
    .sort((a, b) => a.due - b.due);
  return future[0]?.due || null;
}

function renderEmpty() {
  $("studyArea").hidden = true;
  $("emptyArea").hidden = false;
  const nextDue = nextReviewDate();
  $("emptyMessage").textContent = nextDue
    ? `次の復習予定は ${new Date(nextDue).toLocaleDateString("ja-JP")} です。まだ続けたい場合は、もう一周できます。`
    : "まだ続けたい場合は、出題順を変えてもう一周できます。";
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
  setAnswerControlsEnabled(false);
  updateCardFaceAccessibility();
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
  queue = buildPrioritizedQueue();
  currentId = null;
  nextCard();
}

function flipCard() {
  if (!currentId) return;
  flipped = !flipped;
  $("card").classList.toggle("flipped", flipped);
  setAnswerControlsEnabled(flipped);
  updateCardFaceAccessibility();
}

function answer(result) {
  if (!currentId || !flipped) return;
  const answeredId = currentId;
  const progress = state.progress[answeredId];
  const now = Date.now();

  progress.seen = Number(progress.seen || 0) + 1;
  progress.lastSeenAt = now;
  progress.lastResult = result;

  if (result === "unknown") {
    progress.mastered = false;
    progress.wrong = Number(progress.wrong || 0) + 1;
    progress.streak = 0;
    progress.due = now + UNKNOWN_REVIEW_DAYS * DAY;
    if (queue.length >= RETRY_REINSERT_DELAY) {
      retryIds.add(answeredId);
      queue.splice(RETRY_REINSERT_DELAY, 0, answeredId);
    } else {
      retryIds.delete(answeredId);
    }
  } else if (result === "unsure") {
    progress.mastered = false;
    progress.unsure = Number(progress.unsure || 0) + 1;
    progress.streak = Math.max(Number(progress.streak || 0), 0);
    progress.due = now + UNCERTAIN_REVIEW_DAYS * DAY;
    retryIds.delete(answeredId);
  } else {
    progress.mastered = true;
    progress.everEasy = true;
    if (!progress.firstEasyAt) progress.firstEasyAt = now;
    progress.streak = Number(progress.streak || 0) + 1;
    progress.due = now + reviewIntervalDays(progress.streak) * DAY;
    retryIds.delete(answeredId);
  }

  const milestoneMessage = nextMilestoneMessage();
  saveState();
  updateStats();
  setAnswerControlsEnabled(false);

  if (milestoneMessage) {
    launchConfetti(milestoneMessage);
    window.setTimeout(nextCard, MILESTONE_ADVANCE_DELAY_MS);
  } else {
    nextCard();
  }
}

function resetLearningHistory() {
  if (!confirm("この教材の学習記録をリセットしますか？\n単語データは消えません。回答結果・迷いカード・復習予定だけが最初に戻ります。")) {
    return;
  }
  state = { progress: {} };
  for (const word of words) state.progress[word.id] = blankProgress();
  state.milestones = {};
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
$("unknownBtn").addEventListener("click", () => answer("unknown"));
$("unsureBtn").addEventListener("click", () => answer("unsure"));
$("easyBtn").addEventListener("click", () => answer("easy"));
$("shuffleBtn").addEventListener("click", buildQueue);
$("continueBtn").addEventListener("click", buildQueue);
for (const button of document.querySelectorAll(".reset-history")) {
  button.addEventListener("click", resetLearningHistory);
}
$("retryBtn").addEventListener("click", init);
document.addEventListener("keydown", (event) => {
  if (!currentId || !flipped) return;
  if (event.key === "1") answer("unknown");
  if (event.key === "2") answer("unsure");
  if (event.key === "3") answer("easy");
});

init();
