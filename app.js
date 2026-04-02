const STORAGE_KEY = "uscg-service-wide-study-app-state-v1";
const QUESTION_BANK_PATH = "./data/questions.json";

// App state is intentionally flat and simple so the question bank
// and saved progress are easy to modify later without a framework.
const state = {
  allQuestions: [],
  filteredQuestionIds: [],
  currentFilteredIndex: 0,
  mode: "study",
  category: "all",
  missedOnly: false,
  reviewOnly: false,
  quizSubmitted: false,
  answers: {},
  currentSelections: {},
  flags: {},
  questionOrder: [],
  loadedFromSave: false
};

const el = {
  resumeBtn: document.getElementById("resumeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  studyModeBtn: document.getElementById("studyModeBtn"),
  quizModeBtn: document.getElementById("quizModeBtn"),
  categoryFilter: document.getElementById("categoryFilter"),
  missedOnlyFilter: document.getElementById("missedOnlyFilter"),
  reviewOnlyFilter: document.getElementById("reviewOnlyFilter"),
  questionCounter: document.getElementById("questionCounter"),
  coveragePercent: document.getElementById("coveragePercent"),
  progressFill: document.getElementById("progressFill"),
  totalQuestionsStat: document.getElementById("totalQuestionsStat"),
  completedStat: document.getElementById("completedStat"),
  correctStat: document.getElementById("correctStat"),
  incorrectStat: document.getElementById("incorrectStat"),
  scoreStat: document.getElementById("scoreStat"),
  markKnowBtn: document.getElementById("markKnowBtn"),
  markReviewBtn: document.getElementById("markReviewBtn"),
  statusBanner: document.getElementById("statusBanner"),
  questionCategory: document.getElementById("questionCategory"),
  questionText: document.getElementById("questionText"),
  choicesContainer: document.getElementById("choicesContainer"),
  feedbackBox: document.getElementById("feedbackBox"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishQuizBtn: document.getElementById("finishQuizBtn"),
  knowWellList: document.getElementById("knowWellList"),
  needWorkList: document.getElementById("needWorkList"),
  missedList: document.getElementById("missedList"),
  weakCategoriesList: document.getElementById("weakCategoriesList")
};

async function init() {
  bindEvents();

  try {
    // Load the editable JSON bank from /data/questions.json.
    const response = await fetch(QUESTION_BANK_PATH);
    if (!response.ok) {
      throw new Error(`Could not load ${QUESTION_BANK_PATH}`);
    }

    const questions = await response.json();
    validateQuestionBank(questions);

    state.allQuestions = questions;
    state.questionOrder = questions.map((question) => question.id);

    populateCategoryFilter();
    hydrateFromLocalStorage();
    rebuildFilteredQuestions();
    renderAll();
  } catch (error) {
    showStatus(
      "Could not load the question bank. Make sure the app is being served from a local web server and that data/questions.json exists.",
      "warning"
    );
    el.questionText.textContent = "Question bank could not be loaded.";
    console.error(error);
  }
}

function bindEvents() {
  el.studyModeBtn.addEventListener("click", () => setMode("study"));
  el.quizModeBtn.addEventListener("click", () => setMode("quiz"));
  el.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    state.currentFilteredIndex = 0;
    rebuildFilteredQuestions();
    saveState();
    renderAll();
  });
  el.missedOnlyFilter.addEventListener("change", (event) => {
    state.missedOnly = event.target.checked;
    state.currentFilteredIndex = 0;
    rebuildFilteredQuestions();
    saveState();
    renderAll();
  });
  el.reviewOnlyFilter.addEventListener("change", (event) => {
    state.reviewOnly = event.target.checked;
    state.currentFilteredIndex = 0;
    rebuildFilteredQuestions();
    saveState();
    renderAll();
  });
  el.prevBtn.addEventListener("click", () => moveQuestion(-1));
  el.nextBtn.addEventListener("click", () => moveQuestion(1));
  el.finishQuizBtn.addEventListener("click", finishQuizAndRefreshSummary);
  el.resetBtn.addEventListener("click", resetProgress);
  el.resumeBtn.addEventListener("click", resumeSavedState);
  el.markKnowBtn.addEventListener("click", () => toggleFlag("know"));
  el.markReviewBtn.addEventListener("click", () => toggleFlag("review"));
}

