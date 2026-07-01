const LAST_DECK_KEY = "language-flashcards:last-deck";
const STORAGE_VERSION = 3;
const MILESTONE_ADVANCE_DELAY_MS = 900;
const CONFETTI_COLORS = ["#1769aa", "#46a76f", "#f0bf68", "#e06b5f", "#8f7be8"];
const MODES = {
  ALL: "all",
  UNKNOWN: "unknown",
  QUIZ: "quiz",
};
const $ = (id) => document.getElementById(id);

let manifest = null;
let deckMeta = null;
let deck = null;
let words = [];
let state = null;
let mode = MODES.ALL;
let queue = [];
let currentId = null;
let currentQuiz = null;
let flipped = false;
let celebrationRun = 0;

function blankState() {
  return {
    version: STORAGE_VERSION,
    unknownIds: [],
    seenIds: [],
    quizWrongIds: [],
  };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function progressKey() {
  return `language-flashcards:${deckMeta.storageKey}:v${STORAGE_VERSION}`;
}

function uniqueKnownIds(ids) {
  const validIds = new Set(words.map((word) => word.id));
  return [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => validIds.has(id));
}

function loadState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(progressKey()));
  } catch (error) {
    console.warn("学習履歴を読み込めませんでした。", error);
  }

  const loaded = saved && typeof saved === "object" ? saved : blankState();
  return {
    version: STORAGE_VERSION,
    unknownIds: uniqueKnownIds(loaded.unknownIds),
    seenIds: uniqueKnownIds(loaded.seenIds),
    quizWrongIds: uniqueKnownIds(loaded.quizWrongIds),
  };
}

function saveState() {
  localStorage.setItem(progressKey(), JSON.stringify(state));
}

function shuffle(items) {
  return [...items]
    .map((item) => ({ item, random: Math.random() }))
    .sort((a, b) => a.random - b.random)
    .map(({ item }) => item);
}

function wordById(id) {
  return words.find((word) => word.id === id) || null;
}

function idsForUnknownMode() {
  return state.unknownIds.filter((id) => wordById(id));
}

function isUnknown(id) {
  return state.unknownIds.includes(id);
}

function setIdMembership(key, id, enabled) {
  const ids = new Set(state[key]);
  if (enabled) ids.add(id);
  else ids.delete(id);
  state[key] = [...ids].filter((itemId) => wordById(itemId));
}

function markSeen(id) {
  setIdMembership("seenIds", id, true);
}

function choiceLabel(word) {
  return word.reading ? `${word.back} / ${word.reading}` : word.back;
}

function quizMixInterval() {
  if (words.length <= 30) return 2;
  if (words.length <= 80) return 3;
  return 4;
}

function interleaveMarkedIds(markedIds, otherIds) {
  if (!markedIds.length || !otherIds.length) return [...markedIds, ...otherIds];

  const mixed = [];
  const batchSize = quizMixInterval();
  let markedIndex = 0;
  let otherIndex = 0;

  while (markedIndex < markedIds.length || otherIndex < otherIds.length) {
    for (let i = 0; i < batchSize && markedIndex < markedIds.length; i += 1) {
      mixed.push(markedIds[markedIndex]);
      markedIndex += 1;
    }
    if (otherIndex < otherIds.length) {
      mixed.push(otherIds[otherIndex]);
      otherIndex += 1;
    }
    if (markedIndex >= markedIds.length) {
      mixed.push(...otherIds.slice(otherIndex));
      break;
    }
    if (otherIndex >= otherIds.length) {
      mixed.push(...markedIds.slice(markedIndex));
      break;
    }
  }

  return mixed;
}

function buildCardQueue(nextMode) {
  if (nextMode === MODES.UNKNOWN) return shuffle(idsForUnknownMode());
  const marked = shuffle(idsForUnknownMode());
  const rest = shuffle(words.map((word) => word.id).filter((id) => !state.unknownIds.includes(id)));
  return interleaveMarkedIds(marked, rest);
}

function buildQuizQueue() {
  const wrong = shuffle(state.quizWrongIds.filter((id) => wordById(id)));
  const rest = shuffle(words.map((word) => word.id).filter((id) => !state.quizWrongIds.includes(id)));
  return interleaveMarkedIds(wrong, rest);
}

function setControlsEnabled(enabled) {
  $("deckSelect").disabled = !enabled;
  $("shuffleBtn").disabled = !enabled;
  for (const button of document.querySelectorAll(".reset-history")) {
    button.disabled = !enabled;
  }
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.disabled = !enabled;
  }
}

function setAnswerControlsEnabled(enabled) {
  for (const id of ["unknownBtn", "knownBtn"]) {
    $(id).disabled = !enabled;
  }
}

