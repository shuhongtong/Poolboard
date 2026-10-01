const App = {
  activeTab: 'score',
  discipline: '8-Ball',
  raceTo: 5,
  gameMode: 'Vrij Spel', // 'Vrij Spel' (standaard), 'Competitie', 'Toernooi'
  seriesTarget: 5,       // aantal gewonnen wedstrijden voor overkoepelende winst
  sound: true,
  shotClockOn: false,

  timerSecs: 7200,       // 2 uur afteltimer (2 * 60 * 60)
  timerRunning: false,
  timerInterval: null,

  shotSecs: 30,
  shotInterval: null,
  shotRunning: false,

  currentTurn: 'p1',
  isMatchWon: false,
  matchRecorded: false,
  seriesFinished: false, // true = competitie is afgelopen, wacht op keuze in finale-scherm

  // Spelers inclusief overkoepelende seriesScore
  p1: { name: 'Naam speler 1', score: 0, fouls: 0, eights: 0, seriesScore: 0 },
  p2: { name: 'Naam speler 2', score: 0, fouls: 0, eights: 0, seriesScore: 0 },

  undoHistory: [],
  matchHistory: []
};

// --- Screen Wake Lock API (Houdt het scherm actief op mobiel/tablet) ---
let wakeLock = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      console.log('Screen Wake Lock is actief');
    } catch (err) {
      console.warn(`Wake Lock kon niet worden geactiveerd: ${err.name}, ${err.message}`);
    }
  }
}

// Vraag de Wake Lock opnieuw aan als de app weer zichtbaar wordt
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) {
    await requestWakeLock();
  }
});

// Activeer ook direct bij de eerste gebruikersinteractie voor mobiele browsers die interactie vereisen
const triggerWakeLockOnUserGesture = () => {
  if (!wakeLock || wakeLock.released) {
    requestWakeLock();
  }
  document.removeEventListener('click', triggerWakeLockOnUserGesture);
  document.removeEventListener('touchstart', triggerWakeLockOnUserGesture);
};
document.addEventListener('click', triggerWakeLockOnUserGesture, { once: true });
document.addEventListener('touchstart', triggerWakeLockOnUserGesture, { once: true });

// --- Fullscreen API Support ---
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

async function toggleFullscreen() {
  try {
    if (!isFullscreen()) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
    }
  } catch (err) {
    console.warn('Fullscreen omschakeling niet toegestaan of ondersteund door de browser:', err);
  }
  playSound('click');
  updateFullscreenIcon();
}

function updateFullscreenIcon() {
  const icon = document.getElementById('fullscreen-icon');
  if (!icon) return;
  if (isFullscreen()) {
    icon.textContent = 'fullscreen_exit';
    icon.classList.add('text-primary');
  } else {
    icon.textContent = 'fullscreen';
    icon.classList.remove('text-primary');
  }
}

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
  document.addEventListener(evt, updateFullscreenIcon);
});

// --- Web Audio Synthesizer ---
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    if (AudioClass) audioCtx = new AudioClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(type) {
  if (!App.sound) return;
  try {
    const ctx = getAudio();
    if (!ctx) return;
    if (type === 'hit') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'foul') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(240, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } else if (type === 'win') {
      [523, 659, 784, 1046].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + idx * 0.11;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    }
  } catch (err) {}
}

// --- Undo Management ---
function snapshotState() {
  App.undoHistory.push({
    p1: { ...App.p1 },
    p2: { ...App.p2 },
    currentTurn: App.currentTurn,
    isMatchWon: App.isMatchWon,
    matchRecorded: App.matchRecorded
  });
  if (App.undoHistory.length > 30) App.undoHistory.shift();
  updateUndoButton();
}

function handleUndo() {
  if (App.undoHistory.length === 0) return;
  const prev = App.undoHistory.pop();
  App.p1 = { ...prev.p1 };
  App.p2 = { ...prev.p2 };
  App.currentTurn = prev.currentTurn;
  App.isMatchWon = prev.isMatchWon || false;
  App.matchRecorded = prev.matchRecorded || false;
  renderScores();
  renderTurn();
  updateUndoButton();
  playSound('click');
}

function updateUndoButton() {
  const btn = document.getElementById('undo-btn');
  if (App.undoHistory.length > 0) {
    btn.classList.remove('opacity-30', 'cursor-not-allowed');
    btn.removeAttribute('disabled');
  } else {
    btn.classList.add('opacity-30', 'cursor-not-allowed');
    btn.setAttribute('disabled', 'true');
  }
}

// --- Tab Navigation ---
function navigateTo(tab) {
  App.activeTab = tab;
  const viewScore = document.getElementById('view-score');
  const viewHistory = document.getElementById('view-history');
  const tabScore = document.getElementById('tab-score');
  const tabHistory = document.getElementById('tab-history');

  if (tab === 'score') {
    viewScore.classList.remove('hidden');
    viewHistory.classList.add('hidden');
    tabScore.className = "flex flex-col items-center justify-center gap-space-xs w-16 h-16 rounded-xl transition-all text-primary bg-surface-variant/50 cursor-pointer";
    tabHistory.className = "flex flex-col items-center justify-center gap-space-xs w-16 h-16 text-on-surface-variant hover:text-on-surface rounded-xl transition-all cursor-pointer";
  } else {
    viewScore.classList.add('hidden');
    viewHistory.classList.remove('hidden');
    tabHistory.className = "flex flex-col items-center justify-center gap-space-xs w-16 h-16 rounded-xl transition-all text-primary bg-surface-variant/50 cursor-pointer";
    tabScore.className = "flex flex-col items-center justify-center gap-space-xs w-16 h-16 text-on-surface-variant hover:text-on-surface rounded-xl transition-all cursor-pointer";
    renderHistory();
  }
}

