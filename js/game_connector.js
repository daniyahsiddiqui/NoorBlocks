// Ayah Connector Game Engine
const GameConnector = {
  active: false,
  bubbles: [],
  lastTapTime: 0,
  lastTapBubbleId: null,
  rainbowHintActive: false,

  start(surahData) {
    this.active = true;
    this.bubbles = [];
    this.lastTapTime = 0;
    this.lastTapBubbleId = null;
    this.rainbowHintActive = false;

    this.buildSlotsUI();
    this.setupConnectorCanvas();
    this.updateInstruction();
  },

  stop() {
    this.active = false;
    this.rainbowHintActive = false;
    const canvas = document.getElementById('connector-canvas');
    if (canvas) canvas.remove();
  },

  buildSlotsUI() {
    // Reuses the same Mushaf layout structure
    const c = document.getElementById('slots-container');
    if (!c) return;
    c.innerHTML = '';

    const surah = Database.currentSurah;
    if (!surah) return;

    const header = document.createElement('div');
    header.className = 'mushaf-header-banner';
    header.innerHTML = `
      <span class="mushaf-header-title">${surah.nameAr}</span>
      <span class="mushaf-header-info">(${surah.meta})</span>
    `;
    c.appendChild(header);

    // Group the text flow by lines
    const linesMap = {};
    const linesOrder = [];

    let absoluteSlotIdx = 0;
    const startAyah = parseInt(document.getElementById('range-start').value) || 1;
    const endAyah = parseInt(document.getElementById('range-end').value) || surah.ayahs.length;

    surah.ayahs.forEach((a) => {
      let wordIdx = 0;
      const parts = mode === 'classic' ? [a.ar]
                  : mode === 'phrase'  ? a.phrases
                  :                     a.words.map(w => w.ar);
      
      parts.forEach((txt, pi) => {
        let pageNum = 0;
        let lineNum = 0;

        if (mode === 'classic') {
          pageNum = a.words[0] ? a.words[0].page : 0;
          lineNum = a.words[0] ? a.words[0].line : 0;
        } else if (mode === 'word') {
          pageNum = a.words[pi] ? a.words[pi].page : 0;
          lineNum = a.words[pi] ? a.words[pi].line : 0;
        } else { // phrase mode
          const phraseWordsCount = txt.split(/\s+/).filter(Boolean).length;
          const firstWord = a.words[wordIdx] || a.words[0];
          pageNum = firstWord ? firstWord.page : 0;
          lineNum = firstWord ? firstWord.line : 0;
          wordIdx += phraseWordsCount;
        }

        const key = `${pageNum}_${lineNum}`;
        if (!linesMap[key]) {
          linesMap[key] = [];
          linesOrder.push(key);
        }

        linesMap[key].push({
          type: 'slot',
          idx: absoluteSlotIdx,
          txt: txt,
          ayahNum: a.n,
          isInteractive: (a.n >= startAyah && a.n <= endAyah)
        });

        if (a.n < startAyah || a.n > endAyah) {
          filledSlots.add(absoluteSlotIdx);
        }

        absoluteSlotIdx++;
      });

      // Place decorative ayah marker ornament at the end of the last part of each verse
      const lastWord = a.words[a.words.length - 1];
      const mPage = lastWord ? lastWord.page : 0;
      const mLine = lastWord ? lastWord.line : 0;
      const mKey = `${mPage}_${mLine}`;

      if (!linesMap[mKey]) {
        linesMap[mKey] = [];
        linesOrder.push(mKey);
      }

      linesMap[mKey].push({
        type: 'marker',
        ayahNum: a.n
      });
    });

    const textFlow = document.createElement('div');
    textFlow.className = 'mushaf-text-flow';

    linesOrder.forEach((key, lIdx) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'mushaf-line';
      if (lIdx === linesOrder.length - 1) {
        lineDiv.classList.add('last-line');
      }
      
      const elements = linesMap[key];
      elements.forEach((el) => {
        if (el.type === 'slot') {
          const d = document.createElement('div');
          d.id = 'slot-' + el.idx;
          d.dataset.idx = el.idx;
          
          const labelText = mode === 'classic' ? `${el.ayahNum}` : `${el.ayahNum}.${el.idx + 1}`;
          d.setAttribute('data-label', labelText);

          if (el.isInteractive) {
            d.className = 'slot';
            d.innerHTML = `<span class="st">${el.txt}</span><span class="sck">✓</span>`;
            d.addEventListener('click', () => {
              const inst = document.getElementById('instbar');
              if (inst && !filledSlots.has(el.idx)) {
                inst.textContent = `ℹ️ Locate the bubble containing: "${el.txt}" and double-tap it.`;
              }
            });
          } else {
            d.className = 'slot filled';
            d.style.cursor = 'default';
            d.innerHTML = `<span class="st" style="color: #1C1B18; text-shadow: none;">${el.txt}</span>`;
          }
          lineDiv.appendChild(d);
        } else { // marker
          const marker = document.createElement('span');
          marker.className = 'mushaf-ayah-marker';
          marker.innerHTML = el.ayahNum;
          lineDiv.appendChild(marker);
        }
      });

      textFlow.appendChild(lineDiv);
    });

    c.appendChild(textFlow);
  },

  setupConnectorCanvas() {
    const zone = document.getElementById('fall-zone');
    if (!zone) return;

    // Clear any existing connector canvases
    const oldCanvas = document.getElementById('connector-canvas');
    if (oldCanvas) oldCanvas.remove();

    const canvas = document.createElement('div');
    canvas.id = 'connector-canvas';
    canvas.style.position = 'relative';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.overflow = 'hidden';
    zone.appendChild(canvas);

    const canvasW = zone.clientWidth || 380;
    const canvasH = zone.clientHeight || 280;

    // We generate bubbles for all items in the queue (shuffled)
    const bubbleW = mode === 'classic' ? 120 : mode === 'phrase' ? 85 : 65;
    const bubbleH = 42;

    const cols = Math.ceil(Math.sqrt(slotCount));
    const rows = Math.ceil(slotCount / cols);
    const cellW = canvasW / cols;
    const cellH = canvasH / rows;

    // Create scrambled list of elements
    const scrambled = shuffledOrder.map(idx => queue[idx]);

    scrambled.forEach((block, index) => {
      const b = document.createElement('div');
      b.className = 'bubble';
      if (block.powerup) {
        b.classList.add('powerup-' + block.powerup);
      }
      b.id = 'bubble-' + block.slotIdx;
      b.dataset.idx = block.slotIdx;
      
      let text = block.ar;
      if (block.powerup === 'heart') text = '❤️ ' + text;
      else if (block.powerup === 'hint') text = '💡 ' + text;
      b.textContent = text;

      // Position inside grid cell with random offset
      const r = Math.floor(index / cols);
      const c = index % cols;

      const randomXOffset = (Math.random() - 0.5) * (cellW - bubbleW - 4);
      const randomYOffset = (Math.random() - 0.5) * (cellH - bubbleH - 4);

      let x = c * cellW + (cellW - bubbleW) / 2 + randomXOffset;
      let y = r * cellH + (cellH - bubbleH) / 2 + randomYOffset;

      // Keep within bounds
      x = Math.max(4, Math.min(canvasW - bubbleW - 4, x));
      y = Math.max(4, Math.min(canvasH - bubbleH - 4, y));

      b.style.left = x + 'px';
      b.style.top = y + 'px';

      // Tap behavior: Single tap to listen, double tap to connect/place
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onBubbleTap(b, block);
      });

      canvas.appendChild(b);
    });

    // Add CSS properties for the bubble nodes dynamically
    this.injectConnectorStyles();
  },

  onBubbleTap(element, block) {
    if (!this.active) return;
    
    const now = Date.now();
    const isDoubleTap = (now - this.lastTapTime < 350) && (this.lastTapBubbleId === element.id);
    
    this.lastTapTime = now;
    this.lastTapBubbleId = element.id;

    if (isDoubleTap) {
      // ✅ DOUBLE TAP -> VALIDATE AND PLACE
      this.validateSelection(block, element);
    } else {
      // 🔊 SINGLE TAP -> LISTEN TO AUDIO
      AudioManager.hearBlock(block, mode, element);
    }
  },

  validateSelection(block, element) {
    if (filledSlots.has(block.slotIdx)) return;

    // In Connector mode, blocks must be connected in consecutive order
    const expectedSlot = queue[placed].slotIdx;

    if (block.slotIdx === expectedSlot) {
      // Correct!
      this.correctSelection(block, element);
    } else {
      // Wrong!
      this.wrongSelection(block, element);
    }
  },

  correctSelection(block, element) {
    AudioManager.stopPlayingAudio();
    AudioManager.playTone('correct');
    
    element.classList.add('correct');
    element.style.pointerEvents = 'none';

    // Highlight corresponding Mushaf slot
    const sl = document.getElementById('slot-' + block.slotIdx);
    if (sl) {
      sl.querySelector('.st').textContent = block.ar;
      sl.classList.add('filled');
      sl.classList.remove('rainbow-pulse');
    }
    filledSlots.add(block.slotIdx);

    // Scoring
    const basePts = mode === 'classic' ? 50 : mode === 'phrase' ? 30 : 15;
    const finalPts = registerCorrectPlacement(basePts, element);
    score += finalPts;
    placed++;
    spawnScoreFX('+' + finalPts, element);
    updateHUD();

    if (block.powerup === 'heart') {
      if (lives < 3) {
        lives++;
        updateLives();
      }
    } else if (block.powerup === 'hint') {
      this.rainbowHintActive = true;
    }

    const inst = document.getElementById('instbar');
    let feedback = `✅ Connected! +${finalPts} points.`;
    if (block.powerup === 'heart') feedback += ` (❤️ Extra Heart Recovery!)`;
    else if (block.powerup === 'hint') feedback += ` (💡 Next Bubble Auto-Hint Active!)`;
    if (inst) inst.textContent = feedback;

    // Move bubble animation and fade out
    element.style.transition = 'all 0.5s ease-out';
    element.style.transform = 'scale(0)';
    element.style.opacity = '0';
    setTimeout(() => element.remove(), 500);

    if (placed >= slotCount) {
      setTimeout(() => gameComplete(), 600);
    } else {
      if (block.powerup !== 'hint') {
        this.rainbowHintActive = false;
      }
      this.applyRainbowHint();
      this.updateInstruction();
    }
  },

  wrongSelection(block, element) {
    AudioManager.stopPlayingAudio();
    AudioManager.playTone('wrong');
    registerWrongPlacement();
    
    element.classList.add('wrong');
    setTimeout(() => element.classList.remove('wrong'), 600);

    errors++;
    lives = Math.max(0, lives - 1);
    updateLives();

    const inst = document.getElementById('instbar');
    if (lives <= 0) {
      setTimeout(() => gameOver(), 600);
    } else {
      if (inst) {
        const correctAr = queue[placed].ar;
        inst.textContent = `❌ Wrong bubble! Find: "${correctAr}" · -1 life`;
      }
    }
  },

  applyRainbowHint() {
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('rainbow-pulse'));
    document.querySelectorAll('.bubble').forEach(b => b.classList.remove('rainbow-pulse'));
    
    if (this.rainbowHintActive && placed < slotCount) {
      const nextBlock = queue[placed];
      const sl = document.getElementById('slot-' + nextBlock.slotIdx);
      if (sl) {
        sl.classList.add('rainbow-pulse');
        sl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      const bub = document.getElementById('bubble-' + nextBlock.slotIdx);
      if (bub) {
        bub.classList.add('rainbow-pulse');
      }
    }
  },

  updateInstruction() {
    const inst = document.getElementById('instbar');
    if (!inst) return;
    if (placed < slotCount) {
      const nextBlock = queue[placed];
      inst.textContent = `Find next: "${nextBlock.ar}" · Single-tap to hear · Double-tap to connect`;
    }
  },

  injectConnectorStyles() {
    // Add connector CSS dynamically in case styles aren't compiled yet
    if (document.getElementById('connector-styles-block')) return;
    const style = document.createElement('style');
    style.id = 'connector-styles-block';
    style.textContent = `
      .bubble {
        position: absolute;
        background: rgba(200, 150, 12, 0.07);
        border: 1px solid var(--goldb);
        border-radius: 20px;
        color: var(--text);
        font-family: 'Amiri', serif;
        font-size: 16px;
        direction: rtl;
        text-align: center;
        padding: 6px 12px;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        transition: border-color 0.2s, background 0.2s, transform 0.2s;
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bubble:hover {
        border-color: var(--gold);
        background: rgba(200, 150, 12, 0.12);
      }
      .bubble.playing-audio {
        border-color: var(--greenl) !important;
        background: rgba(23, 120, 74, 0.25) !important;
        box-shadow: 0 0 12px rgba(34, 176, 106, 0.7);
        transform: scale(1.05);
      }
      .bubble.correct {
        border-color: var(--greenl) !important;
        background: rgba(23, 120, 74, 0.4) !important;
        box-shadow: 0 0 15px rgba(34, 176, 106, 0.9);
        transform: scale(1.1);
      }
      .bubble.wrong {
        border-color: var(--red) !important;
        background: rgba(184, 48, 48, 0.25) !important;
        animation: bubble-shake 0.4s ease-out;
      }
      @keyframes bubble-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-6px); }
        75% { transform: translateX(6px); }
      }
    `;
    document.head.appendChild(style);
  }
};
