# planck.ai — Ultra-Low Latency Speech Copilot

**planck.ai** is a real-time conversation copilot that listens to phone calls and meeting audio (Google Voice, Google Meet, Microsoft Teams, Zoom), transcribes speech with ~100ms latency via Deepgram Nova-3, and streams articulate, human-sounding technical interview answers in ~120ms via Groq.

---

## ⚡ Features
- **Ultra-Low Latency Pipeline:** Deepgram Nova-3 (~100ms) $\rightarrow$ Groq Qwen 3.8 / GPT (~120ms).
- **Tab Audio Isolation (Earphones Mode):** Captures only the caller/interviewer audio from Google Voice, Google Meet, or Teams with zero microphone feedback or echo.
- **Deepgram AI Speaker Diarization:** Distinguishes between multiple speakers (`Speaker 1`, `Speaker 2`) in room/mic mode.
- **Resume Upload (PDF & DOCX):** Drag-and-drop your resume (PDF via PDF.js, DOCX via Mammoth.js) to ground all answers in your real technical background.
- **Staff-Level Conversational Answers:** Formatted for natural, spoken delivery with deep architectural justification rather than canned checklists.

---

## 🚀 Quick Setup

### 1. Configure Your API Keys
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your private API keys in `.env` (these are never committed to git):
```ini
PORT=3000
DEEPGRAM_API_KEY=your_deepgram_api_key
GROQ_API_KEY=your_groq_api_key
```

### 2. Install & Start
```bash
npm install
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 📞 How to Use
1. Open your meeting or phone call tab (Google Voice, Google Meet, Teams).
2. On `planck.ai`, click **"Upload Resume"** to load your `.docx` or `.pdf` resume.
3. Click **"Start Listening"** and select your call's **Chrome Tab** (ensure **"Also share tab audio"** is checked).
4. As questions are asked, click **"Generate Answer Now"** (or hit **Spacebar**) for sub-second talking points.
