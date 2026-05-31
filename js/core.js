// Core Application & Leaderboard Manager for NoorBlocks Platform
let currentGameMode = 'tetris'; // 'tetris' or 'connector'
let mode = 'classic';          // 'classic', 'phrase', 'word'
let currentSurahIdx = 0;        // index in Database.surahIndex
let queue = [];                 // current active block queue
let slotCount = 0;
let filledSlots = new Set();
let curBlockQIdx = 0;
let shuffledOrder = [];

let lives = 3;
let score = 0;
let errors = 0;
let placed = 0;
let startTs = 0;

// On page load
window.addEventListener('DOMContentLoaded', async () => {
  await Database.init();
  populateSurahSelector();
  renderLeaderboard();
});

function populateSurahSelector() {
  const sel = document.getElementById('surah-select');
  if (!sel) return;
  sel.innerHTML = '';
  Database.surahIndex.forEach((s, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${s.surahNum}. ${s.nameEn} (${s.nameAr})`;
    sel.appendChild(opt);
  });
  // Trigger initial metadata label
  changeSurah(0);
}

function changeSurah(val) {
  currentSurahIdx = parseInt(val);
  const surah = Database.surahIndex[currentSurahIdx];
  const metaLbl = document.getElementById('surah-meta');
  if (metaLbl && surah) {
    metaLbl.textContent = surah.meta;
  }
}

function pickMode(m, el) {
  mode = m;
  document.querySelectorAll('.difficulty-row .mrow').forEach(r => r.classList.remove('sel'));
  if (el) el.classList.add('sel');
}

function pickGame(g, el) {
  currentGameMode = g;
  document.querySelectorAll('.game-row .mrow').forEach(r => r.classList.remove('sel'));
  if (el) el.classList.add('sel');
}

// Global UI Screen switcher
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  const target = document.getElementById('s-' + name);
  if (target) target.classList.add('on');
}

// Common Hub startGame route
async function startGame() {
  AudioManager.stopPlayingAudio();
  const surahMeta = Database.surahIndex[currentSurahIdx];
  
  // Show Loading indicator
  const startBtn = document.querySelector('.pbtn');
  if (startBtn) startBtn.innerHTML = '⌛ LOADING...';

  const surahData = await Database.loadSurah(surahMeta.surahNum);
  
  if (startBtn) startBtn.innerHTML = '▶ &nbsp; START';

  if (!surahData) {
    alert("CORS restriction warning: To load Surah database, run the app using a local web server (e.g. python -m http.server) or host it on GitHub Pages. Dynamic fetches are blocked on local file:// files.");
    return;
  }

  // Common resets
  lives = 3; score = 0; errors = 0; placed = 0;
  filledSlots = new Set();
  curBlockQIdx = 0;
  startTs = Date.now();

  // Load HUD
  document.getElementById('g-score').textContent = '0';
  document.getElementById('g-placed').textContent = '0';
  document.getElementById('g-surah-ar').textContent = surahData.nameAr.replace('سُورَةُ ', '');
  document.getElementById('g-surah-en').textContent = surahData.nameEn;

  // Build the game queue
  buildQueue(surahData);

  // Clear score FX
  document.querySelectorAll('.sfx').forEach(el => el.remove());

  // Show screen and launch appropriate engine
  showScreen('game');

  if (currentGameMode === 'tetris') {
    // Show falling zone & instruction label
    document.getElementById('fall-zone').style.display = 'block';
    GameTetris.start();
  } else {
    // Hide falling zone (Connector has its own grid)
    document.getElementById('fall-zone').style.display = 'none';
    GameConnector.start(surahData);
  }
  
  updateHUD();
  updateLives();
}

function buildQueue(surahData) {
  queue = [];
  const surahNum = surahData.surahNum;
  const ayahs = surahData.ayahs;
  ayahs.forEach((a, ai) => {
    const parts = mode === 'classic' ? [a.ar]
                : mode === 'phrase'  ? a.phrases
                :                     a.words;
    parts.forEach((txt, pi) => {
      queue.push({
        ayahIdx: ai,
        partIdx: pi,
        parts: parts.length,
        ar: txt,
        tr: (mode === 'classic' ? a.tr : `[${a.n}] ` + a.tr),
        hint: a.hint,
        slotIdx: queue.length,
        surahNum: surahNum,
        verseNum: a.n,
        wordNum: pi + 1
      });
    });
  });
  slotCount = queue.length;
  // Shuffle display order
  shuffledOrder = [...queue.keys()];
  for (let i = shuffledOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
  }
}

function updateHUD() {
  const scoreVal = document.getElementById('g-score');
  const placedVal = document.getElementById('g-placed');
  const totalVal = document.getElementById('g-total');
  const progPct = document.getElementById('prog-pct');
  const progFill = document.getElementById('prog-fill');
  
  if (scoreVal) scoreVal.textContent = score;
  if (placedVal) placedVal.textContent = placed;
  if (totalVal) totalVal.textContent = slotCount;
  
  const pct = slotCount > 0 ? Math.round((placed / slotCount) * 100) : 0;
  if (progPct) progPct.textContent = pct + '%';
  if (progFill) progFill.style.width = pct + '%';
}

function updateLives() {
  const hs = document.querySelectorAll('#hearts .h');
  hs.forEach((h, idx) => {
    if (idx < lives) {
      h.classList.remove('gone');
    } else {
      h.classList.add('gone');
    }
  });
}

function updateInstruction() {
  if (currentGameMode === 'tetris') {
    GameTetris.updateInstruction();
  } else {
    GameConnector.updateInstruction();
  }
}

function spawnScoreFX(txt, refEl) {
  if (!refEl) return;
  const r = refEl.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'sfx'; d.textContent = txt;
  d.style.left = (r.left + r.width / 2 - 18) + 'px';
  d.style.top = (r.top) + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 800);
}

// ═══════════════════════════════════════
//    LEADERBOARD PERSISTENCE
// ═══════════════════════════════════════
function getLeaderboard() {
  try {
    const data = localStorage.getItem('noorblocks_leaderboard');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveScore(name, scoreVal, accuracyVal) {
  if (!name || name.trim() === '') name = 'Anonymous';
  const surah = Database.surahIndex[currentSurahIdx];
  const item = {
    name: name.substring(0, 15),
    game: currentGameMode === 'tetris' ? 'Blocks' : 'Connector',
    surah: surah ? surah.nameEn : 'Unknown',
    score: scoreVal,
    accuracy: accuracyVal,
    date: new Date().toLocaleDateString()
  };
  
  let board = getLeaderboard();
  board.push(item);
  // Sort descending
  board.sort((a, b) => b.score - a.score);
  // Limit to top 8 scores
  board = board.slice(0, 8);
  
  localStorage.setItem('noorblocks_leaderboard', JSON.stringify(board));
  renderLeaderboard();
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-entries');
  if (!container) return;
  
  const board = getLeaderboard();
  if (board.length === 0) {
    container.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:15px;font-size:12px;">No high scores yet. Be the first!</td></tr>`;
    return;
  }
  
  container.innerHTML = board.map((item, idx) => {
    const crown = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
    return `
      <tr>
        <td style="color:var(--gold);font-weight:bold;text-align:center">${crown}</td>
        <td>${escapeHtml(item.name)}</td>
        <td style="font-size:11px;color:var(--muted)">${item.game} (${item.surah})</td>
        <td style="text-align:right;color:#EAB020;font-weight:bold;">${item.score}</td>
        <td style="text-align:right;font-size:11px;color:var(--greenl)">${item.accuracy}</td>
      </tr>
    `;
  }).join('');
}

function submitLeaderboard() {
  const nameInput = document.getElementById('player-name-input');
  if (!nameInput) return;
  const name = nameInput.value;
  const acc = slotCount + errors > 0 ? Math.round((placed / (placed + errors)) * 100) : 100;
  saveScore(name, score, acc + '%');
  
  // Disable button and input to prevent duplicate submission
  nameInput.disabled = true;
  const subBtn = document.getElementById('leaderboard-sub-btn');
  if (subBtn) {
    subBtn.disabled = true;
    subBtn.textContent = 'Submitted!';
  }
}

function escapeHtml(str) {
  return str.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&#039;');
}

// ═══════════════════════════════════════
//    END STATE HANDLERS
// ═══════════════════════════════════════
function gameComplete() {
  AudioManager.stopPlayingAudio();
  if (currentGameMode === 'tetris') GameTetris.stop();
  else GameConnector.stop();

  const elapsed = Math.round((Date.now() - startTs) / 1000);
  const acc = placed + errors > 0 ? Math.round((placed / (placed + errors)) * 100) : 100;
  
  AudioManager.playTone('complete');
  confetti();

  const surah = Database.surahIndex[currentSurahIdx];
  document.getElementById('r-sub').textContent = `${surah.nameEn} Complete`;
  document.getElementById('r-score').textContent = score;
  document.getElementById('r-acc').textContent = acc + '%';
  document.getElementById('r-time').textContent = elapsed + 's';
  document.getElementById('r-star').textContent = acc >= 90 ? '🌟🌟🌟' : acc >= 70 ? '⭐⭐' : '⭐';
  document.getElementById('r-title').textContent = acc >= 90 ? "Masha'Allah! Perfect!" : acc >= 70 ? "Well Done!" : "Keep Practicing!";
  
  document.getElementById('r-surah-box-t').textContent = `✦ Complete Surah ${surah.nameEn} ✦`;
  
  // Render completed surah list
  const fullSurahDiv = document.getElementById('full-surah');
  if (fullSurahDiv && Database.currentSurah) {
    fullSurahDiv.innerHTML = Database.currentSurah.ayahs.map(a => `${a.ar} <span class="an">${a.n}</span> `).join('');
  }

  // Reset leaderboard input form
  const nameInput = document.getElementById('player-name-input');
  if (nameInput) {
    nameInput.value = '';
    nameInput.disabled = false;
  }
  const subBtn = document.getElementById('leaderboard-sub-btn');
  if (subBtn) {
    subBtn.disabled = false;
    subBtn.textContent = 'Submit';
  }

  showScreen('result');
}

function gameOver() {
  AudioManager.stopPlayingAudio();
  if (currentGameMode === 'tetris') GameTetris.stop();
  else GameConnector.stop();

  const surah = Database.surahIndex[currentSurahIdx];
  document.getElementById('r-star').textContent = '💔';
  document.getElementById('r-title').textContent = 'Keep Practicing!';
  document.getElementById('r-sub').textContent = "You ran out of hearts — you've got this!";
  document.getElementById('r-score').textContent = score;
  document.getElementById('r-acc').textContent = '—';
  document.getElementById('r-time').textContent = Math.round((Date.now() - startTs) / 1000) + 's';
  
  document.getElementById('r-surah-box-t').textContent = `✦ Complete Surah ${surah.nameEn} ✦`;
  
  const fullSurahDiv = document.getElementById('full-surah');
  if (fullSurahDiv && Database.currentSurah) {
    fullSurahDiv.innerHTML = Database.currentSurah.ayahs.map(a => `${a.ar} <span class="an">${a.n}</span> `).join('');
  }

  // Hide high score submission on loss
  const nameInput = document.getElementById('player-name-input');
  if (nameInput) nameInput.disabled = true;
  const subBtn = document.getElementById('leaderboard-sub-btn');
  if (subBtn) {
    subBtn.disabled = true;
    subBtn.textContent = 'Locked';
  }

  showScreen('result');
}

function restartGame() {
  startGame();
}

function goTitle() {
  AudioManager.stopPlayingAudio();
  if (currentGameMode === 'tetris') GameTetris.stop();
  else GameConnector.stop();
  showScreen('title');
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const gameScr = document.getElementById('s-game');
  if (!gameScr || !gameScr.classList.contains('on')) return;
  if (e.key.toLowerCase() === 'h') {
    if (currentGameMode === 'tetris') {
      GameTetris.hearBlock();
    }
  }
});

// Confetti effects
function confetti() {
  const cv = document.getElementById('ccanvas');
  if (!cv) return;
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const ctx = cv.getContext('2d');
  const P = Array.from({length:90}, () => ({
    x: Math.random() * cv.width, y: Math.random() * cv.height - cv.height,
    r: Math.random() * 5 + 3, d: Math.random() * 80,
    c: ['#C8960C', '#17784A', '#EAB020', '#0E8A7A', '#F0E8D0'][Math.floor(Math.random() * 5)],
    t: 0, ti: (Math.random() * .08) + .04
  }));
  let a = 0, f = 0;
  (function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height); a += .01; f++;
    P.forEach(p => {
      p.ti && (p.t += p.ti);
      p.y += (Math.cos(a + p.d) + 1.3 + p.r / 2) * 1.4;
      p.x += Math.sin(a) * 1.2;
      const tlt = Math.sin(p.t) * 12;
      ctx.beginPath(); ctx.lineWidth = p.r / 2; ctx.strokeStyle = p.c;
      ctx.moveTo(p.x + tlt + p.r / 4, p.y); ctx.lineTo(p.x + tlt, p.y + tlt + p.r / 4);
      ctx.stroke();
    });
    if (f < 220) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}