function validateQuestionBank(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Question bank must be a non-empty array.");
  }

  questions.forEach((question, index) => {
    const hasRequiredFields =
      question.id !== undefined &&
      typeof question.question === "string" &&
      Array.isArray(question.choices) &&
      question.choices.length > 1 &&
      typeof question.correctAnswer === "string";

    if (!hasRequiredFields) {
      throw new Error(`Question at index ${index} is missing required fields.`);
    }
  });
}

function populateCategoryFilter() {
  const categories = [...new Set(state.allQuestions.map((question) => question.category).filter(Boolean))];

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    el.categoryFilter.appendChild(option);
  });
}

function hydrateFromLocalStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    showStatus("Fresh session loaded. Replace data/questions.json with your full question bank when ready.", "info");
    return;
  }

  try {
    const parsed = JSON.parse(saved);

    state.mode = parsed.mode || "study";
    state.category = parsed.category || "all";
    state.missedOnly = Boolean(parsed.missedOnly);
    state.reviewOnly = Boolean(parsed.reviewOnly);
    state.quizSubmitted = Boolean(parsed.quizSubmitted);
    state.answers = parsed.answers || {};
    state.currentSelections = parsed.currentSelections || {};
    state.flags = parsed.flags || {};
    state.currentFilteredIndex = Number.isInteger(parsed.currentFilteredIndex) ? parsed.currentFilteredIndex : 0;
    state.loadedFromSave = true;

    el.categoryFilter.value = state.category;
    el.missedOnlyFilter.checked = state.missedOnly;
    el.reviewOnlyFilter.checked = state.reviewOnly;

    updateModeButtons();
    showStatus("Saved session found. You can continue where you left off or restart progress.", "success");
  } catch (error) {
    console.error(error);
    showStatus("Saved progress could not be restored, so a new session was started.", "warning");
  }
}

function saveState() {
  // localStorage keeps progress, filters, and flags between sessions.
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      mode: state.mode,
      category: state.category,
      missedOnly: state.missedOnly,
      reviewOnly: state.reviewOnly,
      quizSubmitted: state.quizSubmitted,
      answers: state.answers,
      currentSelections: state.currentSelections,
      flags: state.flags,
      currentFilteredIndex: state.currentFilteredIndex
    })
  );
}

function resumeSavedState() {
  rebuildFilteredQuestions();
  renderAll();
  showStatus("Your saved session is active.", "success");
}

function resetProgress() {
  state.answers = {};
  state.currentSelections = {};
  state.flags = {};
  state.quizSubmitted = false;
  state.currentFilteredIndex = 0;
  saveState();
  rebuildFilteredQuestions();
  renderAll();
  showStatus("Progress reset. You now have a clean study session.", "info");
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "study") {
    state.quizSubmitted = false;
  }
  updateModeButtons();
  saveState();
  renderAll();
}

function updateModeButtons() {
  el.studyModeBtn.classList.toggle("active", state.mode === "study");
  el.quizModeBtn.classList.toggle("active", state.mode === "quiz");
}

function rebuildFilteredQuestions() {
  // Filters are applied against the full bank so you can switch
  // between categories, missed-only review, and flagged items quickly.
  const filteredQuestions = state.allQuestions.filter((question) => {
    const answerRecord = state.answers[question.id];
    const flagRecord = state.flags[question.id] || {};

    if (state.category !== "all" && question.category !== state.category) {
      return false;
    }

    if (state.missedOnly && (!answerRecord || answerRecord.isCorrect)) {
      return false;
    }

    if (state.reviewOnly && !flagRecord.review) {
      return false;
    }

    return true;
  });

  state.filteredQuestionIds = filteredQuestions.map((question) => question.id);

  if (state.currentFilteredIndex >= state.filteredQuestionIds.length) {
    state.currentFilteredIndex = Math.max(0, state.filteredQuestionIds.length - 1);
  }
}