function updateModeButtons() {
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.classList.toggle("active", button.dataset.mode === mode);
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
  const badge = $("cardBadge");
  const reason = $("cardReason");

  if (isUnknown(word.id)) {
    badge.textContent = "分からなかった";
    badge.dataset.kind = "retry";
    reason.textContent = "分からなかったリストに入っています";
    return;
  }

  if (state.seenIds.includes(word.id)) {
    badge.textContent = "確認済み";
    badge.dataset.kind = "practice";
    reason.textContent = "";
    return;
  }

  badge.textContent = "未確認";
  badge.dataset.kind = "new";
  reason.textContent = "";
}

function updateStats(includeCurrent = Boolean(currentId || currentQuiz)) {
  $("remainingCount").textContent = String(queue.length + (includeCurrent ? 1 : 0));
  $("unknownCount").textContent = String(state.unknownIds.length);
  $("quizWrongCount").textContent = String(state.quizWrongIds.length);
  $("totalCount").textContent = String(words.length);
}

function launchConfetti(message) {
  celebrationRun += 1;
  const currentRun = celebrationRun;
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
    if (currentRun !== celebrationRun) return;
    celebration.classList.remove("show");
    window.setTimeout(() => {
      if (currentRun !== celebrationRun) return;
      celebration.hidden = true;
      stage.replaceChildren();
    }, 250);
  }, 2600);
}

function hideCelebration() {
  celebrationRun += 1;
  const celebration = $("celebration");
  celebration.classList.remove("show");
  celebration.hidden = true;
  $("confettiStage").replaceChildren();
  $("celebrationMessage").textContent = "";
}

function maybeCelebrateUnknownClear(previousUnknownCount) {
  if (previousUnknownCount > 0 && state.unknownIds.length === 0) {
    launchConfetti("分からなかったカードがゼロになりました");
    return true;
  }
  return false;
}

function hideAllStudySurfaces() {
  $("studyArea").hidden = true;
  $("quizArea").hidden = true;
  $("emptyArea").hidden = true;
}

function renderEmpty(title, message) {
  $("studyArea").hidden = true;
  $("quizArea").hidden = true;
  $("emptyArea").hidden = false;
  $("emptyTitle").textContent = title;
  $("emptyMessage").textContent = message;
  updateStats(false);
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
  currentQuiz = null;
  resetCardPositionImmediately();
  flipped = false;
  setAnswerControlsEnabled(false);
  updateCardFaceAccessibility();
  currentId = queue.shift() || null;

  if (!currentId) {
    restoreCardTransition();
    if (mode === MODES.UNKNOWN) {
      renderEmpty(
        "分からなかったカードはありません",
        state.unknownIds.length
          ? "この回の分からなかったカードを一通り見ました。続ける場合はもう一度回せます。"
          : "分からなかったカードはゼロです。"
      );
    } else {
      renderEmpty("この回のカードを一通り見ました", "まだ続けたい場合は、同じモードでもう一周できます。");
    }
    return;
  }

  const word = wordById(currentId);
  $("frontText").textContent = word.front;
  renderAnswer(word);
  renderCardReason(word);
  $("studyArea").hidden = false;
  $("quizArea").hidden = true;
  $("emptyArea").hidden = true;
  restoreCardTransition();
  updateStats();
}

function startCardMode(nextMode) {
  hideCelebration();
  mode = nextMode;
  updateModeButtons();
  queue = buildCardQueue(mode);
  currentId = null;
  currentQuiz = null;
  nextCard();
}

function flipCard() {
  if (!currentId || mode === MODES.QUIZ) return;
  flipped = !flipped;
  $("card").classList.toggle("flipped", flipped);
  setAnswerControlsEnabled(flipped);
  updateCardFaceAccessibility();
}

function answerCard(result) {
  if (!currentId || !flipped) return;
  const answeredId = currentId;
  const previousUnknownCount = state.unknownIds.length;
  markSeen(answeredId);

  if (result === "unknown") {
    setIdMembership("unknownIds", answeredId, true);
    if (mode === MODES.UNKNOWN && !queue.includes(answeredId)) queue.push(answeredId);
  } else {
    setIdMembership("unknownIds", answeredId, false);
  }

  saveState();
  updateStats(false);
  setAnswerControlsEnabled(false);

  if (maybeCelebrateUnknownClear(previousUnknownCount)) {
    window.setTimeout(nextCard, MILESTONE_ADVANCE_DELAY_MS);
  } else {
    nextCard();
  }
}

function createQuizForWord(word) {
  const usedLabels = new Set([choiceLabel(word)]);
  const distractors = [];
  for (const candidate of shuffle(words.filter((item) => item.id !== word.id))) {
    const label = choiceLabel(candidate);
    if (usedLabels.has(label)) continue;
    usedLabels.add(label);
    distractors.push({ id: candidate.id, label });
    if (distractors.length >= 3) break;
  }

  return {
    word,
    choices: shuffle([{ id: word.id, label: choiceLabel(word) }, ...distractors]),
    answered: false,
  };
}

