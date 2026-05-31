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

let currentTheme = 'classic';   // 'classic' or 'kids'
let streak = 0;                 // correct streak counter

let currentUser = null;
let currentUserProfile = null;
let currentLeaderboardTab = 'local'; // 'local', 'global', 'friends'
let activeRoom = null;
let activeRoomChannel = null;
let lobbyParticipants = [];

// On page load
window.addEventListener('DOMContentLoaded', async () => {
  await Database.init();
  populateSurahSelector();
  
  // Load saved theme
  const savedTheme = localStorage.getItem('noorblocks_theme') || 'classic';
  setTheme(savedTheme);

  // Initialize Online status and Auth
  if (typeof db !== 'undefined' && db.isOnline()) {
    document.getElementById('auth-btn-login').style.display = 'inline-block';
    document.getElementById('leaderboard-tabs').style.display = 'flex';
    
    db.onAuthChange((user, profile) => {
      currentUser = user;
      currentUserProfile = profile;
      if (user) {
        document.getElementById('auth-btn-login').style.display = 'none';
        document.getElementById('auth-user-badge').style.display = 'flex';
        document.getElementById('auth-user-name').textContent = profile ? (profile.display_name || profile.username) : user.email.split('@')[0];
        document.getElementById('multiplayer-card').style.display = 'block';
        
        // Auto pre-fill player name for results leaderboard input
        const nameInput = document.getElementById('player-name-input');
        if (nameInput) nameInput.value = profile ? profile.username : '';

        // If there was a pending room join code, auto-join now
        if (window.pendingRoomJoinCode) {
          const code = window.pendingRoomJoinCode;
          window.pendingRoomJoinCode = null;
          handleJoinRoom(code);
        } else {
          setLeaderboardTab('global');
        }
      } else {
        document.getElementById('auth-btn-login').style.display = 'inline-block';
        document.getElementById('auth-user-badge').style.display = 'none';
        document.getElementById('multiplayer-card').style.display = 'none';
        setLeaderboardTab('local');
      }
    });

    // Check if routed directly with room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
      setTimeout(() => {
        if (!currentUser) {
          alert("To join lobby room " + roomCode + ", please log in or sign up first!");
          openAuthModal();
          window.pendingRoomJoinCode = roomCode;
        } else {
          handleJoinRoom(roomCode);
        }
      }, 800);
    }
  } else {
    // Offline mode
    setLeaderboardTab('local');
  }
});

function setTheme(name) {
  currentTheme = name;
  localStorage.setItem('noorblocks_theme', name);
  
  const body = document.body;
  const btnClassic = document.getElementById('theme-btn-classic');
  const btnKids = document.getElementById('theme-btn-kids');
  
  if (name === 'kids') {
    body.classList.add('theme-kids');
    if (btnKids) btnKids.classList.add('sel');
    if (btnClassic) btnClassic.classList.remove('sel');
  } else {
    body.classList.remove('theme-kids');
    if (btnClassic) btnClassic.classList.add('sel');
    if (btnKids) btnKids.classList.remove('sel');
  }
}

function registerCorrectPlacement(basePoints, element) {
  streak++;
  let multiplier = 1;
  let bonusText = "";
  
  if (streak >= 5) {
    multiplier = 3;
    bonusText = `Super Combo x3! 🔥 (+${basePoints * 2} Bonus)`;
  } else if (streak >= 3) {
    multiplier = 2;
    bonusText = `Combo x2! 🌟 (+${basePoints} Bonus)`;
  }
  
  const finalPoints = basePoints * multiplier;
  
  if (bonusText && currentTheme === 'kids') {
    spawnComboPopup(bonusText, element);
  }
  
  return finalPoints;
}

function registerWrongPlacement() {
  streak = 0;
}

function spawnComboPopup(text, element) {
  const popup = document.createElement('div');
  popup.className = 'combo-popup';
  popup.textContent = text;
  
  let x = window.innerWidth / 2 - 80;
  let y = window.innerHeight / 3;
  
  if (element) {
    const rect = element.getBoundingClientRect();
    x = rect.left + rect.width / 2 - 60;
    y = rect.top - 35;
  }
  
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  
  document.body.appendChild(popup);
  
  setTimeout(() => popup.remove(), 1000);
}

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