function moveQuestion(step) {
  if (state.filteredQuestionIds.length === 0) {
    return;
  }

  state.currentFilteredIndex = Math.min(
    Math.max(state.currentFilteredIndex + step, 0),
    state.filteredQuestionIds.length - 1
  );
  saveState();
  renderAll();
}

function getCurrentQuestion() {
  const currentQuestionId = state.filteredQuestionIds[state.currentFilteredIndex];
  return state.allQuestions.find((question) => question.id === currentQuestionId) || null;
}

function answerQuestion(question, selectedChoice) {
  const isCorrect = selectedChoice === question.correctAnswer;

  state.currentSelections[question.id] = selectedChoice;

  if (state.mode === "study") {
    state.answers[question.id] = {
      selectedChoice,
      isCorrect,
      answeredAt: new Date().toISOString()
    };
  } else {
    state.answers[question.id] = {
      selectedChoice,
      isCorrect,
      answeredAt: new Date().toISOString()
    };
    state.quizSubmitted = false;
  }

  saveState();
  renderAll();
}

function finishQuizAndRefreshSummary() {
  if (state.mode === "quiz") {
    state.quizSubmitted = true;
    saveState();
  }

  renderAll();
  showStatus(
    state.mode === "quiz"
      ? "Quiz submitted. Review the summary and missed questions below."
      : "Summary refreshed with your latest study results.",
    "success"
  );
}

function toggleFlag(flagType) {
  const question = getCurrentQuestion();
  if (!question) {
    return;
  }

  const currentFlags = state.flags[question.id] || { know: false, review: false };
  const nextValue = !currentFlags[flagType];

  state.flags[question.id] = {
    ...currentFlags,
    [flagType]: nextValue
  };

  if (flagType === "know" && nextValue) {
    state.flags[question.id].review = false;
  }

  if (flagType === "review" && nextValue) {
    state.flags[question.id].know = false;
  }

  saveState();
  rebuildFilteredQuestions();
  renderAll();
}

function renderAll() {
  updateModeButtons();
  renderStats();
  renderQuestion();
  renderSummary();
}

function renderStats() {
  const totalQuestions = state.allQuestions.length;
  const answeredQuestions = Object.keys(state.answers).length;
  const correctAnswers = Object.values(state.answers).filter((record) => record.isCorrect).length;
  const incorrectAnswers = answeredQuestions - correctAnswers;
  const score = answeredQuestions === 0 ? 0 : Math.round((correctAnswers / answeredQuestions) * 100);
  const coverage = totalQuestions === 0 ? 0 : Math.round((answeredQuestions / totalQuestions) * 100);
  const visibleCount = state.filteredQuestionIds.length;

  el.questionCounter.textContent = visibleCount
    ? `Question ${state.currentFilteredIndex + 1} of ${visibleCount}`
    : "Question 0 of 0";
  el.coveragePercent.textContent = `${coverage}% covered`;
  el.progressFill.style.width = `${coverage}%`;
  el.totalQuestionsStat.textContent = String(totalQuestions);
  el.completedStat.textContent = String(answeredQuestions);
  el.correctStat.textContent = String(correctAnswers);
  el.incorrectStat.textContent = String(incorrectAnswers);
  el.scoreStat.textContent = `${score}%`;
}

