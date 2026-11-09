# FINANCIAL-EXPERT-AI
CHATBOT
# 📘 README.md — ZYVO AI

```markdown
# 🤖 ZYVO AI

A full-stack AI chat assistant with file analysis, document generation, and voice chat.

---

## ✅ Requirements

- **Node.js** v18+ (v20+ recommended)
- **Groq API Key** — get one free at [console.groq.com/keys](https://console.groq.com/keys)
- Modern browser (Chrome, Edge, or Safari for voice features)

---

## 🚀 Installation

### 1. Install dependencies

```bash
npm install express path url dotenv groq-sdk multer pdf-parse mammoth docx pdfkit exceljs pptxgenjs
```

### 2. Create `.env`

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORT=3005
```

### 3. (Optional) Add `knowledge-base.json`

```json
[
  {
    "category": "Greetings",
    "keywords": ["hello", "hi", "hey"],
    "response": "Hello! I am ZYVO AI. How can I help you today?"
  }
]
```

### 4. Start the server

```bash
node server.js
```

Open **http://localhost:3005**

---

## 📁 Project Structure

```
zyvo-ai/
├── server.js              # Backend (Express + Groq API)
├── index.html             # Frontend UI
├── script.js              # Frontend logic
├── knowledge-base.json    # (Optional) Quick replies
├── .env                   # Secrets (keep private!)
└── package.json
```

---

## 🔌 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Streaming AI chat |
| `/api/upload` | POST | Analyze file (image, PDF, DOCX, TXT, CSV) — max **20MB** |
| `/api/create-document` | POST | Generate `docx`, `pdf`, `xlsx`, `pptx`, or `txt` |

---

## ✨ Features

- 💬 **Chat** — streaming responses, markdown, code blocks with copy/download
- 📎 **File Analysis** — images (vision model), PDF, DOCX, TXT, CSV
- 📄 **Documents** — export replies as Word, PDF, Excel, PowerPoint, or TXT
- 🎤 **Voice Chat** — speech recognition + text-to-speech with mood-based tone
- 🌓 **Dark/Light mode** — saved in localStorage
- 👤 **Auth & History** — register, login, chat history per user (localStorage)
- 📤 **Share** — WhatsApp, Email, Telegram, Twitter, or native share

---

## ⚙️ Configuration

Edit in `server.js`:

```js
const CHAT_MODEL = "openai/gpt-oss-120b";
const VISION_MODEL = "qwen/qwen3.6-27b";
```

Check available models: [console.groq.com/docs/models](https://console.groq.com/docs/models)

---

## 🧠 Knowledge Base

`knowledge-base.json` returns instant replies without calling the API.

- Each entry needs: `category`, `keywords[]`, `response`
- Match threshold: **score ≥ 4** (total length of matched keywords)
- If no match → falls back to Groq API

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---------|-----|
| "Model not found" | Change `CHAT_MODEL` / `VISION_MODEL` in `server.js` |
| "GROQ_API_KEY missing" | Check `.env` exists in project root |
| "File too large" | Limit is 20MB — change `limits.fileSize` in `server.js` |
| Voice not working | Use Chrome/Edge/Safari, allow microphone access |
| Document fails | Run `npm install docx pdfkit exceljs pptxgenjs` |

---

## 🔒 Security Notes

- Never commit `.env` — add to `.gitignore`
- Auth is **localStorage-based** — for production use JWT + a database
- File uploads are **in-memory** — for production use S3 or cloud storage

---

## 🧰 Tech Stack

**Backend:** Express, groq-sdk, multer, pdf-parse, mammoth, docx, pdfkit, exceljs, pptxgenjs, dotenv  
**Frontend:** Vanilla JS, marked.js, Tailwind CSS (CDN), Font Awesome, Web Speech API

---

## 📝 License

MIT — free to use, modify, and distribute.

**Built with ❤️ — ZYVO AI**
```