function renderQuiz() {
  currentId = null;
  const nextId = queue.shift() || null;
  if (!nextId) {
    currentQuiz = null;
    renderEmpty("クイズを一通り解きました", "もう一度解く場合はクイズモードを続けられます。");
    return;
  }

  currentQuiz = createQuizForWord(wordById(nextId));
  const isWrong = state.quizWrongIds.includes(nextId);
  $("quizBadge").textContent = isWrong ? "前回間違えた問題" : "クイズ";
  $("quizBadge").dataset.kind = isWrong ? "retry" : "new";
  $("quizReason").textContent = isWrong ? "前回のクイズで間違えた問題です" : "";
  $("quizPrompt").textContent = currentQuiz.word.front;
  $("quizFeedback").textContent = "";
  $("quizFeedback").dataset.kind = "";
  $("quizNextBtn").hidden = true;

  const optionContainer = $("quizOptions");
  optionContainer.replaceChildren();
  for (const choice of currentQuiz.choices) {
    const button = document.createElement("button");
    button.className = "quiz-option";
    button.type = "button";
    button.textContent = choice.label;
    button.addEventListener("click", () => answerQuiz(choice.id, button));
    optionContainer.append(button);
  }

  $("studyArea").hidden = true;
  $("quizArea").hidden = false;
  $("emptyArea").hidden = true;
  updateStats();
}

function startQuizMode() {
  hideCelebration();
  mode = MODES.QUIZ;
  updateModeButtons();
  queue = buildQuizQueue();
  currentId = null;
  renderQuiz();
}

function answerQuiz(selectedId, selectedButton) {
  if (!currentQuiz || currentQuiz.answered) return;
  currentQuiz.answered = true;
  const correctId = currentQuiz.word.id;
  const isCorrect = selectedId === correctId;

  if (isCorrect) {
    setIdMembership("quizWrongIds", correctId, false);
    $("quizFeedback").textContent = "正解";
    $("quizFeedback").dataset.kind = "correct";
  } else {
    setIdMembership("quizWrongIds", correctId, true);
    $("quizFeedback").textContent = `不正解。正解は ${choiceLabel(currentQuiz.word)} です。`;
    $("quizFeedback").dataset.kind = "wrong";
  }

  for (const button of $("quizOptions").querySelectorAll("button")) {
    button.disabled = true;
    const choice = currentQuiz.choices.find((item) => item.label === button.textContent);
    if (choice?.id === correctId) button.classList.add("correct");
  }
  if (!isCorrect) selectedButton.classList.add("wrong");

  saveState();
  updateStats();
  $("quizNextBtn").hidden = false;
}

function rebuildCurrentMode() {
  if (mode === MODES.QUIZ) startQuizMode();
  else startCardMode(mode);
}

function resetLearningHistory() {
  if (!confirm("この教材の学習記録をリセットしますか？\n単語データは消えません。分からなかったカードとクイズ履歴だけが最初に戻ります。")) {
    return;
  }
  hideCelebration();
  state = blankState();
  saveState();
  rebuildCurrentMode();
}

function showError(error) {
  console.error(error);
  hideAllStudySurfaces();
  $("errorArea").hidden = false;
  $("errorMessage").textContent = "通信状態を確認して、再読み込みしてください。";
  $("subtitle").textContent = "教材の読み込みに失敗しました";
  setControlsEnabled(false);
}

async function selectDeck(id) {
  hideCelebration();
  setControlsEnabled(false);
  hideAllStudySurfaces();
  $("errorArea").hidden = true;
  $("subtitle").textContent = "教材を読み込んでいます...";

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
  rebuildCurrentMode();
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
$("unknownBtn").addEventListener("click", () => answerCard("unknown"));
$("knownBtn").addEventListener("click", () => answerCard("known"));
$("shuffleBtn").addEventListener("click", rebuildCurrentMode);
$("continueBtn").addEventListener("click", rebuildCurrentMode);
$("emptyUnknownBtn").addEventListener("click", () => startCardMode(MODES.UNKNOWN));
$("emptyQuizBtn").addEventListener("click", startQuizMode);
$("quizNextBtn").addEventListener("click", renderQuiz);
$("retryBtn").addEventListener("click", init);
for (const button of document.querySelectorAll(".reset-history")) {
  button.addEventListener("click", resetLearningHistory);
}
for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => {
    if (button.dataset.mode === MODES.QUIZ) startQuizMode();
    else startCardMode(button.dataset.mode);
  });
}
document.addEventListener("keydown", (event) => {
  if (mode !== MODES.QUIZ && currentId && flipped) {
    if (event.key === "1") answerCard("unknown");
    if (event.key === "2") answerCard("known");
  }
});

init();