// --- Timer (Afteltimer 2 uur) ---
function toggleTimer() {
  const btnText = document.getElementById('timer-text');
  const btnIcon = document.getElementById('timer-icon');
  const pulseIcon = document.getElementById('timer-icon-pulse');

  if (!App.timerRunning) {
    // Als de timer al op 0 staat bij het starten, herstel dan eerst naar 7200
    if (App.timerSecs <= 0) {
      App.timerSecs = 7200;
      renderTimerDisplay();
    }

    App.timerRunning = true;
    btnText.textContent = 'Stop';
    btnIcon.textContent = 'pause';
    pulseIcon.classList.add('animate-pulse');
    playSound('click');

    App.timerInterval = setInterval(() => {
      if (App.timerSecs > 0) {
        App.timerSecs--;
        renderTimerDisplay();
      }

      // Automatisch stoppen als 0 bereikt is
      if (App.timerSecs <= 0) {
        clearInterval(App.timerInterval);
        App.timerRunning = false;
        btnText.textContent = 'Start';
        btnIcon.textContent = 'play_arrow';
        pulseIcon.classList.remove('animate-pulse');
        playSound('foul');
        pauseShotClock();
      }
    }, 1000);

    if (App.shotClockOn && !App.shotRunning) startShotClock();
  } else {
    App.timerRunning = false;
    btnText.textContent = 'Start';
    btnIcon.textContent = 'play_arrow';
    pulseIcon.classList.remove('animate-pulse');
    clearInterval(App.timerInterval);
    pauseShotClock();
  }
}

function resetTimer() {
  App.timerRunning = false;
  clearInterval(App.timerInterval);
  App.timerSecs = 7200;
  renderTimerDisplay();
  document.getElementById('timer-text').textContent = 'Start';
  document.getElementById('timer-icon').textContent = 'play_arrow';
  document.getElementById('timer-icon-pulse').classList.remove('animate-pulse');
  resetShotClock();
  saveStateToStorage();
}