async function changeSurah(val) {
  currentSurahIdx = parseInt(val);
  const surahMeta = Database.surahIndex[currentSurahIdx];
  const metaLbl = document.getElementById('surah-meta');
  if (metaLbl && surahMeta) {
    metaLbl.textContent = surahMeta.meta;
  }
  
  // Asynchronously load the selected Surah JSON to populate the range selects
  const surahData = await Database.loadSurah(surahMeta.surahNum);
  if (surahData) {
    populateRangeSelectors(surahData);
  }
}

function populateRangeSelectors(surahData) {
  const startSel = document.getElementById('range-start');
  const endSel = document.getElementById('range-end');
  if (!startSel || !endSel || !surahData) return;
  
  startSel.innerHTML = '';
  endSel.innerHTML = '';
  
  const total = surahData.ayahs.length;
  
  // Populate From Ayah select
  for (let i = 1; i <= total; i++) {
    const optStart = document.createElement('option');
    optStart.value = i;
    optStart.textContent = i;
    startSel.appendChild(optStart);
  }

  // Helper function to update the end selections based on selected startAyah
  const updateEndSelector = () => {
    const startVal = parseInt(startSel.value) || 1;
    const startAyahObj = surahData.ayahs[startVal - 1];
    const startPage = (startAyahObj && startAyahObj.words[0]) ? startAyahObj.words[0].page : 0;
    
    // Save current selection of end select if valid
    const prevEndVal = parseInt(endSel.value);
    
    endSel.innerHTML = '';
    
    // We only allow selecting end values that:
    // 1. are >= startVal
    // 2. belong to the same page as the startVal Ayah
    for (let i = startVal; i <= total; i++) {
      const currentAyahObj = surahData.ayahs[i - 1];
      const currentPage = (currentAyahObj && currentAyahObj.words[0]) ? currentAyahObj.words[0].page : 0;
      
      if (currentPage === startPage) {
        const optEnd = document.createElement('option');
        optEnd.value = i;
        optEnd.textContent = i;
        endSel.appendChild(optEnd);
      } else {
        // If we encounter a different page, we stop since the range must be contiguous on the same page!
        break;
      }
    }
    
    // Restore selection or default to the last option on the same page
    if (prevEndVal >= startVal && endSel.querySelector(`option[value="${prevEndVal}"]`)) {
      endSel.value = prevEndVal;
    } else {
      endSel.selectedIndex = endSel.options.length - 1;
    }
  };

  startSel.onchange = updateEndSelector;
  
  // Initial run to populate the end dropdown and select the whole page (first page) by default
  startSel.value = 1;
  updateEndSelector();
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
  lives = 3; score = 0; errors = 0; placed = 0; streak = 0;
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

  const fbBlock = document.getElementById('fblock');
  const spdBadge = document.getElementById('speed-badge');

  if (currentGameMode === 'tetris') {
    if (fbBlock) fbBlock.style.display = 'block';
    if (spdBadge) spdBadge.style.display = 'block';
    GameTetris.start();
  } else {
    if (fbBlock) fbBlock.style.display = 'none';
    if (spdBadge) spdBadge.style.display = 'none';
    GameConnector.start(surahData);
  }
  
  updateHUD();
  updateLives();
}

