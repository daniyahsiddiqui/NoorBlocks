// Audio Manager for NoorBlocks
const AudioManager = {
  currentPlayingAudio: null,
  audioContext: null,

  getAudioContext() {
    return this.audioContext || (this.audioContext = new (window.AudioContext || window.webkitAudioContext)());
  },

  playTone(type) {
    try {
      const c = this.getAudioContext();
      if (type === 'correct') {
        [[523, 0], [659, .1], [784, .2]].forEach(([f, t]) => {
          const o = c.createOscillator(), g = c.createGain();
          o.connect(g); g.connect(c.destination);
          o.frequency.value = f;
          g.gain.setValueAtTime(.12, c.currentTime + t);
          g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + .35);
          o.start(c.currentTime + t); o.stop(c.currentTime + t + .35);
        });
      } else if (type === 'wrong') {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth'; o.connect(g); g.connect(c.destination);
        o.frequency.setValueAtTime(200, c.currentTime);
        o.frequency.linearRampToValueAtTime(130, c.currentTime + .3);
        g.gain.setValueAtTime(.08, c.currentTime);
        g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .3);
        o.start(); o.stop(c.currentTime + .3);
      } else if (type === 'complete') {
        [523, 659, 784, 1047].forEach((f, i) => {
          const o = c.createOscillator(), g = c.createGain();
          o.connect(g); g.connect(c.destination);
          o.frequency.value = f;
          g.gain.setValueAtTime(.12, c.currentTime + i * .13);
          g.gain.exponentialRampToValueAtTime(.001, c.currentTime + i * .13 + .4);
          o.start(c.currentTime + i * .13); o.stop(c.currentTime + i * .13 + .4);
        });
      }
    } catch (e) {
      console.warn("Web Audio chime failed:", e);
    }
  },

  stopPlayingAudio() {
    if (this.currentPlayingAudio) {
      try {
        this.currentPlayingAudio.pause();
      } catch (e) {}
      this.currentPlayingAudio = null;
    }
    const fb = document.getElementById('fblock');
    if (fb) {
      fb.classList.remove('playing-audio');
    }
    // Also remove visual playing state from bubbles in Ayah Connector
    document.querySelectorAll('.bubble.playing-audio').forEach(el => {
      el.classList.remove('playing-audio');
    });
  },

  padZero(num, size) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  },

  playAudioFile(url, targetElement = null) {
    this.stopPlayingAudio();

    if (targetElement) {
      targetElement.classList.add('playing-audio');
    }

    const inst = document.getElementById('instbar');
    if (inst) inst.textContent = '🔊 Loading recitation...';

    const audio = new Audio(url);
    this.currentPlayingAudio = audio;

    audio.addEventListener('play', () => {
      if (inst) inst.textContent = '🔊 Playing recitation...';
    });

    const cleanup = () => {
      if (targetElement) targetElement.classList.remove('playing-audio');
      if (this.currentPlayingAudio === audio) {
        this.currentPlayingAudio = null;
      }
      if (typeof window.updateInstruction === 'function') {
        window.updateInstruction();
      }
    };

    audio.addEventListener('ended', cleanup);

    audio.addEventListener('error', (e) => {
      console.error("Audio playback error:", e);
      if (targetElement) targetElement.classList.remove('playing-audio');
      if (this.currentPlayingAudio === audio) {
        this.currentPlayingAudio = null;
      }
      if (inst) inst.textContent = '⚠️ Audio unavailable. Playing chime instead.';
      this.playTone('correct');
      setTimeout(() => {
        if (typeof window.updateInstruction === 'function') {
          window.updateInstruction();
        }
      }, 1500);
    });

    audio.play().catch(err => {
      console.warn("Audio play blocked by browser:", err);
      if (targetElement) targetElement.classList.remove('playing-audio');
      if (this.currentPlayingAudio === audio) {
        this.currentPlayingAudio = null;
      }
      if (inst) inst.textContent = '⚠️ Tap again to play audio.';
      setTimeout(() => {
        if (typeof window.updateInstruction === 'function') {
          window.updateInstruction();
        }
      }, 2000);
    });
  },

  hearBlock(block, mode, targetElement = null) {
    const surahNumPadded = this.padZero(block.surahNum, 3);
    const verseNumPadded = this.padZero(block.verseNum, 3);

    let url = "";
    if (mode === 'word') {
      const wordNumPadded = this.padZero(block.wordNum, 3);
      url = `https://audio.qurancdn.com/wbw/${surahNumPadded}_${verseNumPadded}_${wordNumPadded}.mp3`;
    } else {
      url = `https://everyayah.com/data/Alafasy_128kbps/${surahNumPadded}${verseNumPadded}.mp3`;
    }

    this.playAudioFile(url, targetElement);
  }
};
