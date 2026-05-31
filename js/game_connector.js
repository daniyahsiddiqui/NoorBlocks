// Ayah Connector Game Engine
const GameConnector = {
  active: false,
  bubbles: [],
  lastTapTime: 0,
  lastTapBubbleId: null,

  start(surahData) {
    this.active = true;
    this.bubbles = [];
    this.lastTapTime = 0;
    this.lastTapBubbleId = null;

    this.buildSlotsUI();
    this.setupConnectorCanvas();
    this.updateInstruction();
  },

  stop() {
    this.active = false;
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

    const textFlow = document.createElement('div');
    textFlow.className = 'mushaf-text-flow';

    queue.forEach((b, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.id = 'slot-' + i;
      d.dataset.idx = i;
      
      const labelText = mode === 'classic' ? `${i + 1}` : `${b.ayahIdx + 1}.${b.partIdx + 1}`;
      d.setAttribute('data-label', labelText);
      d.innerHTML = `<span class="st">${b.ar}</span><span class="sck">✓</span>`;

      // In Connector mode, tapping the slot tells them what to do
      d.addEventListener('click', () => {
        const inst = document.getElementById('instbar');
        if (inst && !filledSlots.has(i)) {
          inst.textContent = `ℹ️ Locate the bubble containing: "${b.ar}" and double-tap it.`;
        }
      });

      textFlow.appendChild(d);

      if (b.partIdx === b.parts - 1) {
        const marker = document.createElement('span');
        marker.className = 'mushaf-ayah-marker';
        marker.innerHTML = b.verseNum;
        textFlow.appendChild(marker);
      }
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
      b.id = 'bubble-' + block.slotIdx;
      b.dataset.idx = block.slotIdx;
      b.textContent = block.ar;

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

    // In Connector mode, blocks must be connected in consecutive order (placed = first empty slot index)
    const expectedSlot = placed;

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
    }
    filledSlots.add(block.slotIdx);

    // Scoring
    const basePts = mode === 'classic' ? 50 : mode === 'phrase' ? 30 : 15;
    score += basePts;
    placed++;
    spawnScoreFX('+' + basePts, element);
    updateHUD();

    const inst = document.getElementById('instbar');
    if (inst) inst.textContent = `✅ Connected! +${basePts} points.`;

    // Move bubble animation and fade out
    element.style.transition = 'all 0.5s ease-out';
    element.style.transform = 'scale(0)';
    element.style.opacity = '0';
    setTimeout(() => element.remove(), 500);

    if (placed >= slotCount) {
      setTimeout(() => gameComplete(), 600);
    } else {
      this.updateInstruction();
    }
  },

  wrongSelection(block, element) {
    AudioManager.stopPlayingAudio();
    AudioManager.playTone('wrong');
    
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
