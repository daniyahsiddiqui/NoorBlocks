# NoorBlocks (نوربلوكس)

NoorBlocks is a premium, interactive web application designed to help users memorize the Qur'an through engaging and responsive games. It features Uthmani-style script, audio recitation CDNs, and custom layout frameworks modeled after a digital Mushaf page.

---

## 🎮 Game Modes

### 1. NoorBlocks (Classic Tetris Mode)
* **How it works**: Blocks containing Arabic verses/phrases fall from the top of the catch zone.
* **How to play**: Tap or click the correct slot in the Mushaf page layout below before the block hits the ground. 
* **Audio**: Tap the falling block to hear the recitation (full verse from Mishary Alafasy).
* **Scoring**: Relative speed-based points — placing blocks higher up in the catch zone grants up to a **double points** speed bonus.

### 2. Ayah Connector (Bubble Connection Mode)
* **How it works**: Words or phrases from the selected Surah float as bubbles in the interaction canvas.
* **How to play**: 
  - **Single-tap** any bubble to hear its authentic pronunciation (Quran.com word-by-word audio) to learn and review.
  - **Double-tap** bubbles in consecutive reading order to connect and place them in the Mushaf page below.
* **Health**: Clicking an incorrect bubble in the sequence reduces hearts.

---

## 🚀 Key Features

* **Authentic Tajweed Audio**: Integrated with EveryAyah.com (full verse) and Quran.com's word-by-word CDN.
* **Mushaf Text Flow**: Target slots wrap naturally from right to left, preserving character widths for text alignment.
* **Local Leaderboards**: Tracks top scores, accuracies, and game modes dynamically inside your browser (`localStorage`).
* **Modular Structure**: Fully decoupled stylesheet (`css/main.css`), database loader (`js/database.js`), and game engines.

---

## 🛠️ How to Play Locally

To run the application locally without encountering browser CORS blocks:
1. Open your terminal inside the project directory:
   ```bash
   cd /Users/daniyah/Documents/Projects/QuranMemorizeTetris
   ```
2. Start a local server:
   ```bash
   # Using Python
   python3 -m http.server 8000
   
   # Or using Node.js
   npx serve
   ```
3. Open your browser and navigate to: **[http://localhost:8000](http://localhost:8000)**.

---

## 🗺️ Future Roadmap

1. **Native Mobile App Compilation (Capacitor)**:
   - Compile into native iOS (`.ipa`) and Android (`.apk`) apps using Ionic Capacitor.
   - Access native features such as haptics (vibrations on errors) and local push notifications for daily streaks.
   
2. **Progressive Web App (PWA) Cache**:
   - Integrate a Service Worker to cache all Surah JSON metadata and CDN audio tracks locally.
   - Enable 100% offline gameplay.

3. **Multi-Game Expansion**:
   - **Translation Matcher**: Match Arabic vocabulary cards to their meanings in a grid memory game.
   - **Silent Dictation**: Blank out random words/letters and listen to the audio recitation to fill in the blanks.
   - **Surah Sorter**: Reorder fully scrambled ayahs of a Surah on a timeline.