function formatTime(secs) {
  const s = Math.max(0, Math.floor(secs));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    const hh = hours.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function renderTimerDisplay() {
  document.getElementById('match-timer').textContent = formatTime(App.timerSecs);
}

// --- Shot Clock ---
function startShotClock() {
  if (!App.shotClockOn) return;
  App.shotRunning = true;
  clearInterval(App.shotInterval);
  App.shotInterval = setInterval(() => {
    if (App.shotSecs > 0) {
      App.shotSecs--;
      document.getElementById('shot-clock-val').textContent = `${App.shotSecs}s`;
      if (App.shotSecs <= 5) playSound('click');
    } else {
      clearInterval(App.shotInterval);
      App.shotRunning = false;
      playSound('foul');
    }
  }, 1000);
}

function pauseShotClock() {
  App.shotRunning = false;
  clearInterval(App.shotInterval);
}

function resetShotClock() {
  App.shotSecs = 30;
  document.getElementById('shot-clock-val').textContent = '30s';
  if (App.timerRunning && App.shotClockOn) startShotClock();
}

function extendShotClock() {
  App.shotSecs += 30;
  document.getElementById('shot-clock-val').textContent = `${App.shotSecs}s`;
  playSound('click');
}

// --- Adjust Scores & Subs ---
// Is de Competitie afgelopen (iemand heeft seriesTarget gehaald)?
function isSeriesFinal() {
  return App.gameMode === 'Competitie' && App.seriesFinished === true;
}

function adjustScore(player, amount) {
  if (isSeriesFinal()) return; // competitie afgelopen: niet meer scoren
  snapshotState();
  const current = App[player].score;
  const next = Math.max(0, current + amount);
  App[player].score = next;

  const scoreEl = document.getElementById(`${player}-score`);
  scoreEl.classList.remove('score-pop');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pop');

  playSound(amount > 0 ? 'hit' : 'click');
  renderScores();
  resetShotClock();
  saveStateToStorage();

  if (App.raceTo > 0 && next >= App.raceTo && amount > 0) {
    triggerWin(player);
  }
}

function adjustSub(player, type, amount) {
  if (isSeriesFinal()) return;
  snapshotState();
  const current = App[player][type];
  App[player][type] = Math.max(0, current + amount);
  playSound(type === 'fouls' && amount > 0 ? 'foul' : 'click');
  renderScores();
  saveStateToStorage();
}

function renderScores() {
  document.getElementById('p1-score').textContent = App.p1.score;
  document.getElementById('p2-score').textContent = App.p2.score;
  document.getElementById('p1-fouls').textContent = App.p1.fouls;
  document.getElementById('p2-fouls').textContent = App.p2.fouls;
  document.getElementById('p1-eights').textContent = App.p1.eights;
  document.getElementById('p2-eights').textContent = App.p2.eights;
  
  renderSeriesBadges();
  renderRaceDots();
}

// Toon de kleinere overkoepelende score teller boven de frame-score
function renderSeriesBadges() {
  const p1Badge = document.getElementById('p1-series-badge');
  const p2Badge = document.getElementById('p2-series-badge');
  const modePill = document.getElementById('mode-pill');
  const modalResetSeriesBtn = document.getElementById('modal-reset-series-btn');

  if (App.gameMode === 'Vrij Spel') {
    p1Badge.classList.add('hidden');
    p2Badge.classList.add('hidden');
    if (modePill) modePill.classList.add('hidden');
    if (modalResetSeriesBtn) modalResetSeriesBtn.classList.add('hidden');
  } else {
    p1Badge.classList.remove('hidden');
    p2Badge.classList.remove('hidden');
    document.getElementById('p1-series-text').textContent = `${App.gameMode}: ${App.p1.seriesScore}`;
    document.getElementById('p2-series-text').textContent = `${App.gameMode}: ${App.p2.seriesScore}`;

    if (modePill) {
      modePill.classList.remove('hidden');
      modePill.textContent = App.gameMode;
    }
    if (modalResetSeriesBtn) {
      modalResetSeriesBtn.classList.remove('hidden');
    }
  }
}

function renderRaceDots() {
  const p1Dots = document.getElementById('p1-dots');
  const p2Dots = document.getElementById('p2-dots');
  const pill = document.getElementById('race-pill');

  if (!App.raceTo || App.raceTo <= 0) {
    p1Dots.innerHTML = '';
    p2Dots.innerHTML = '';
    pill.classList.add('hidden');
    return;
  }

  pill.classList.remove('hidden');
  pill.textContent = `Race ${App.raceTo}`;

  const total = Math.min(App.raceTo, 10);
  function makeDots(score, lead) {
    let h = '';
    for (let i = 1; i <= total; i++) {
      const filled = i <= score;
      const col = filled ? (lead ? 'bg-primary' : 'bg-secondary') : 'bg-surface-variant';
      h += `<span class="w-1.5 h-1.5 rounded-full ${col}"></span>`;
    }
    return h;
  }
  p1Dots.innerHTML = makeDots(App.p1.score, App.p1.score >= App.p2.score);
  p2Dots.innerHTML = makeDots(App.p2.score, App.p2.score >= App.p1.score);
}

// --- Turn Switching ---
function setTurn(player) {
  if (App.currentTurn !== player) {
    snapshotState();
    App.currentTurn = player;
    renderTurn();
    playSound('click');
    resetShotClock();
    saveStateToStorage();
  }
}

function switchTurn() {
  setTurn(App.currentTurn === 'p1' ? 'p2' : 'p1');
}

function renderTurn() {
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const p1Dot = document.getElementById('p1-dot');
  const p2Dot = document.getElementById('p2-dot');
  const p1Score = document.getElementById('p1-score');
  const p2Score = document.getElementById('p2-score');

  if (App.currentTurn === 'p1') {
    p1Card.className = "bg-surface-container-low p-space-md rounded-xl relative transition-all duration-300 ring-1 ring-primary/40 bg-gradient-to-r from-primary/5 via-surface-container-low to-surface-container-low mb-space-md cursor-pointer";
    p1Dot.className = "w-3 h-3 rounded-full bg-primary animate-pulse transition-all";
    p1Score.className = "font-display-score-mobile text-display-score-mobile text-primary font-bold select-none transition-all duration-150";

    p2Card.className = "bg-surface-container-low p-space-md rounded-xl relative transition-all duration-300 ring-1 ring-surface-variant cursor-pointer";
    p2Dot.className = "w-3 h-3 rounded-full bg-transparent transition-all";
    p2Score.className = "font-display-score-mobile text-display-score-mobile text-secondary font-bold select-none transition-all duration-150";
  } else {
    p2Card.className = "bg-surface-container-low p-space-md rounded-xl relative transition-all duration-300 ring-1 ring-primary/40 bg-gradient-to-r from-primary/5 via-surface-container-low to-surface-container-low cursor-pointer";
    p2Dot.className = "w-3 h-3 rounded-full bg-primary animate-pulse transition-all";
    p2Score.className = "font-display-score-mobile text-display-score-mobile text-primary font-bold select-none transition-all duration-150";

    p1Card.className = "bg-surface-container-low p-space-md rounded-xl relative transition-all duration-300 ring-1 ring-surface-variant mb-space-md cursor-pointer";
    p1Dot.className = "w-3 h-3 rounded-full bg-transparent transition-all";
    p1Score.className = "font-display-score-mobile text-display-score-mobile text-secondary font-bold select-none transition-all duration-150";
  }
}

function updatePlayerName(player, val) {
  // Bepaal de standaardnaam op basis van wie er aan de beurt is
  if (player === 'p1') {
    App[player].name = val.trim() || 'Naam speler 1';
  } else {
    App[player].name = val.trim() || 'Naam speler 2';
  }
  
  document.getElementById(player + '-name').value = App[player].name;
  renderScores();
  saveStateToStorage();
}

// --- Winner & Finish Match Logic ---
// restoring = true: het finale-scherm wordt alleen opnieuw getoond na het openen van de app
// (geen geluid, geen extra punt erbij, geen opnieuw opslaan)
function triggerWin(winnerKey, restoring = false) {
  const isDraw = winnerKey === 'draw';
  if (!restoring) playSound(isDraw ? 'click' : 'win');
  App.isMatchWon = true;

  // Verhoog overkoepelende score als Competitie of Toernooi actief is
  // (bij een gelijkspel krijgt niemand een punt en kan de serie ook niet afgelopen zijn)
  const isSeriesMode = App.gameMode !== 'Vrij Spel';
  if (isSeriesMode && !restoring && !isDraw) {
    App[winnerKey].seriesScore++;
    // Competitie afgelopen? Dan de vlag zetten en meteen bewaren
    if (App.gameMode === 'Competitie' && App[winnerKey].seriesScore >= App.seriesTarget) {
      App.seriesFinished = true;
    }
    saveStateToStorage();
  }

  renderScores();

  const winnerName = isDraw ? '' : App[winnerKey].name;
  const winnerIconWrap = document.getElementById('winner-icon-wrap');
  const winnerBadge = document.getElementById('winner-badge');
  const winnerTitle = document.getElementById('winner-title');
  const winnerScoreLabel = document.getElementById('winner-score-label');
  const winnerScore = document.getElementById('winner-score');
  const winnerSeriesStanding = document.getElementById('winner-series-standing');
  const rematchBtn = document.getElementById('winner-rematch-btn');
  const newSeriesBtn = document.getElementById('winner-new-series-btn');
  const continueBtn = document.getElementById('winner-continue-btn');

  // Check of een speler de overkoepelende serie wint (seriesTarget punten)
  const hasWonSeries = !isDraw && isSeriesMode && App[winnerKey].seriesScore >= App.seriesTarget;

  // Icoon: trofee bij een winnaar, handdruk bij een gelijkspel
  winnerIconWrap.innerHTML = `<span class="material-symbols-outlined text-[36px]">${isDraw ? 'handshake' : 'emoji_events'}</span>`;

  if (isDraw) {
    // Gelijkspel: geen winnaar, geen punt in de serie
    winnerBadge.textContent = 'Gelijkspel';
    winnerTitle.textContent = 'Gelijkspel!';
    winnerScoreLabel.textContent = isSeriesMode ? 'Eindstand Match' : 'Eindstand';
    winnerScore.textContent = `${App.p1.score} - ${App.p2.score}`;

    if (isSeriesMode) {
      winnerSeriesStanding.classList.remove('hidden');
      winnerSeriesStanding.textContent = `${App.gameMode} Stand: ${App.p1.name} ${App.p1.seriesScore} - ${App.p2.seriesScore} ${App.p2.name} (Doel: ${App.seriesTarget})`;
      rematchBtn.textContent = 'Volgende Wedstrijd in Serie';
      newSeriesBtn.classList.remove('hidden');
      newSeriesBtn.textContent = `Reset ${App.gameMode} Stand`;
    } else {
      winnerSeriesStanding.classList.add('hidden');
      rematchBtn.textContent = 'Nieuwe Wedstrijd (Rematch)';
      newSeriesBtn.classList.add('hidden');
    }
    rematchBtn.classList.remove('hidden');
    continueBtn.classList.remove('hidden');
  } else if (hasWonSeries) {
    // Uiteindelijke serie winnaar!
    winnerBadge.textContent = `${App.gameMode} Finale`;
    winnerTitle.textContent = `${App.gameMode} Winnaar!`;
    winnerScoreLabel.textContent = `Eindstand ${App.gameMode}`;
    winnerScore.textContent = `${App.p1.seriesScore} - ${App.p2.seriesScore}`;

    winnerSeriesStanding.classList.remove('hidden');
    winnerSeriesStanding.textContent = `${winnerName} wint de serie met ${App.seriesTarget} overwinningen!`;

    // Finale: geen "Volgende Losse Wedstrijd" en geen "Blijf doorspelen"
    rematchBtn.classList.add('hidden');
    continueBtn.classList.add('hidden');
    newSeriesBtn.classList.remove('hidden');
    newSeriesBtn.textContent = `Nieuwe ${App.gameMode} Beginnen`;
  } else if (isSeriesMode) {
    // Losse wedstrijd binnen de serie gewonnen
    winnerBadge.textContent = `Match Winnaar (${App.gameMode})`;
    winnerTitle.textContent = `${winnerName} Wint!`;
    winnerScoreLabel.textContent = 'Eindstand Match';
    winnerScore.textContent = `${App.p1.score} - ${App.p2.score}`;

    winnerSeriesStanding.classList.remove('hidden');
    winnerSeriesStanding.textContent = `${App.gameMode} Stand: ${App.p1.name} ${App.p1.seriesScore} - ${App.p2.seriesScore} ${App.p2.name} (Doel: ${App.seriesTarget})`;

    rematchBtn.classList.remove('hidden');
    continueBtn.classList.remove('hidden');
    rematchBtn.textContent = 'Volgende Wedstrijd in Serie';
    newSeriesBtn.classList.remove('hidden');
    newSeriesBtn.textContent = `Reset ${App.gameMode} Stand`;
  } else {
    // Vrij Spel
    winnerBadge.textContent = 'Wedstrijd Winnaar';
    winnerTitle.textContent = `${winnerName} Wint!`;
    winnerScoreLabel.textContent = 'Eindstand';
    winnerScore.textContent = `${App.p1.score} - ${App.p2.score}`;

    winnerSeriesStanding.classList.add('hidden');
    rematchBtn.classList.remove('hidden');
    continueBtn.classList.remove('hidden');
    rematchBtn.textContent = 'Nieuwe Wedstrijd (Rematch)';
    newSeriesBtn.classList.add('hidden');
  }

  document.getElementById('winner-details').innerHTML = `
    <span class="material-symbols-outlined text-[14px]">timer</span>
    <span>Resterend: ${formatTime(App.timerSecs)} • ${App.discipline}</span>
  `;

  if (isDraw) {
    document.getElementById('confetti-box').innerHTML = ''; // geen confetti bij gelijkspel
  } else {
    popConfetti();
  }
  document.getElementById('modal-winner').classList.remove('hidden');
}

function popConfetti() {
  const box = document.getElementById('confetti-box');
  box.innerHTML = '';
  const colors = ['#ffb2ba', '#ef6078', '#e2e2e3', '#38393a', '#ffd9dc'];
  for (let i = 0; i < 40; i++) {
    const div = document.createElement('div');
    div.className = 'confetti-piece';
    div.style.left = `${Math.random() * 100}%`;
    div.style.top = `${Math.random() * 20}%`;
    div.style.width = `${Math.random() * 8 + 4}px`;
    div.style.height = `${Math.random() * 8 + 4}px`;
    div.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    div.style.animationDelay = `${Math.random() * 0.4}s`;
    box.appendChild(div);
  }
}

function closeWinnerModal() {
  // Het finale-scherm mag pas dicht als een van de twee knoppen de vlag heeft uitgezet
  if (isSeriesFinal()) return;
  document.getElementById('modal-winner').classList.add('hidden');
}

// Geeft 'p1', 'p2' of 'draw' terug op basis van de huidige scores
function getMatchResult() {
  if (App.p1.score > App.p2.score) return 'p1';
  if (App.p2.score > App.p1.score) return 'p2';
  return 'draw';
}

function promptEndMatch() {
  App.matchRecorded = false;
  triggerWin(getMatchResult());
}

function saveAndGoToHistory() {
  recordMatch();
  if (isSeriesFinal()) {
    // Competitie-finale: eerst opgeslagen (hierboven), nu alles terug naar 0
    finishSeriesAndReset();
    renderHistory();
  }
  closeWinnerModal();
  navigateTo('history');
}

function startRematch() {
  if (isSeriesFinal()) return; // extra slot: na de finale geen losse wedstrijd meer
  recordMatch();
  closeWinnerModal();
  App.p1.score = 0; App.p1.fouls = 0; App.p1.eights = 0;
  App.p2.score = 0; App.p2.fouls = 0; App.p2.eights = 0;
  App.undoHistory = [];
  App.isMatchWon = false;
  App.matchRecorded = false;
  resetTimer();
  renderScores();
  renderTurn();
  updateUndoButton();
  playSound('hit');
}

// Nieuwe serie beginnen: reset de overkoepelende stand naar 0
function startNewSeries() {
  recordMatch();
  finishSeriesAndReset();
  resetTimer();
  renderScores();
  renderTurn();
  updateUndoButton();
  closeWinnerModal();
  playSound('hit');
}

// Zet de competitie terug op 0 - 0 (wordt pas aangeroepen NADAT de wedstrijd is opgeslagen)
function finishSeriesAndReset() {
  App.p1.seriesScore = 0;
  App.p2.seriesScore = 0;
  App.p1.score = 0; App.p1.fouls = 0; App.p1.eights = 0;
  App.p2.score = 0; App.p2.fouls = 0; App.p2.eights = 0;
  App.undoHistory = [];
  App.isMatchWon = false;
  App.matchRecorded = false;
  App.seriesFinished = false;
  saveStateToStorage();
  renderScores();
  renderTurn();
  updateUndoButton();
}

function resetSeries() {
  if (confirm(`Weet je zeker dat je de overkoepelende stand voor ${App.gameMode} wilt resetten naar 0 - 0?`)) {
    App.p1.seriesScore = 0;
    App.p2.seriesScore = 0;
    App.seriesFinished = false;
    saveStateToStorage();
    renderScores();
    const settingsStand = document.getElementById('settings-series-stand');
    if (settingsStand) settingsStand.textContent = '0 - 0';
    playSound('click');
  }
}

// Match vastleggen in History (met type spel en seriestand)
function recordMatch() {
  if (App.matchRecorded) return;
  App.matchRecorded = true;

  const seriesStandSnapshot = `${App.p1.seriesScore} - ${App.p2.seriesScore}`;
  const now = new Date();

  const match = {
    id: 'm_' + Date.now(),
    date: now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    dateRaw: now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
    timeRaw: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    discipline: App.discipline,
    raceTo: App.raceTo,
    gameMode: App.gameMode || 'Vrij Spel',
    seriesStand: seriesStandSnapshot,
    p1Series: App.p1.seriesScore,
    p2Series: App.p2.seriesScore,
    durationFormatted: formatTime(App.timerSecs),
    p1: { ...App.p1 },
    p2: { ...App.p2 },
    winner: getMatchResult()
  };
  App.matchHistory.unshift(match);
  try {
    localStorage.setItem('pool_history_records', JSON.stringify(App.matchHistory));
  } catch (e) {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('pool_history_records');
    if (raw) App.matchHistory = JSON.parse(raw);
  } catch (e) {
    App.matchHistory = [];
  }
}

// Persist active settings, series scores AND live match state
function saveStateToStorage() {
  try {
    const state = {
      gameMode: App.gameMode,
      discipline: App.discipline,
      raceTo: App.raceTo,
      seriesTarget: App.seriesTarget,
      currentTurn: App.currentTurn,
      timerSecs: App.timerSecs,
      seriesFinished: App.seriesFinished,
      p1: {
        name: App.p1.name,
        score: App.p1.score,
        fouls: App.p1.fouls,
        eights: App.p1.eights,
        seriesScore: App.p1.seriesScore
      },
      p2: {
        name: App.p2.name,
        score: App.p2.score,
        fouls: App.p2.fouls,
        eights: App.p2.eights,
        seriesScore: App.p2.seriesScore
      }
    };
    localStorage.setItem('pool_app_state', JSON.stringify(state));
  } catch (e) {}
}

function loadAppState() {
  try {
    const raw = localStorage.getItem('pool_app_state');
    if (raw) {
      const state = JSON.parse(raw);
      if (state.gameMode) App.gameMode = state.gameMode;
      if (state.discipline) App.discipline = state.discipline;
      if (state.raceTo !== undefined) App.raceTo = state.raceTo;
      if (state.seriesTarget !== undefined) App.seriesTarget = state.seriesTarget;
      if (state.currentTurn) App.currentTurn = state.currentTurn;
      if (state.timerSecs !== undefined) App.timerSecs = state.timerSecs;
      if (state.seriesFinished !== undefined) App.seriesFinished = state.seriesFinished === true;
      if (state.p1) {
        if (state.p1.name) App.p1.name = state.p1.name;
        if (state.p1.score !== undefined) App.p1.score = state.p1.score;
        if (state.p1.fouls !== undefined) App.p1.fouls = state.p1.fouls;
        if (state.p1.eights !== undefined) App.p1.eights = state.p1.eights;
        if (state.p1.seriesScore !== undefined) App.p1.seriesScore = state.p1.seriesScore;
      }
      if (state.p2) {
        if (state.p2.name) App.p2.name = state.p2.name;
        if (state.p2.score !== undefined) App.p2.score = state.p2.score;
        if (state.p2.fouls !== undefined) App.p2.fouls = state.p2.fouls;
        if (state.p2.eights !== undefined) App.p2.eights = state.p2.eights;
        if (state.p2.seriesScore !== undefined) App.p2.seriesScore = state.p2.seriesScore;
      }
    }
  } catch (e) {}
}

// --- Reset Confirmation ---
function promptResetMatch() {
  document.getElementById('modal-reset').classList.remove('hidden');
}
function closeResetModal() {
  document.getElementById('modal-reset').classList.add('hidden');
}
function executeResetMatch() {
  closeResetModal();
  snapshotState();
  App.p1.score = 0; App.p1.fouls = 0; App.p1.eights = 0;
  App.p2.score = 0; App.p2.fouls = 0; App.p2.eights = 0;
  App.isMatchWon = false;
  App.matchRecorded = false;
  resetTimer();
  renderScores();
  renderTurn();
  saveStateToStorage();
  playSound('click');
}

// --- Share Match (Web Share API / Clipboard Fallback) ---
function shareMatch(matchId) {
  const m = App.matchHistory.find(i => i.id === matchId);
  if (!m) return;

  const isDraw = m.winner === 'draw';
  let winnerName, loserName, winnerScore, loserScore;

  if (isDraw) {
    winnerName = m.p1.name;
    loserName = m.p2.name;
    winnerScore = m.p1.score;
    loserScore = m.p2.score;
  } else {
    const isP1Winner = m.winner === 'p1';
    winnerName = isP1Winner ? m.p1.name : m.p2.name;
    loserName = isP1Winner ? m.p2.name : m.p1.name;
    winnerScore = isP1Winner ? m.p1.score : m.p2.score;
    loserScore = isP1Winner ? m.p2.score : m.p1.score;
  }

  const dateStr = m.dateRaw || m.date;
  const timeStr = m.timeRaw || '';
  const seriesInfo = (m.gameMode && m.gameMode !== 'Vrij Spel' && m.seriesStand) ? ` Competitie statistieken: ${m.seriesStand}` : '';

  let shareText;
  if (isDraw) {
    shareText = `🎱 Pool Uitslag: Gelijkspel tussen ${winnerName} en ${loserName} met ${winnerScore} - ${loserScore}! op Datum: ${dateStr} om ${timeStr}.${seriesInfo}`;
  } else {
    shareText = `🎱 Pool Uitslag: ${winnerName} wint van ${loserName} met ${winnerScore} - ${loserScore}! op Datum: ${dateStr} om ${timeStr}.${seriesInfo}`;
  }

  if (navigator.share) {
    navigator.share({
      title: 'Pool Uitslag',
      text: shareText
    }).catch(() => {});
  } else {
    // Clipboard fallback
    navigator.clipboard.writeText(shareText).then(() => {
      showShareToast('Gekopieerd naar klembord!');
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = shareText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showShareToast('Gekopieerd naar klembord!');
    });
  }
}

function showShareToast(msg) {
  // Remove existing toast
  const existing = document.querySelector('.share-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// --- History View Rendering ---
function renderHistory() {
  const container = document.getElementById('history-items');
  const empty = document.getElementById('history-empty');
  const clearBtn = document.getElementById('clear-history-btn');

  const count = App.matchHistory.length;
  document.getElementById('stat-total-matches').textContent = `${count} ${count === 1 ? 'Wedstrijd' : 'Wedstrijden'}`;

  let p1Wins = 0, p2Wins = 0, draws = 0, totalFrames = 0;
  App.matchHistory.forEach(m => {
    if (m.winner === 'p1') p1Wins++;
    else if (m.winner === 'p2') p2Wins++;
    else if (m.winner === 'draw') draws++;
    totalFrames += (m.p1.score + m.p2.score);
  });

  document.getElementById('stat-p1-label').textContent = App.p1.name;
  document.getElementById('stat-p2-label').textContent = App.p2.name;
  document.getElementById('stat-p1-wins').textContent = p1Wins;
  document.getElementById('stat-p2-wins').textContent = p2Wins;
  document.getElementById('stat-total-frames').textContent = totalFrames;
  document.getElementById('stat-draws').textContent = draws;

  const p1Pct = count > 0 ? Math.round((p1Wins / count) * 100) : 0;
  const p2Pct = count > 0 ? Math.round((p2Wins / count) * 100) : 0;
  document.getElementById('stat-p1-winrate').textContent = `${p1Pct}% win`;
  document.getElementById('stat-p2-winrate').textContent = `${p2Pct}% win`;

  if (count === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  clearBtn.classList.remove('hidden');

  container.innerHTML = App.matchHistory.map(m => {
    const isDraw = m.winner === 'draw';
    const isP1 = m.winner === 'p1';
    const isP2 = !isDraw && !isP1; // oude wedstrijden met winner 'p2' blijven zo werken
    const mode = m.gameMode || 'Vrij Spel';

    // Styling van de Type Spel chip
    let modeChipStyle = 'bg-surface-variant text-on-surface-variant border-surface-variant/40';
    if (mode === 'Competitie') {
      modeChipStyle = 'bg-primary/15 text-primary border-primary/30';
    } else if (mode === 'Toernooi') {
      modeChipStyle = 'bg-amber-400/15 text-amber-300 border-amber-400/30';
    }

    const isSeries = mode !== 'Vrij Spel';
    // Beslissende wedstrijd van een competitie: geen Rematch-knop
    const isFinalMatch = mode === 'Competitie' && (m.p1Series >= App.seriesTarget || m.p2Series >= App.seriesTarget);

   // --- NIEUWE LOGICA VOOR COMPETITIE WEERGAVE ---
  let modeDisplay = '';
  if (mode === 'Competitie') {
    // Controleer of iemand seriesTarget punten heeft gehaald in de overkoepelende serie
    const seriesWon = m.p1Series >= App.seriesTarget || m.p2Series >= App.seriesTarget;
    
    if (seriesWon) {
      // Doel gehaald: Met icoon
      modeDisplay = `<span class="text-[11px] font-semibold text-primary uppercase tracking-wider">🏆 Competitie</span>`;
    } else {
      // Doel niet gehaald: Alleen tekst
      modeDisplay = `<span class="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Competitie</span>`;
    }
  } else if (mode === 'Vrij Spel') {
    // Vrij spel: Alleen tekst
    modeDisplay = `<span class="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Vrij Spel</span>`;
  }
  // ----------------------------------------------

    return `
      <div class="bg-surface-container-low p-space-md rounded-xl border border-surface-variant/40 hover:border-primary/40 transition-all shadow-sm">
        <div class="flex items-center justify-between text-xs text-on-surface-variant mb-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            
            <!-- Type Spel Chip -->
          ${modeDisplay}
            
            <!-- Overkoepelende stand subtiel weergeven -->
            ${isSeries && m.seriesStand ? `
              <span>•</span>
              <span class="text-[11px] font-mono text-on-surface bg-surface-container px-1.5 py-0.5 rounded border border-surface-variant/40" title="Seriestand na deze match">
                Stand ${m.seriesStand}
              </span>
            ` : ''}
            <span>•</span>
            <span>${m.date}</span>
          </div>
          <div class="flex items-center gap-1 font-mono shrink-0 ml-2">
            <span class="material-symbols-outlined text-[14px]">timer</span>
            <span>${m.durationFormatted}</span>
          </div>
        </div>

        <div class="flex items-center justify-between py-2 border-y border-surface-variant/20 my-1">
          <div class="flex items-center gap-2 flex-1">
            <span class="w-2.5 h-2.5 rounded-full ${isP1 ? 'bg-primary animate-pulse' : 'bg-surface-variant'}"></span>
            <span class="font-semibold text-body-sm ${isP1 ? 'text-primary' : 'text-on-surface'}">${m.p1.name}</span>
            ${isP1 ? '<span class="text-[9px] bg-primary/20 text-primary font-bold px-1.5 py-0.5 rounded uppercase">Win</span>' : ''}
          </div>

          <div class="flex flex-col items-center px-3">
            <div class="font-mono text-headline-md font-bold">
              <span class="${isP1 ? 'text-primary' : isDraw ? 'text-on-surface' : 'text-secondary'}">${m.p1.score}</span>
              <span class="text-on-surface-variant px-1">-</span>
              <span class="${isP2 ? 'text-primary' : isDraw ? 'text-on-surface' : 'text-secondary'}">${m.p2.score}</span>
            </div>
            ${isDraw ? '<span class="text-[9px] bg-surface-variant text-on-surface-variant font-bold px-1.5 py-0.5 rounded uppercase">Gelijkspel</span>' : ''}
          </div>

          <div class="flex items-center justify-end gap-2 flex-1">
            ${isP2 ? '<span class="text-[9px] bg-primary/20 text-primary font-bold px-1.5 py-0.5 rounded uppercase">Win</span>' : ''}
            <span class="font-semibold text-body-sm ${isP2 ? 'text-primary' : 'text-on-surface'}">${m.p2.name}</span>
            <span class="w-2.5 h-2.5 rounded-full ${isP2 ? 'bg-primary animate-pulse' : 'bg-surface-variant'}"></span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 text-xs text-on-surface-variant">
          <div class="flex items-center gap-3">
            <span>Cue balls: ${m.p1.fouls} vs ${m.p2.fouls}</span>
            <span>•</span>
            <span>8-Balls: ${m.p1.eights} vs ${m.p2.eights}</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="text-on-surface-variant hover:text-primary transition-colors p-1" onclick="shareMatch('${m.id}')" title="Delen">
              <span class="material-symbols-outlined text-[16px]">share</span>
            </button>
            ${isFinalMatch ? '' : `<button class="text-primary hover:underline font-medium text-xs flex items-center gap-1" onclick="rematch('${m.id}')">
              <span class="material-symbols-outlined text-[14px]">replay</span>
              <span>Rematch</span>
            </button>`}
            <button class="text-on-surface-variant hover:text-error transition-colors p-1" onclick="deleteMatch('${m.id}')">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function rematch(id) {
  const m = App.matchHistory.find(i => i.id === id);
  if (!m) return;
  // Veiligheid: van een beslissende competitiewedstrijd mag geen rematch gestart worden
  if (m.gameMode === 'Competitie' && (m.p1Series >= App.seriesTarget || m.p2Series >= App.seriesTarget)) return;
  App.p1.name = m.p1.name;
  App.p2.name = m.p2.name;
  App.discipline = m.discipline;
  App.raceTo = m.raceTo;
  if (m.gameMode) App.gameMode = m.gameMode;
  document.getElementById('p1-name').value = m.p1.name;
  document.getElementById('p2-name').value = m.p2.name;
  App.p1.score = 0; App.p1.fouls = 0; App.p1.eights = 0;
  App.p2.score = 0; App.p2.fouls = 0; App.p2.eights = 0;
  App.undoHistory = [];
  App.isMatchWon = false;
  App.matchRecorded = false;
  resetTimer();
  renderScores();
  renderTurn();
  updateUndoButton();
  navigateTo('score');
  playSound('hit');
}

function deleteMatch(id) {
  if (confirm('Weet je zeker dat je deze specifieke wedstrijd wilt verwijderen?')) {
    // Filter de wedstrijd uit de geschiedenis
    App.matchHistory = App.matchHistory.filter(m => m.id !== id);
    
    // Sla de bijgewerkte geschiedenis op
    try {
      localStorage.setItem('pool_history_records', JSON.stringify(App.matchHistory));
    } catch (e) {}
    
    // Werk het scherm bij
    renderHistory();
  }
} 

// --- History Modal Logic ---
function confirmClearHistory() {
  // Open onze custom modal in plaats van window.confirm() te gebruiken
  document.getElementById('modal-clear-history').classList.remove('hidden');
}

function closeClearHistoryModal() {
  document.getElementById('modal-clear-history').classList.add('hidden');
}

function executeClearHistory() {
  // Voer de daadwerkelijke wis-actie uit
  App.matchHistory = [];
  try {
    localStorage.removeItem('pool_history_records');
  } catch (e) {
    console.warn('Kon geschiedenis niet wissen uit localStorage', e);
  }
  renderHistory();
  closeClearHistoryModal();
}

// --- Settings Modal ---
function openSettingsModal() {

  document.getElementById('settings-shot-clock').checked = App.shotClockOn;
  document.getElementById('settings-audio').checked = App.sound;

  // Update Type Spel knoppen
  document.querySelectorAll('.mode-btn').forEach(b => {
    if (b.dataset.val === App.gameMode) {
      b.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all mode-btn bg-primary text-on-primary border-primary";
    } else {
      b.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all mode-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
    }
  });

  // Update Discipline knoppen
  document.querySelectorAll('.disc-btn').forEach(b => {
    if (b.dataset.val === App.discipline) {
      b.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all disc-btn bg-primary text-on-primary border-primary";
    } else {
      b.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all disc-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
    }
  });

  // Update Race knoppen
  document.querySelectorAll('.r-btn').forEach(b => {
    if (parseInt(b.dataset.val) === App.raceTo) {
      b.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all r-btn bg-primary text-on-primary border-primary";
    } else {
      b.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all r-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
    }
  });

  // Update Competitie Aantal knoppen
  document.querySelectorAll('.series-btn').forEach(b => {
    if (parseInt(b.dataset.val) === App.seriesTarget) {
      b.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all series-btn bg-primary text-on-primary border-primary";
    } else {
      b.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all series-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
    }
  });

  // Toon/verberg de juiste instelling op basis van gameMode
  updateSettingsVisibility();

  // Toon overkoepelende stand in settings
  const seriesInfo = document.getElementById('settings-series-info');
  if (seriesInfo) {
    if (App.gameMode !== 'Vrij Spel') {
      seriesInfo.classList.remove('hidden');
      document.getElementById('settings-series-stand').textContent = `${App.p1.name} ${App.p1.seriesScore} - ${App.p2.seriesScore} ${App.p2.name}`;
    } else {
      seriesInfo.classList.add('hidden');
    }
  }

  document.getElementById('modal-settings').classList.remove('hidden');
}

// Toggle visibility: Frames per wedstrijd vs Aantal per competitie
function updateSettingsVisibility() {
  const raceSection = document.getElementById('race-section');
  const seriesSection = document.getElementById('series-section');

  if (App.gameMode === 'Competitie') {
    // Competitie: toon "Aantal per competitie", verberg "Frames per wedstrijd"
    if (raceSection) raceSection.classList.add('hidden');
    if (seriesSection) seriesSection.classList.remove('hidden');
  } else {
    // Vrij Spel: toon "Frames per wedstrijd", verberg "Aantal per competitie"
    if (raceSection) raceSection.classList.remove('hidden');
    if (seriesSection) seriesSection.classList.add('hidden');
  }
}

function closeSettingsModal() {
  document.getElementById('modal-settings').classList.add('hidden');
}

function saveSettings() {
  document.getElementById('p1-name').value = App.p1.name;
  document.getElementById('p2-name').value = App.p2.name;

  App.shotClockOn = document.getElementById('settings-shot-clock').checked;
  App.sound = document.getElementById('settings-audio').checked;

  const scWidget = document.getElementById('shot-clock-widget');
  if (App.shotClockOn) scWidget.classList.remove('hidden');
  else {
    scWidget.classList.add('hidden');
    pauseShotClock();
  }

  renderScores();
  renderRaceDots();
  saveStateToStorage();
  closeSettingsModal();
  playSound('click');
}

function toggleSound() {
  App.sound = !App.sound;
  const icon = document.getElementById('sound-icon');
  icon.textContent = App.sound ? 'volume_up' : 'volume_off';
  icon.className = App.sound ? 'material-symbols-outlined text-[19px] text-primary' : 'material-symbols-outlined text-[19px] text-on-surface-variant';
  if (App.sound) playSound('hit');
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadAppState();
  loadHistory();

  // Screen Wake Lock activeren
  requestWakeLock();

  // Type Spel knoppen click event
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all mode-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
      });
      btn.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all mode-btn bg-primary text-on-primary border-primary";
      App.gameMode = btn.dataset.val;

      const seriesInfo = document.getElementById('settings-series-info');
      if (seriesInfo) {
        if (App.gameMode !== 'Vrij Spel') {
          seriesInfo.classList.remove('hidden');
          document.getElementById('settings-series-stand').textContent = `${App.p1.name} ${App.p1.seriesScore} - ${App.p2.seriesScore} ${App.p2.name}`;
        } else {
          seriesInfo.classList.add('hidden');
        }
      }

      // Toon/verberg de juiste instelling
      updateSettingsVisibility();
    });
  });

  // Spel discipline knoppen click event
  document.querySelectorAll('.disc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.disc-btn').forEach(b => {
        b.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all disc-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
      });
      btn.className = "py-2 px-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all disc-btn bg-primary text-on-primary border-primary";
      App.discipline = btn.dataset.val;
    });
  });

  // Race to knoppen click event
  document.querySelectorAll('.r-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.r-btn').forEach(b => {
        b.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all r-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
      });
      btn.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all r-btn bg-primary text-on-primary border-primary";
      App.raceTo = parseInt(btn.dataset.val);
    });
  });

  // Competitie Aantal knoppen click event
  document.querySelectorAll('.series-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.series-btn').forEach(b => {
        b.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all series-btn bg-surface-container-low text-on-surface-variant border-surface-variant hover:text-on-surface";
      });
      btn.className = "py-2 rounded-lg text-xs font-semibold uppercase text-center border transition-all series-btn bg-primary text-on-primary border-primary";
      App.seriesTarget = parseInt(btn.dataset.val);
    });
  });

  document.getElementById('p1-name').value = App.p1.name;
  document.getElementById('p2-name').value = App.p2.name;

  renderTimerDisplay();
  renderScores();
  renderTurn();
  updateFullscreenIcon();

  // Competitie was al afgelopen toen de app werd gesloten: toon het finale-scherm opnieuw
  if (App.seriesFinished) {
    const p1Wins = App.p1.seriesScore >= App.seriesTarget;
    const p2Wins = App.p2.seriesScore >= App.seriesTarget;
    if (App.gameMode === 'Competitie' && (p1Wins || p2Wins)) {
      triggerWin(App.p1.seriesScore >= App.p2.seriesScore ? 'p1' : 'p2', true);
    } else {
      App.seriesFinished = false; // vlag klopt niet met de stand: opruimen
      saveStateToStorage();
    }
  }

  // Finale-scherm mag niet met Escape gesloten worden
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSeriesFinal()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
});