function buildQueue(surahData) {
  queue = [];
  const surahNum = surahData.surahNum;
  
  const startAyah = parseInt(document.getElementById('range-start').value) || 1;
  const endAyah = parseInt(document.getElementById('range-end').value) || surahData.ayahs.length;
  
  let absoluteSlotIdx = 0;
  surahData.ayahs.forEach((a) => {
    const parts = mode === 'classic' ? [a.ar]
                : mode === 'phrase'  ? a.phrases
                :                     a.words.map(w => w.ar);
    parts.forEach((txt, pi) => {
      if (a.n >= startAyah && a.n <= endAyah) {
        let powerup = null;
        if (Math.random() < 0.15) {
          const rand = Math.random();
          if (currentGameMode === 'tetris') {
            if (rand < 0.33) powerup = 'heart';
            else if (rand < 0.66) powerup = 'clock';
            else powerup = 'hint';
          } else {
            if (rand < 0.5) powerup = 'heart';
            else powerup = 'hint';
          }
        }
        queue.push({
          ayahIdx: a.n - startAyah, // Offset index relative to our playing range
          partIdx: pi,
          parts: parts.length,
          ar: txt,
          tr: (mode === 'classic' ? a.tr : `[${a.n}] ` + a.tr),
          hint: a.hint,
          slotIdx: absoluteSlotIdx, // Map to absolute slot index in full Surah layout
          surahNum: surahNum,
          verseNum: a.n,
          wordNum: pi + 1,
          powerup: powerup
        });
      }
      absoluteSlotIdx++;
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

  if (activeRoom) {
    broadcastProgress(pct, score, lives, 'playing');
  }
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

  if (activeRoom) {
    const pct = slotCount > 0 ? Math.round((placed / slotCount) * 100) : 0;
    broadcastProgress(pct, score, lives, 'playing');
  }
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

async function renderLeaderboard() {
  const container = document.getElementById('leaderboard-entries');
  if (!container) return;
  
  const surah = Database.surahIndex[currentSurahIdx];
  const surahNum = surah ? surah.surahNum : null;

  if (currentLeaderboardTab === 'local' || !db.isOnline()) {
    document.getElementById('leaderboard-title-text').textContent = "🏆 Local Scores";
    const board = getLeaderboard();
    if (board.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:15px;font-size:12px;">No local high scores yet. Be the first!</td></tr>`;
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
  } else {
    document.getElementById('leaderboard-title-text').textContent = currentLeaderboardTab === 'global' ? "🌍 Global Scores" : "👥 Friends Scores";
    container.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:15px;font-size:12px;">Loading scores...</td></tr>`;

    let board = [];
    if (currentLeaderboardTab === 'global') {
      board = await db.fetchGlobalLeaderboard(surahNum, mode, currentGameMode);
    } else {
      board = await db.fetchFriendsLeaderboard(surahNum, mode, currentGameMode);
    }

    if (board.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:15px;font-size:12px;">No scores found for this Surah/Mode.</td></tr>`;
      return;
    }

    container.innerHTML = board.map((item, idx) => {
      const crown = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
      const name = item.profiles ? (item.profiles.display_name || item.profiles.username) : 'Player';
      return `
        <tr>
          <td style="color:var(--gold);font-weight:bold;text-align:center">${crown}</td>
          <td>${escapeHtml(name)}</td>
          <td style="font-size:11px;color:var(--muted)">${currentGameMode === 'tetris' ? 'NoorBlocks' : 'Connector'} (${surah ? surah.nameEn : 'Surah'})</td>
          <td style="text-align:right;color:#EAB020;font-weight:bold;">${item.score}</td>
          <td style="text-align:right;font-size:11px;color:var(--greenl)">${Math.round(item.accuracy)}%</td>
        </tr>
      `;
    }).join('');
  }
}

async function submitLeaderboard() {
  const nameInput = document.getElementById('player-name-input');
  if (!nameInput) return;
  const name = nameInput.value;
  const acc = slotCount + errors > 0 ? Math.round((placed / (placed + errors)) * 100) : 100;
  
  saveScore(name, score, acc + '%');

  if (db.isOnline() && currentUser) {
    const surah = Database.surahIndex[currentSurahIdx];
    await db.uploadScore(surah.surahNum, mode, currentGameMode, score, acc);
  }
  
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
  
  const startAyah = parseInt(document.getElementById('range-start').value) || 1;
  const endAyah = parseInt(document.getElementById('range-end').value) || Database.currentSurah.ayahs.length;
  
  document.getElementById('r-sub').textContent = `${surah ? surah.nameEn : 'Surah'} (Ayahs ${startAyah}-${endAyah}) Complete`;
  document.getElementById('r-score').textContent = score;
  document.getElementById('r-acc').textContent = acc + '%';
  document.getElementById('r-time').textContent = elapsed + 's';
  document.getElementById('r-star').textContent = acc >= 90 ? '🌟🌟🌟' : acc >= 70 ? '⭐⭐' : '⭐';
  document.getElementById('r-title').textContent = acc >= 90 ? "Masha'Allah! Perfect!" : acc >= 70 ? "Well Done!" : "Keep Practicing!";
  
  document.getElementById('r-surah-box-t').textContent = `✦ Complete Ayahs ${startAyah}-${endAyah} ✦`;
  
  // Render completed surah list (only of the active range)
  const fullSurahDiv = document.getElementById('full-surah');
  if (fullSurahDiv && Database.currentSurah) {
    const activeAyahs = Database.currentSurah.ayahs.filter(a => a.n >= startAyah && a.n <= endAyah);
    fullSurahDiv.innerHTML = activeAyahs.map(a => `${a.ar} <span class="an">${a.n}</span> `).join('');
  }

  // Reset leaderboard input form & Hide/Show options based on online mode
  const nameInput = document.getElementById('player-name-input');
  const subBtn = document.getElementById('leaderboard-sub-btn');
  const resultsBox = document.getElementById('lobby-results-box');

  if (activeRoom) {
    // Hide standard leaderboard input and show lobby results
    document.querySelector('.leaderboard-input-row').style.display = 'none';
    resultsBox.style.display = 'block';
    
    // Update participant status in DB and broadcast completion
    db.updateParticipantStatus(activeRoom.id, 'finished', score, acc);
    broadcastProgress(100, score, lives, 'finished');
    renderLobbyResultsRankings();

    // Query periodically to show final rankings
    window.lobbyResultsInterval = setInterval(renderLobbyResultsRankings, 3000);
  } else {
    document.querySelector('.leaderboard-input-row').style.display = 'flex';
    resultsBox.style.display = 'none';

    if (nameInput) {
      nameInput.value = currentUserProfile ? currentUserProfile.username : '';
      nameInput.disabled = false;
    }
    if (subBtn) {
      subBtn.disabled = false;
      subBtn.textContent = 'Submit';
    }
  }

  // Hide multiplayer HUD overlay
  document.getElementById('multiplayer-hud').style.display = 'none';

  showScreen('result');
}

function gameOver() {
  AudioManager.stopPlayingAudio();
  if (currentGameMode === 'tetris') GameTetris.stop();
  else GameConnector.stop();

  const surah = Database.surahIndex[currentSurahIdx];
  
  const startAyah = parseInt(document.getElementById('range-start').value) || 1;
  const endAyah = parseInt(document.getElementById('range-end').value) || Database.currentSurah.ayahs.length;

  document.getElementById('r-star').textContent = '💔';
  document.getElementById('r-title').textContent = 'Keep Practicing!';
  document.getElementById('r-sub').textContent = "You ran out of hearts — you've got this!";
  document.getElementById('r-score').textContent = score;
  document.getElementById('r-acc').textContent = '—';
  document.getElementById('r-time').textContent = Math.round((Date.now() - startTs) / 1000) + 's';
  
  document.getElementById('r-surah-box-t').textContent = `✦ Complete Ayahs ${startAyah}-${endAyah} ✦`;
  
  const fullSurahDiv = document.getElementById('full-surah');
  if (fullSurahDiv && Database.currentSurah) {
    const activeAyahs = Database.currentSurah.ayahs.filter(a => a.n >= startAyah && a.n <= endAyah);
    fullSurahDiv.innerHTML = activeAyahs.map(a => `${a.ar} <span class="an">${a.n}</span> `).join('');
  }

  // Hide high score submission on loss
  const nameInput = document.getElementById('player-name-input');
  const subBtn = document.getElementById('leaderboard-sub-btn');
  const resultsBox = document.getElementById('lobby-results-box');

  if (activeRoom) {
    document.querySelector('.leaderboard-input-row').style.display = 'none';
    resultsBox.style.display = 'block';

    const progressPct = slotCount > 0 ? Math.round((placed / slotCount) * 100) : 0;
    db.updateParticipantStatus(activeRoom.id, 'failed', score, 0);
    broadcastProgress(progressPct, score, 0, 'failed');
    renderLobbyResultsRankings();

    window.lobbyResultsInterval = setInterval(renderLobbyResultsRankings, 3000);
  } else {
    document.querySelector('.leaderboard-input-row').style.display = 'flex';
    resultsBox.style.display = 'none';

    if (nameInput) nameInput.disabled = true;
    if (subBtn) {
      subBtn.disabled = true;
      subBtn.textContent = 'Locked';
    }
  }

  document.getElementById('multiplayer-hud').style.display = 'none';

  showScreen('result');
}

function restartGame() {
  if (window.lobbyResultsInterval) {
    clearInterval(window.lobbyResultsInterval);
    window.lobbyResultsInterval = null;
  }

  if (activeRoom) {
    // If in multiplayer room, returning goes back to lobby, not straight to gameplay
    enterLobbyView();
  } else {
    startGame();
  }
}

function goTitle() {
  if (window.lobbyResultsInterval) {
    clearInterval(window.lobbyResultsInterval);
    window.lobbyResultsInterval = null;
  }

  AudioManager.stopPlayingAudio();
  if (currentGameMode === 'tetris') GameTetris.stop();
  else GameConnector.stop();

  if (activeRoom) {
    handleLeaveRoom();
  } else {
    showScreen('title');
  }
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

// ═══════════════════════════════════════
//    AUTH & SOCIAL MODALS HELPERS
// ═══════════════════════════════════════
function openAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'flex';
  document.getElementById('auth-error-msg').textContent = '';
}

function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'none';
}

function setAuthTab(tab) {
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('auth-error-msg').textContent = '';
}

async function handleAuthSubmit(event, action) {
  event.preventDefault();
  const errorMsg = document.getElementById('auth-error-msg');
  errorMsg.textContent = '';

  if (action === 'login') {
    const username = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;
    const { error } = await db.login(username, pass);
    if (error) {
      errorMsg.textContent = error.message;
    } else {
      closeAuthModal();
    }
  } else {
    const username = document.getElementById('signup-username').value;
    const displayName = document.getElementById('signup-displayname').value;
    const pass = document.getElementById('signup-password').value;
    
    const { error } = await db.signUp(username, pass, displayName);
    if (error) {
      errorMsg.textContent = error.message;
    } else {
      alert("Registration successful! You can now log in.");
      setAuthTab('login');
      // Auto-populate login username
      const loginUserField = document.getElementById('login-username');
      if (loginUserField) loginUserField.value = username;
    }
  }
}

async function handleLogout() {
  await db.logout();
  activeRoom = null;
  if (activeRoomChannel) {
    activeRoomChannel.unsubscribe();
    activeRoomChannel = null;
  }
  showScreen('title');
}

function openSocialModal() {
  const modal = document.getElementById('modal-social');
  if (modal) modal.style.display = 'flex';
  document.getElementById('social-search-input').value = '';
  document.getElementById('social-search-results').style.display = 'none';
  loadSocialData();
}

function closeSocialModal() {
  const modal = document.getElementById('modal-social');
  if (modal) modal.style.display = 'none';
}

async function handleSocialSearch() {
  const searchStr = document.getElementById('social-search-input').value;
  const container = document.getElementById('social-search-results');
  if (!searchStr.trim()) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `<div style="font-size: 11px; color: var(--muted); text-align: center; padding: 4px;">Searching...</div>`;

  const results = await db.searchProfiles(searchStr.trim());
  if (results.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: var(--muted); text-align: center; padding: 4px;">No users found matching "${escapeHtml(searchStr)}".</div>`;
    return;
  }

  const friendships = await db.getFriendships();
  
  container.innerHTML = results.map(p => {
    if (p.id === currentUser.id) return '';
    
    const statusObj = friendships.find(f => f.sender_id === p.id || f.receiver_id === p.id);
    let buttonHtml = `<button class="mrow" onclick="handleSendFriendRequest('${p.id}', this)" style="margin: 0; padding: 4px 8px; font-size: 9px; cursor: pointer; box-shadow: none; border-radius: 6px;">➕ Add</button>`;
    if (statusObj) {
      if (statusObj.status === 'accepted') {
        buttonHtml = `<span style="font-size: 9px; color: var(--greenl);">✓ Friends</span>`;
      } else {
        buttonHtml = `<span style="font-size: 9px; color: var(--gold);">⏳ Pending</span>`;
      }
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(200,150,12,0.1);">
        <span style="font-size: 11px; font-weight: 500; color: #1c1b18;">${escapeHtml(p.display_name || p.username)} (@${escapeHtml(p.username)})</span>
        ${buttonHtml}
      </div>
    `;
  }).join('');
}

async function handleSendFriendRequest(targetId, btnElement) {
  btnElement.disabled = true;
  btnElement.textContent = "Sending...";
  const { error } = await db.sendFriendRequest(targetId);
  if (error) {
    alert(error.message);
    btnElement.disabled = false;
    btnElement.textContent = "Add";
  } else {
    btnElement.parentElement.innerHTML = `<span style="font-size: 9px; color: var(--gold);">⏳ Pending</span>`;
    loadSocialData();
  }
}

async function loadSocialData() {
  if (!db.isOnline() || !currentUser) return;
  const friendships = await db.getFriendships();
  
  const pendingContainer = document.getElementById('social-pending-list');
  const friendsContainer = document.getElementById('social-friends-list');

  let pendingHtml = '';
  let friendsHtml = '';

  friendships.forEach(f => {
    const isSender = f.sender_id === currentUser.id;
    const friendProfile = isSender ? f.receiver : f.sender;
    if (!friendProfile) return;

    if (f.status === 'pending') {
      if (!isSender) {
        pendingHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(200,150,12,0.04); border: 1.5px solid rgba(200,150,12,0.2); border-radius: 8px;">
            <span style="font-size: 11px; font-weight: 600; color: #1c1b18;">@${escapeHtml(friendProfile.username)}</span>
            <button class="mrow" onclick="handleAcceptFriend('${f.id}', this)" style="margin: 0; padding: 4px 8px; font-size: 9px; font-weight: 600; cursor: pointer; box-shadow: none; border-radius: 6px;">Accept</button>
          </div>
        `;
      }
    } else if (f.status === 'accepted') {
      friendsHtml += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(200,150,12,0.02); border: 1px solid rgba(200,150,12,0.1); border-radius: 8px;">
          <span style="font-size: 11px; font-weight: 600; color: #1c1b18;">${escapeHtml(friendProfile.display_name || friendProfile.username)} (@${escapeHtml(friendProfile.username)})</span>
          <span style="font-size: 9px; color: var(--greenl);">✓ Friends</span>
        </div>
      `;
    }
  });

  if (pendingHtml) {
    document.getElementById('social-pending-section').style.display = 'block';
    pendingContainer.innerHTML = pendingHtml;
  } else {
    document.getElementById('social-pending-section').style.display = 'none';
  }

  friendsContainer.innerHTML = friendsHtml || `<div style="font-size: 11px; color: var(--muted); text-align: center; padding: 10px;">Add some friends to compete against!</div>`;
}

async function handleAcceptFriend(friendshipId, btnElement) {
  btnElement.disabled = true;
  btnElement.textContent = "Accepting...";
  await db.acceptFriendRequest(friendshipId);
  loadSocialData();
}

// ═══════════════════════════════════════
//    MULTIPLAYER LOBBY ROOMS HELPERS
// ═══════════════════════════════════════
async function handleCreateRoom() {
  const surah = Database.surahIndex[currentSurahIdx];
  const startAyah = parseInt(document.getElementById('range-start').value) || 1;
  const endAyah = parseInt(document.getElementById('range-end').value) || surah.ayahs.length;

  const { room, error } = await db.createRoom(surah.surahNum, startAyah, endAyah, mode, currentGameMode);
  if (error) {
    alert("Error creating room: " + error);
    return;
  }

  activeRoom = room;
  enterLobbyView();
}

async function handleJoinRoom(codeParam = null) {
  const code = codeParam || document.getElementById('room-code-input').value;
  if (!code || code.trim().length !== 6) {
    alert("Please enter a valid 6-character room code.");
    return;
  }

  const { room, error } = await db.joinRoom(code);
  if (error) {
    alert("Error joining room: " + error);
    return;
  }

  activeRoom = room;
  enterLobbyView();
}

function enterLobbyView() {
  // Clear any past lobby results interval
  if (window.lobbyResultsInterval) {
    clearInterval(window.lobbyResultsInterval);
    window.lobbyResultsInterval = null;
  }

  showScreen('s-lobby');
  document.getElementById('lobby-code').textContent = activeRoom.invite_code;
  
  // Set Surah info
  const surah = Database.surahIndex.find(s => s.surahNum === activeRoom.surah_num);
  document.getElementById('lobby-surah-info').textContent = `${surah ? surah.nameEn : 'Surah'} · Ayahs ${activeRoom.range_start}-${activeRoom.range_end} · ${activeRoom.difficulty.toUpperCase()} · ${activeRoom.game_mode.toUpperCase()}`;

  setupRoomRealtime();
}

function setupRoomRealtime() {
  if (activeRoomChannel) {
    activeRoomChannel.unsubscribe();
  }

  activeRoomChannel = db.setupRoomChannel(
    activeRoom.id,
    refreshLobbyParticipants,
    onGameStartBroadcastReceived,
    onPlayerProgressBroadcastReceived
  );

  refreshLobbyParticipants();
}

async function refreshLobbyParticipants() {
  if (!activeRoom) return;

  const list = await db.getRoomParticipants(activeRoom.id);
  lobbyParticipants = list;

  const container = document.getElementById('lobby-participants-list');
  const countSpan = document.getElementById('lobby-count');
  countSpan.textContent = list.length;

  // Host buttons check
  const startBtn = document.getElementById('lobby-start-btn');
  if (activeRoom.host_id === currentUser.id) {
    startBtn.style.display = 'block';
  } else {
    startBtn.style.display = 'none';
  }

  // Draw 8 slots
  let slotsHtml = '';
  for (let i = 0; i < 8; i++) {
    const p = list[i];
    if (p) {
      const isHost = p.profiles.id === activeRoom.host_id;
      const statusLabel = isHost ? 'HOST' : p.status === 'ready' ? 'READY' : 'JOINED';
      const statusClass = isHost ? 'joined' : p.status === 'ready' ? 'ready' : 'joined';
      
      slotsHtml += `
        <div class="lobby-slot">
          <span style="font-size: 12px; font-weight: 600; color: #1c1b18;">${escapeHtml(p.profiles.display_name || p.profiles.username)}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
      `;
    } else {
      slotsHtml += `
        <div class="lobby-slot empty">
          <span>Open Slot</span>
        </div>
      `;
    }
  }
  container.innerHTML = slotsHtml;
}

function copyInviteLink() {
  if (!activeRoom) return;
  const link = `${window.location.origin}${window.location.pathname}?room=${activeRoom.invite_code}`;
  navigator.clipboard.writeText(link).then(() => {
    alert("Invite link copied to clipboard: " + link);
  });
}

async function handleLeaveRoom() {
  if (activeRoom) {
    await db.updateParticipantStatus(activeRoom.id, 'invited');
    if (activeRoom.host_id === currentUser.id) {
      await db.setRoomStatus(activeRoom.id, 'finished');
    }
  }
  if (activeRoomChannel) {
    activeRoomChannel.unsubscribe();
    activeRoomChannel = null;
  }
  activeRoom = null;
  showScreen('title');
}

// Host triggers game start
async function handleStartRoomGame() {
  if (!activeRoom || !activeRoomChannel) return;
  
  await db.setRoomStatus(activeRoom.id, 'playing');
  await db.updateParticipantStatus(activeRoom.id, 'playing');

  activeRoomChannel.channel.send({
    type: 'broadcast',
    event: 'start_game',
    payload: { start: true }
  });

  launchRoomGame();
}

function onGameStartBroadcastReceived(payload) {
  launchRoomGame();
}

function launchRoomGame() {
  document.getElementById('range-start').value = activeRoom.range_start;
  document.getElementById('range-end').value = activeRoom.range_end;
  
  currentGameMode = activeRoom.game_mode;
  mode = activeRoom.difficulty;
  
  const surahIdx = Database.surahIndex.findIndex(s => s.surahNum === activeRoom.surah_num);
  changeSurah(surahIdx);

  // Clear opponent HUD and show it
  document.getElementById('multiplayer-hud').style.display = 'flex';
  document.getElementById('multiplayer-hud').innerHTML = '';
  opponentStates = {};

  // Start game
  startGame();
}

let opponentStates = {};

function onPlayerProgressBroadcastReceived(payload) {
  const { userId, username, progress, scoreVal, heartsVal, status } = payload;
  opponentStates[userId] = { username, progress, scoreVal, heartsVal, status };
  updateMultiplayerHUD();
}

function broadcastProgress(progressPct, scoreVal, heartsVal, statusStr = 'playing') {
  if (!activeRoom || !activeRoomChannel) return;
  
  activeRoomChannel.channel.send({
    type: 'broadcast',
    event: 'player_progress',
    payload: {
      userId: currentUser.id,
      username: currentUserProfile.display_name || currentUserProfile.username,
      progress: progressPct,
      scoreVal: scoreVal,
      heartsVal: heartsVal,
      status: statusStr
    }
  });
}

function updateMultiplayerHUD() {
  const container = document.getElementById('multiplayer-hud');
  if (!container) return;

  let html = '';
  Object.keys(opponentStates).forEach(uid => {
    const opp = opponentStates[uid];
    const livesLabel = opp.status === 'failed' ? '💀 OUT' : opp.status === 'finished' ? '✓ DONE' : '❤️ ' + opp.heartsVal;
    
    html += `
      <div class="hud-opponent-row">
        <div class="hud-opponent-name">${escapeHtml(opp.username)}</div>
        <div class="hud-opponent-stats">
          <span>${opp.scoreVal} pts</span>
          <span>${livesLabel}</span>
        </div>
        <div class="hud-opponent-bar-wrap">
          <div class="hud-opponent-bar-fill" style="width: ${opp.progress}%;"></div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

async function renderLobbyResultsRankings() {
  if (!activeRoom) return;
  const list = await db.getRoomParticipants(activeRoom.id);
  
  const sorted = [...list].sort((a, b) => {
    const scoreA = a.final_score || 0;
    const scoreB = b.final_score || 0;
    return scoreB - scoreA;
  });

  const container = document.getElementById('lobby-results-list');
  container.innerHTML = sorted.map((p, idx) => {
    const crown = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
    const name = p.profiles.display_name || p.profiles.username;
    let scoreText = 'Playing...';
    if (p.status === 'finished') {
      scoreText = `${p.final_score} pts (${Math.round(p.final_accuracy)}% Acc)`;
    } else if (p.status === 'failed') {
      scoreText = `Failed (${p.final_score} pts)`;
    } else if (p.status === 'joined') {
      scoreText = 'Lobby';
    }
    
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px; background: rgba(200,150,12,0.03); border: 1px solid rgba(200,150,12,0.1); border-radius: 6px; font-size: 11px;">
        <span style="font-weight: 600; color: #1c1b18;">${crown} ${escapeHtml(name)}</span>
        <span style="color: var(--gold); font-weight: 700;">${scoreText}</span>
      </div>
    `;
  }).join('');
}
