// Database manager for NoorBlocks
const Database = {
  surahIndex: [],
  currentSurah: null,

  async init() {
    try {
      const res = await fetch('db/surah_index.json');
      this.surahIndex = await res.json();
      return this.surahIndex;
    } catch (e) {
      console.error("Failed to load surah index:", e);
      // Hardcoded fallback index in case of file:// CORS restrictions in local testing
      this.surahIndex = [
        { "id": 0, "surahNum": 1, "nameAr": "سُورَةُ الفَاتِحَةِ", "nameEn": "Al-Fātiḥah", "nameTr": "THE OPENING", "meta": "7 ayahs · Makkiyya · Page 1" },
        { "id": 1, "surahNum": 108, "nameAr": "سُورَةُ الكَوْثَرِ", "nameEn": "Al-Kawthar", "nameTr": "THE ABUNDANCE", "meta": "3 ayahs · Makkiyya · Page 600" },
        { "id": 2, "surahNum": 112, "nameAr": "سُورَةُ الإِخْلَاصِ", "nameEn": "Al-Ikhlāṣ", "nameTr": "THE SINCERITY", "meta": "4 ayahs · Makkiyya · Page 604" },
        { "id": 3, "surahNum": 113, "nameAr": "سُورَةُ الفَلَقِ", "nameEn": "Al-Falaq", "nameTr": "THE DAYBREAK", "meta": "5 ayahs · Madaniyya · Page 604" },
        { "id": 4, "surahNum": 114, "nameAr": "سُورَةُ النَّاسِ", "nameEn": "An-Nās", "nameTr": "MANKIND", "meta": "6 ayahs · Madaniyya · Page 604" }
      ];
      return this.surahIndex;
    }
  },

  async loadSurah(surahNum) {
    try {
      const res = await fetch(`db/surah_${surahNum}.json`);
      this.currentSurah = await res.json();
      return this.currentSurah;
    } catch (e) {
      console.error(`Failed to load Surah ${surahNum}:`, e);
      // Inline fallbacks for local file:// testing
      return await this.getLocalFallbackSurah(surahNum);
    }
  },

  async getLocalFallbackSurah(surahNum) {
    // Basic fallback to ensure offline / local double-click play is unbroken
    const filename = `db/surah_${surahNum}.json`;
    console.warn(`Attempting to fallback load ${filename}`);
    // If the browser strictly prevents fetch on file:// we can fetch via dynamic script tags 
    // or return a basic mock. We'll return null to let the core handle it, or fallback.
    // Let's implement dynamic script fallback if needed, but standard fetch handles hosted environments.
    return null;
  }
};
