// NoorBlocks (Tetris Mode) Game Engine
const GameTetris = {
  fallRAF: null,
  fallY: 0,
  fallSpeed: 0,
  blockH: 60,
  zoneH: 220,
  blockFrozen: false,
  currentTargetSlot: 0,

  start() {
    this.stop();
    this.blockFrozen = false;
    this.currentTargetSlot = 0;
    this.buildSlotsUI();
    this.loadNextBlock();
    
    // Bind click listener directly to the falling block
    const fb = document.getElementById('fblock');
    if (fb) {
      // Remove any old event listeners by cloning the element
      const newFb = fb.cloneNode(true);
      fb.parentNode.replaceChild(newFb, fb);
      
      newFb.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hearBlock();
      });
    }
  },

  stop() {
    this.blockFrozen = true;
    if (this.fallRAF) {
      cancelAnimationFrame(this.fallRAF);
      this.fallRAF = null;
    }
  },

  buildSlotsUI() {
    const c = document.getElementById('slots-container');
    if (!c) return;
    c.innerHTML = '';

    const surah = Database.currentSurah;
    if (!surah) return;

    // Elegant single-line calligraphic Surah Title banner
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
              if (!this.blockFrozen) {
                this.onSlotClick(el.idx);
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

  loadNextBlock() {
    AudioManager.stopPlayingAudio();
    if (curBlockQIdx >= shuffledOrder.length) {
      gameComplete();
      return;
    }

    const block = queue[shuffledOrder[curBlockQIdx]];
    this.blockFrozen = false;
    this.currentTargetSlot = this.getFirstEmptySlot();

    document.getElementById('fb-ar').textContent = block.ar;
    document.getElementById('fb-tr').textContent = block.tr;
    document.getElementById('fb-hint').textContent = '💡 ' + block.hint;

    const fb = document.getElementById('fblock');
    if (fb) {
      fb.className = 'entering alive';
      fb.style.top = '0px';
      fb.style.left = '10%';
      fb.style.width = '80%';
    }

    // Next preview previewing (kept hidden on mobile/pointing layout but populated for engine sync)
    const nextIdx = shuffledOrder[curBlockQIdx + 1];
    const next = nextIdx !== undefined ? queue[nextIdx] : null;
    const nextAr = document.getElementById('next-ar');
    if (nextAr) {
      nextAr.textContent = next ? (next.ar.length > 14 ? next.ar.slice(0, 13) + '…' : next.ar) : '—';
    }

    this.highlightTargetSlot(this.currentTargetSlot);
    this.updateInstruction();

    setTimeout(() => this.startFall(), 400);
  },

  getFirstEmptySlot() {
    for (let i = 0; i < queue.length; i++) {
      const sIdx = queue[i].slotIdx;
      if (!filledSlots.has(sIdx)) return sIdx;
    }
    return queue[0] ? queue[0].slotIdx : 0;
  },

  highlightTargetSlot(idx) {
    document.querySelectorAll('.slot').forEach(s => {
      s.classList.remove('active-target');
    });
    const sl = document.getElementById('slot-' + idx);
    if (sl && !filledSlots.has(idx)) {
      sl.classList.add('active-target');
      sl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  },

  updateInstruction() {
    const slotLabel = mode === 'classic' ? `Ayah ${this.currentTargetSlot + 1}` : `Slot ${this.currentTargetSlot + 1}`;
    const inst = document.getElementById('instbar');
    if (inst) {
      inst.textContent = `Targeting: ${slotLabel} · Click/Tap the correct slot to place the block · Click the block to hear it`;
    }
  },

  startFall() {
    if (this.blockFrozen) return;
    const zone = document.getElementById('fall-zone');
    if (zone) this.zoneH = zone.clientHeight;
    
    const fb = document.getElementById('fblock');
    if (fb) this.blockH = fb.offsetHeight || 60;

    this.fallY = 0;
    const speedMap = { classic: 0.15, phrase: 0.2, word: 0.25 };
    this.fallSpeed = speedMap[mode] || 0.15;

    const spd = mode === 'classic' ? '●○○' : mode === 'phrase' ? '●●○' : '●●●';
    const spdLbl = document.getElementById('spd-lbl');
    if (spdLbl) spdLbl.textContent = spd;

    if (this.fallRAF) cancelAnimationFrame(this.fallRAF);
    this.fallLoop();
  },

  fallLoop() {
    if (this.blockFrozen) return;
    const fb = document.getElementById('fblock');
    if (!fb) {
      this.fallRAF = requestAnimationFrame(() => this.fallLoop());
      return;
    }
    this.fallY += this.fallSpeed;
    const maxY = this.zoneH - this.blockH - 4;
    if (this.fallY >= maxY) {
      this.fallY = maxY;
      fb.style.top = this.fallY + 'px';
      this.groundHit();
      return;
    }
    fb.style.top = this.fallY + 'px';
    this.fallRAF = requestAnimationFrame(() => this.fallLoop());
  },

  groundHit() {
    AudioManager.stopPlayingAudio();
    this.blockFrozen = true;
    const fb = document.getElementById('fblock');
    if (fb) {
      fb.className = 'wrong-fx';
    }
    const hint = document.getElementById('fb-hint');
    if (hint) hint.style.opacity = '1';
    
    AudioManager.playTone('wrong');
    errors++;
    lives = Math.max(0, lives - 1);
    updateLives();
    
    const inst = document.getElementById('instbar');
    if (inst) inst.textContent = '⏱ Too slow! Block hit the ground. -1 life';

    setTimeout(() => {
      if (fb) fb.className = 'alive';
      if (hint) hint.style.opacity = '0';
      if (lives <= 0) {
        gameOver();
        return;
      }
      if (fb) fb.style.top = '0px';
      this.blockFrozen = false;
      this.fallY = 0;
      this.fallSpeed = Math.min(this.fallSpeed * 1.03, 0.8);
      this.startFall();
    }, 900);
  },

  onSlotClick(slotIdx) {
    this.currentTargetSlot = slotIdx;
    this.highlightTargetSlot(slotIdx);
    this.tryPlaceInSlot(slotIdx);
  },

  tryPlaceInSlot(slotIdx) {
    if (this.blockFrozen) return;

    const curQueueEntry = shuffledOrder[curBlockQIdx];
    const block = queue[curQueueEntry];
    const correctSlot = block.slotIdx;

    if (slotIdx === correctSlot && !filledSlots.has(slotIdx)) {
      this.correctPlacement(block, slotIdx);
    } else if (filledSlots.has(slotIdx)) {
      const inst = document.getElementById('instbar');
      if (inst) inst.textContent = '⚠️ That slot is already filled — choose another';
    } else {
      this.wrongPlacement(block, slotIdx, correctSlot);
    }
  },

  correctPlacement(block, slotIdx) {
    AudioManager.stopPlayingAudio();
    this.blockFrozen = true;
    if (this.fallRAF) cancelAnimationFrame(this.fallRAF);

    const fb = document.getElementById('fblock');
    if (fb) fb.className = 'correct-fx';
    AudioManager.playTone('correct');

    // Reveal Arabic text in Mushaf layout
    const sl = document.getElementById('slot-' + slotIdx);
    if (sl) {
      sl.querySelector('.st').textContent = block.ar;
      sl.classList.add('filled');
      sl.classList.remove('active-target');
    }
    filledSlots.add(slotIdx);

    // Calculate score points with dynamic speed bonus
    const basePts = mode === 'classic' ? 50 : mode === 'phrase' ? 30 : 15;
    const speedBonusMax = mode === 'classic' ? 50 : mode === 'phrase' ? 30 : 15;
    const maxY = this.zoneH - this.blockH - 4;
    const ratio = maxY > 0 ? Math.max(0, Math.min(1, this.fallY / maxY)) : 1;
    const bonus = Math.round(speedBonusMax * (1 - ratio));
    const pts = basePts + bonus;

    score += pts;
    placed++;
    spawnScoreFX('+' + pts, fb);
    updateHUD();

    const inst = document.getElementById('instbar');
    if (inst) inst.textContent = `✅ Correct! +${pts} points (Speed Bonus: +${bonus})`;

    setTimeout(() => {
      curBlockQIdx++;
      if (fb) fb.style.top = '0px';
      document.querySelectorAll('.slot').forEach(s => {
        s.classList.remove('drag-over', 'active-target');
      });
      this.loadNextBlock();
    }, 500);
  },

  wrongPlacement(block, triedSlot, correctSlot) {
    AudioManager.stopPlayingAudio();
    this.blockFrozen = true;
    if (this.fallRAF) cancelAnimationFrame(this.fallRAF);

    const fb = document.getElementById('fblock');
    if (fb) fb.className = 'wrong-fx';
    
    const hint = document.getElementById('fb-hint');
    if (hint) hint.style.opacity = '1';
    
    AudioManager.playTone('wrong');

    const tried = document.getElementById('slot-' + triedSlot);
    if (tried) tried.classList.add('wrong-flash');
    setTimeout(() => {
      if (tried) tried.classList.remove('wrong-flash');
    }, 500);

    errors++;
    lives = Math.max(0, lives - 1);
    updateLives();

    const hintSlot = mode === 'classic' ? `Ayah ${block.verseNum}` : `Ayah ${block.verseNum} (Part ${block.partIdx + 1})`;
    const inst = document.getElementById('instbar');
    if (inst) inst.textContent = `❌ Wrong slot! It belongs in ${hintSlot} — try again`;

    setTimeout(() => {
      if (fb) fb.className = 'alive';
      if (hint) hint.style.opacity = '0';
      if (lives <= 0) {
        gameOver();
        return;
      }
      if (fb) fb.style.top = '0px';
      this.fallY = 0;
      this.blockFrozen = false;
      this.currentTargetSlot = correctSlot;
      this.highlightTargetSlot(this.currentTargetSlot);
      this.updateInstruction();
      this.startFall();
    }, 1000);
  },

  hearBlock() {
    if (curBlockQIdx < shuffledOrder.length) {
      const block = queue[shuffledOrder[curBlockQIdx]];
      AudioManager.hearBlock(block, mode, document.getElementById('fblock'));
    }
  }
};