function renderQuestion() {
  const question = getCurrentQuestion();
  el.choicesContainer.innerHTML = "";

  if (!question) {
    el.questionCategory.textContent = "No match";
    el.questionText.textContent = "No questions match the current filter.";
    el.feedbackBox.className = "feedback hidden";
    el.prevBtn.disabled = true;
    el.nextBtn.disabled = true;
    el.markKnowBtn.disabled = true;
    el.markReviewBtn.disabled = true;
    return;
  }

  const selectedChoice = state.currentSelections[question.id] || state.answers[question.id]?.selectedChoice;
  const answerRecord = state.answers[question.id];
  const showQuizFeedback = state.mode === "quiz" && state.quizSubmitted && answerRecord;
  const showStudyFeedback = state.mode === "study" && answerRecord;
  const showFeedback = showQuizFeedback || showStudyFeedback;

  el.questionCategory.textContent = question.category || "Uncategorized";
  el.questionText.textContent = question.question;
  el.prevBtn.disabled = state.currentFilteredIndex === 0;
  el.nextBtn.disabled = state.currentFilteredIndex >= state.filteredQuestionIds.length - 1;
  el.markKnowBtn.disabled = false;
  el.markReviewBtn.disabled = false;

  const flags = state.flags[question.id] || {};
  el.markKnowBtn.textContent = flags.know ? "Marked: I know this" : "Mark “I know this”";
  el.markReviewBtn.textContent = flags.review ? "Marked: Need review" : "Mark “Need review”";

  question.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice-btn";
    button.textContent = choice;
    button.type = "button";

    if (choice === selectedChoice) {
      button.classList.add("selected");
    }

    if (showFeedback && choice === question.correctAnswer) {
      button.classList.add("correct");
    }

    if (showFeedback && choice === selectedChoice && choice !== question.correctAnswer) {
      button.classList.add("incorrect");
    }

    button.addEventListener("click", () => answerQuestion(question, choice));
    el.choicesContainer.appendChild(button);
  });

  if (showFeedback) {
    const isCorrect = answerRecord.isCorrect;
    el.feedbackBox.className = `feedback ${isCorrect ? "correct" : "incorrect"}`;
    el.feedbackBox.textContent = isCorrect
      ? "Correct. Keep moving."
      : `Incorrect. Correct answer: ${question.correctAnswer}`;
  } else if (state.mode === "quiz" && selectedChoice) {
    el.feedbackBox.className = "feedback";
    el.feedbackBox.textContent = "Answer saved. Feedback will appear after you finish the quiz.";
  } else {
    el.feedbackBox.className = "feedback hidden";
    el.feedbackBox.textContent = "";
  }
}

function renderSummary() {
  // The dashboard is derived from saved answers and flags so it
  // updates automatically without a second data structure to maintain.
  const answers = state.answers;
  const answeredQuestions = state.allQuestions.filter((question) => answers[question.id]);
  const knowWell = [];
  const needWork = [];
  const missed = [];
  const categoryStats = {};

  answeredQuestions.forEach((question) => {
    const answerRecord = answers[question.id];
    const flags = state.flags[question.id] || {};
    const label = formatQuestionLabel(question);

    if (!categoryStats[question.category || "Uncategorized"]) {
      categoryStats[question.category || "Uncategorized"] = {
        total: 0,
        correct: 0
      };
    }

    categoryStats[question.category || "Uncategorized"].total += 1;
    if (answerRecord.isCorrect) {
      categoryStats[question.category || "Uncategorized"].correct += 1;
    }

    if (flags.know || answerRecord.isCorrect) {
      knowWell.push(label);
    }

    if (flags.review || !answerRecord.isCorrect) {
      needWork.push(label);
    }

    if (!answerRecord.isCorrect) {
      missed.push(`${label} (Correct: ${question.correctAnswer})`);
    }
  });

  const weakCategories = Object.entries(categoryStats)
    .map(([category, stats]) => ({
      category,
      accuracy: stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100),
      total: stats.total
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((entry) => `${entry.category}: ${entry.accuracy}% accuracy across ${entry.total} question(s)`);

  fillList(el.knowWellList, uniqueItems(knowWell), "No strong areas yet. Correct answers and “I know this” marks will appear here.");
  fillList(el.needWorkList, uniqueItems(needWork), "No weak areas yet. Incorrect answers and “Need review” marks will appear here.");
  fillList(el.missedList, uniqueItems(missed), "No missed questions so far.");
  fillList(el.weakCategoriesList, weakCategories, "No category data yet.");
}

function fillList(listElement, items, emptyMessage) {
  listElement.innerHTML = "";

  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = emptyMessage;
    listElement.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    listElement.appendChild(li);
  });
}

function formatQuestionLabel(question) {
  return `#${question.id} ${question.question}`;
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function showStatus(message, type = "info") {
  el.statusBanner.textContent = message;
  el.statusBanner.className = `status-banner ${type}`;
}

init();
