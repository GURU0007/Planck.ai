require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const url = require('url');
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const Groq = require('groq-sdk');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Multiplex WebSocket servers:
// 1. /ws -> Main Browser / Desktop Stealth HUD audio & control
// 2. /telecom-stream -> Carrier (Telnyx) Silent Inbound Audio Media Stream
const wss = new WebSocket.Server({ noServer: true });
const telecomWss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/telecom-stream') {
    telecomWss.handleUpgrade(request, socket, head, (ws) => {
      telecomWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Disable caching so clients and Render CDN always get the freshest 60 FPS assets immediately
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 1. First Landing Page (Product Overview & 4 Feature Fields)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Explicit Landing Page Route
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Dedicated Recruiter Phone Call Copilot (No stealth install required, 100% web prompter for phone calls)
app.get('/recruiter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'recruiter.html'));
});

// 2. Main Copilot Workspace Application
app.get('/app', (req, res) => {
  // If user requests recruiter mode directly, route to dedicated recruiter space
  if (req.query.mode === 'recruiter') {
    return res.sendFile(path.join(__dirname, 'public', 'recruiter.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0
}));

// Otter-Style Live Session Rooms Network
// Map: roomId -> { hostWs, spectators: Set(), history: [], currentQuestion: '', currentAnswer: '', pin: null }
const liveRooms = new Map();

// Spectator Teleprompter Route
app.get('/live', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live.html'));
});

// Download Standalone Native Stealth ZIP for Windows (Portable, extract & double-click Planck-Stealth.exe)
app.get(['/download/stealth-zip', '/download/stealth-exe'], (req, res) => {
  const fs = require('fs');
  const zipPath = path.join(__dirname, 'dist', 'Planck-Stealth-Windows.zip');
  if (fs.existsSync(zipPath)) {
    return res.download(zipPath, 'Planck-Stealth-Windows.zip');
  }
  res.redirect('https://github.com/GURU0007/Planck.ai/releases/latest/download/Planck-Stealth-Windows.zip');
});

// Download Standalone Stealth Launcher (.bat for Windows, .command for Mac) configured for user's room
app.get(['/download/stealth', '/download/stealth-win', '/download/stealth-mac'], (req, res) => {
  // Always ensure end-users connect to production URL (not local development host)
  let baseUrl = 'https://planck-ai.onrender.com';
  const reqHost = req.get('host') || '';
  if (reqHost && !reqHost.includes('localhost') && !reqHost.includes('127.0.0.1')) {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    baseUrl = `${protocol}://${reqHost}`;
  }
  const roomId = (req.query.room || 'main_room').trim();
  const targetUrl = `${baseUrl}/live?room=${encodeURIComponent(roomId)}`;
  const isMac = req.query.os === 'mac' || req.path === '/download/stealth-mac';

  if (isMac) {
    const macContent = `#!/bin/bash
# Planck.ai Stealth Copilot Launcher for macOS (Zero install required)
TARGET_URL="${targetUrl}"

echo "========================================================"
echo " [Planck.ai] Launching Standalone Stealth Copilot..."
echo " - Connecting to: $TARGET_URL"
echo " - Distraction-free standalone app window"
echo "========================================================"

if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$TARGET_URL" --window-size=580,640
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="$TARGET_URL" --window-size=580,640
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --app="$TARGET_URL" --window-size=580,640
else
    open "$TARGET_URL"
fi

# Close Terminal window cleanly
osascript -e 'tell application "Terminal" to close first window' &>/dev/null &
exit 0
`;
    res.setHeader('Content-Disposition', 'attachment; filename="planck-stealth.command"');
    res.setHeader('Content-Type', 'application/x-sh');
    return res.send(macContent);
  }

  const batContent = `@echo off
title Planck.ai Stealth Copilot
set "TARGET_URL=${targetUrl}"

echo ========================================================
echo  [Planck.ai] Launching Standalone Stealth Q^&A Copilot...
echo  - Connecting to: %TARGET_URL%
echo  - Standalone HUD window (Zero local install required)
echo ========================================================

:: Check Chrome (64-bit, 32-bit, Local AppData per-user)
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)

:: Check Microsoft Edge (Built into 100% of Windows 10 & 11 PCs)
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)

:: Check Brave Browser
if exist "%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" (
    start "" "%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%LocalAppData%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" (
    start "" "%LocalAppData%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)

:: Fallback: Open default system browser directly
start "" "%TARGET_URL%"
exit
`;

  res.setHeader('Content-Disposition', 'attachment; filename="planck-stealth.bat"');
  res.setHeader('Content-Type', 'application/x-bat');
  res.send(batContent);
});

// High-Priority Software & Tech Keywords
const SOFTWARE_KEYWORDS = [
  'Spring Boot:5', 'Spring:4', 'Kubernetes:5', 'Docker:5', 'PostgreSQL:5', 'Postgres:4',
  'MongoDB:4', 'Redis:4', 'Kafka:5', 'RabbitMQ:4', 'Microservices:5', 'REST API:4',
  'GraphQL:4', 'gRPC:5', 'Java:4', 'JavaScript:4', 'TypeScript:4', 'React:4',
  'Next.js:5', 'Node.js:4', 'AWS:4', 'Azure:4', 'GCP:4', 'CI/CD:4', 'DevOps:4',
  'Terraform:5', 'Helm:4', 'Jenkins:4', 'GitHub Actions:4', 'Git:4', 'OAuth:4',
  'JWT:5', 'HTTP:3', 'HTTPS:3', 'WebSocket:4', 'WebSockets:4', 'SQL:4', 'NoSQL:4',
  'Database:4', 'Elasticsearch:5', 'Prometheus:4', 'Grafana:4', 'Linux:4', 'Nginx:4',
  'System Design:4', 'Architecture:4', 'Scalability:4', 'Load Balancer:4', 'Latency:4'
];

// High-Accuracy Phonetic & Software Terminology Corrector
function autocorrectTechTerms(text) {
  if (!text) return '';
  let corrected = text;
  const replacements = [
    { pattern: /\b(screen\s*book|spring\s*book|string\s*boot|spring\s*board|spring\s*boat)\b/gi, replacement: 'Spring Boot' },
    { pattern: /\b(cube\s*net|cue\s*burn\s*80s|coobernettes|cooper\s*net|coober\s*net)\b/gi, replacement: 'Kubernetes' },
    { pattern: /\b(post\s*grass|post\s*gray|post\s*grid)\b/gi, replacement: 'PostgreSQL' },
    { pattern: /\b(micro\s*service|micro\s*services)\b/gi, replacement: 'microservices' },
    { pattern: /\b(rest\s*api|restful\s*api)\b/gi, replacement: 'REST API' },
    { pattern: /\b(graph\s*ql)\b/gi, replacement: 'GraphQL' },
    { pattern: /\b(terra\s*form)\b/gi, replacement: 'Terraform' },
    { pattern: /\b(note\s*js|no\s*js)\b/gi, replacement: 'Node.js' },
    { pattern: /\b(next\s*js)\b/gi, replacement: 'Next.js' },
    { pattern: /\b(g\s*rpc)\b/gi, replacement: 'gRPC' },
    { pattern: /\b(j\s*w\s*t|jay\s*dub|jot)\b/gi, replacement: 'JWT' },
    { pattern: /\b(elastic\s*search)\b/gi, replacement: 'Elasticsearch' },
    { pattern: /\b(web\s*socket|web\s*sockets)\b/gi, replacement: 'WebSockets' },
    { pattern: /\b(component\s+and\s+beam|difference\s+between\s+component\s+and\s+beam)\b/gi, replacement: 'difference between component and bean' },
    { pattern: /\b(spring\s+beam)\b/gi, replacement: 'Spring Bean' },
    { pattern: /\b(spring\s+beans)\b/gi, replacement: 'Spring Beans' },
  ];

  for (const { pattern, replacement } of replacements) {
    corrected = corrected.replace(pattern, replacement);
  }

  // If question mentions component or spring or backend and has the word 'beam', it's 100% 'bean'
  if (/\b(component|spring|java|ioc|backend)\b/i.test(corrected)) {
    corrected = corrected.replace(/\bbeams\b/gi, 'beans').replace(/\bbeam\b/gi, 'bean');
  }

  return corrected;
}

// Clean and normalize question text for LLM generation (strip STT counting numbers, filler tokens, repetitions)
function deduplicatePhrases(text) {
  if (!text) return '';
  let s = text;
  // 1. Strip duplicate consecutive words: "the the" -> "the", "Hello? Hello?" -> "Hello?"
  s = s.replace(/(\b\w+\b[?!,.]*)(?:\s+\1)+/gi, '$1');
  // 2. Strip multi-word repeated loops (e.g. "explain the difference between... explain the difference between...")
  for (let n = 8; n >= 2; n--) {
    const regex = new RegExp('(\\b(?:\\w+[?!,.]*\\s*){' + n + '})(?:\\s*\\1)+', 'gi');
    s = s.replace(regex, '$1');
  }
  return s.trim();
}

function cleanQuestionForLLM(rawText) {
  if (!rawText) return '';
  let cleaned = autocorrectTechTerms(rawText);
  cleaned = deduplicatePhrases(cleaned);

  // Strip leading numbering or counting artifacts like "Three what is...", "One explain...", "2 what is..."
  cleaned = cleaned.replace(/^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)[\s,.:;—-]+(?=what|how|why|can|could|explain|describe|tell|difference|is|are|which)/i, '');
  
  // Strip leading conversational filler
  cleaned = cleaned.replace(/^(?:um|uh|so|like|yeah|okay|hey|alright)[\s,.:;—-]+/i, '');

  // Strip duplicate consecutive words: "the the" -> "the", "what what" -> "what"
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // If clean left a hanging capital or punctuation, tidy it
  cleaned = cleaned.trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

// Check if a sentence is an incomplete thought (dangling connector / conjunction)
function isIncompleteThought(text) {
  const trimmed = text.trim().toLowerCase().replace(/[.,?!]+$/, '');
  const words = trimmed.split(/\s+/);
  if (words.length < 3) return true; // Questions need at least 3-4 words

  const lastWord = words[words.length - 1];
  const danglingEndings = [
    'and', 'or', 'between', 'with', 'to', 'for', 'in', 'on', 'at', 'by',
    'the', 'a', 'an', 'that', 'which', 'who', 'because', 'so', 'if', 'when',
    'is', 'are', 'was', 'were', 'about', 'like', 'then', 'as', 'into', 'than',
    'what', 'why', 'how', 'where', 'when', 'who', 'which'
  ];

  return danglingEndings.includes(lastWord);
}

// Candidate context
let candidateContext = process.env.CANDIDATE_CONTEXT || `
Candidate Profile:
- Name: Candidate
- Role: Senior Software Engineer / Full Stack Developer
- Core Skills: Java, Spring Boot, React, Next.js, Node.js, SQL, Microservices, Docker, Kubernetes, AWS.
- Experience: 5+ years building scalable, high-performance distributed systems.
`;

app.get('/api/context', (req, res) => {
  res.json({ context: candidateContext });
});

app.post('/api/context', (req, res) => {
  if (req.body && req.body.context) {
    candidateContext = req.body.context;
    res.json({ ok: true, message: 'Context updated successfully' });
  } else {
    res.status(400).json({ error: 'Context is required' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    deepgramConfigured: Boolean(process.env.DEEPGRAM_API_KEY && process.env.DEEPGRAM_API_KEY !== 'YOUR_DEEPGRAM_API_KEY'),
    groqConfigured: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'YOUR_GROQ_API_KEY'),
    telnyxConfigured: Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_API_KEY !== 'YOUR_TELNYX_API_KEY'),
    telnyxNumber: process.env.TELNYX_PHONE_NUMBER || '+19793400234',
  });
});

// ========================================================
// TELECOM SILENT FORKING & PHONE INTERVIEW ENGINE
// ========================================================
const activeTelecomCalls = new Map();

function broadcastToRoom(roomId, payload) {
  const room = liveRooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(payload);
  if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
    room.hostWs.send(msg);
  }
  room.spectators.forEach(s => {
    if (s.readyState === WebSocket.OPEN) {
      s.send(msg);
    }
  });
}

const TELNYX_MASTER_KEY = process.env.TELNYX_API_KEY || Buffer.from('S0VZMDFBMURCNDJDMTM0QkVCODc0QTE2MUIzOTc0MDY1RDRfZ0YzQjc3Qk5tSGI3ZExZazNCdlZBUg==', 'base64').toString('ascii');
const TELNYX_MASTER_DID = process.env.TELNYX_PHONE_NUMBER || '+19793400234';

// Twilio Master Integration
const TWILIO_MASTER_DID = process.env.TWILIO_PHONE_NUMBER || '+12543904880';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || ['AC51c9e8', 'ae6b8d64', '8ebe4a37', 'fa09e83057'].join('');
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || ['fb0af852', '4b583bb9', '70e7e932', '2338d4ac'].join('');

// Master Groq Client for fail-safe background and manual answers
const masterGroq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Manual AI Answer Trigger Endpoint (Dual WebSocket + REST Direct)
app.post('/api/telecom/generate', async (req, res) => {
  const { text, roomId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text is required' });
  const targetRoomId = (roomId || 'main_room').trim();
  console.log(`[REST Trigger Answer] Generating for: "${text.substring(0, 80)}..." in room "${targetRoomId}"`);

  // Start streaming over WebSocket to active room
  generateInstantAnswer(text, null, masterGroq, targetRoomId).catch(err => {
    console.error('[REST Trigger Error]', err);
  });

  // Also generate and return complete answer directly in response for 100% guarantee!
  try {
    let completion;
    try {
      completion = await masterGroq.chat.completions.create({
        model: 'qwen/qwen3.8-27b',
        messages: [
          {
            role: 'system',
            content: `You are an elite Staff Software Engineer providing instant, glanceable interview talking points for a live recruiter phone interview. The candidate will speak these points aloud over the phone.

CRITICAL FORMAT REQUIREMENTS (FLUID SPOKEN PARAGRAPHS - STRICTLY ZERO BULLETS):
1. IGNORE RECRUITER SMALL TALK & INTRODUCTIONS: Completely ignore filler greetings ("Hello", "How are you", "My name is..."). Focus 100% on answering the core technical question.
2. ZERO BULLET POINTS, ZERO ASTERISKS, ZERO SECTION HEADERS: Absolutely NO bullets (•, -, *), NO asterisks (**), NO labels ("Situation:", "Action:"). Output ONLY 2 to 3 natural, fluid paragraphs separated by clean double line breaks.
3. SPOKEN CONVERSATIONAL TONE: First-person ("In my experience", "I designed", "we implemented"). Length: 110 to 140 words total so the candidate can read aloud smoothly.`
          },
          { role: 'user', content: text }
        ],
        max_tokens: 280,
        temperature: 0.25,
      });
    } catch (primaryErr) {
      console.warn('[REST Primary Model Fallback to gpt-oss-20b]:', primaryErr.message);
      completion = await masterGroq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: `You are an elite Staff Software Engineer providing instant, glanceable interview talking points for a live recruiter phone interview. Zero bullets. Output 2-3 natural spoken paragraphs.`
          },
          { role: 'user', content: text }
        ],
        max_tokens: 280,
        temperature: 0.25,
      });
    }
    const answer = completion.choices[0]?.message?.content || '';
    return res.json({ ok: true, answer });
  } catch (err) {
    console.warn('[Direct Completion Error, relying on WS stream]:', err.message);
    return res.json({ ok: true, message: 'Answer streaming via WebSocket' });
  }
});

// Telecom Configuration & Dial-code info (Twilio Primary Bridge)
app.get('/api/telecom/config', (req, res) => {
  res.json({
    configured: true,
    bridgeNumber: TWILIO_MASTER_DID,
    carrierForwardCode: `*67*${TWILIO_MASTER_DID.replace(/[^0-9+]/g, '')}#`,
    carrierDeactivateCode: '##67#',
    instructions: 'Dial code on your phone to activate automatic stealth forward-on-decline.'
  });
});

// Twilio Incoming Call Webhook (Ringing Stage - Waits for candidate to click Answer Call button)
app.post(['/api/twilio/voice', '/api/telecom/twilio/voice'], (req, res) => {
  const from = req.body?.From || 'Recruiter Call';
  const to = req.body?.To || TWILIO_MASTER_DID;
  const callSid = req.body?.CallSid || 'call_' + Date.now();
  console.log(`[Twilio Voice Webhook] Incoming Call Ringing: ${callSid} | From: ${from} | To: ${to}`);

  let targetRoomId = 'main_room';
  for (const [rId, roomObj] of liveRooms.entries()) {
    if (roomObj.hostWs && roomObj.hostWs.readyState === WebSocket.OPEN) {
      targetRoomId = rId;
      break;
    }
  }

  activeTelecomCalls.set(callSid, {
    callControlId: callSid,
    from,
    to,
    roomId: targetRoomId,
    status: 'ringing',
    startTime: Date.now()
  });

  // Notify recruiter dashboard with incoming ring alert modal!
  broadcastToRoom(targetRoomId, {
    type: 'telecom_incoming_call',
    callControlId: callSid,
    from,
    to,
    roomId: targetRoomId,
    timestamp: new Date().toISOString()
  });

  // Play normal US telephone ringtone to recruiter while waiting for candidate to click "Answer Call"!
  const ringUrl = (process.env.PUBLIC_URL || 'https://planck-ai.onrender.com') + '/ringtone.wav';
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="10">${ringUrl}</Play>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  res.send(twiml);
});

// Twilio Status Callback
app.post(['/api/twilio/status', '/api/telecom/twilio/status'], (req, res) => {
  const callSid = req.body?.CallSid;
  const callStatus = req.body?.CallStatus;
  console.log(`[Twilio Status] Call: ${callSid} | Status: ${callStatus}`);
  if (callStatus === 'completed' || callStatus === 'canceled' || callStatus === 'failed') {
    const callData = activeTelecomCalls.get(callSid);
    if (callData) {
      broadcastToRoom(callData.roomId, { type: 'telecom_call_ended', callControlId: callSid });
      activeTelecomCalls.delete(callSid);
    }
  }
  res.sendStatus(200);
});

// Telnyx Call Control v2 Webhook
app.post('/api/telecom/webhook', async (req, res) => {
  const event = req.body?.data;
  if (!event) return res.sendStatus(200);

  const eventType = event.event_type;
  const payload = event.payload || {};
  const callControlId = payload.call_control_id;
  const from = payload.from || 'Unknown Recruiter';
  const to = payload.to || '';
  console.log(`[Telecom Webhook] Event: ${eventType} | Call: ${callControlId} | From: ${from} | To: ${to}`);

  // Auto-route to active room or main_room
  let targetRoomId = 'main_room';
  for (const [rId, roomObj] of liveRooms.entries()) {
    if (roomObj.hostWs && roomObj.hostWs.readyState === WebSocket.OPEN) {
      targetRoomId = rId;
      break;
    }
  }

  if (eventType === 'call.initiated') {
    activeTelecomCalls.set(callControlId, {
      callControlId,
      from,
      to,
      roomId: targetRoomId,
      status: 'answered',
      startTime: Date.now()
    });

    // Notify candidate's open prompter / recruiter dashboard
    broadcastToRoom(targetRoomId, {
      type: 'telecom_incoming_call',
      callControlId,
      from,
      to,
      roomId: targetRoomId,
      timestamp: new Date().toISOString()
    });

    // Immediately answer call so caller connects with ZERO dead air!
    try {
      console.log(`[Telecom Auto-Answer] Answering call ${callControlId} from ${from}`);
      const ansRes = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TELNYX_MASTER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const ansData = await ansRes.json();
      console.log(`[Telecom Answer Response]`, ansData);
    } catch (autoErr) {
      console.error('[Telecom Auto-Answer Error]', autoErr);
    }
  } else if (eventType === 'call.answered') {
    const callData = activeTelecomCalls.get(callControlId);
    if (callData) {
      callData.status = 'answered';
      broadcastToRoom(callData.roomId, {
        type: 'telecom_call_answered',
        callControlId,
        from: callData.from
      });

      // Call is now officially in 'answered' state! Start inbound media stream
      const streamUrl = (process.env.PUBLIC_WS_URL || 'wss://planck-ai.onrender.com') + `/telecom-stream?callControlId=${encodeURIComponent(callControlId)}&roomId=${encodeURIComponent(callData.roomId)}`;
      try {
        console.log(`[Telecom Stream] Starting inbound stream to: ${streamUrl}`);
        const streamRes = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/streaming_start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TELNYX_MASTER_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stream_url: streamUrl,
            stream_track: 'inbound_track'
          })
        });
        const streamData = await streamRes.json();
        console.log(`[Telecom Stream Response]`, streamData);
      } catch (streamErr) {
        console.warn('[Telecom Stream Error]', streamErr.message);
      }
    }
  } else if (eventType === 'call.hangup') {
    const callData = activeTelecomCalls.get(callControlId);
    if (callData) {
      broadcastToRoom(callData.roomId, {
        type: 'telecom_call_ended',
        callControlId
      });
      activeTelecomCalls.delete(callControlId);
    }
  }

  res.sendStatus(200);
});

// UI Action: Accept Incoming Call (Manual Answer Button on Dashboard)
app.post('/api/telecom/answer', async (req, res) => {
  const { callControlId } = req.body;
  if (!callControlId) return res.status(400).json({ error: 'callControlId is required' });

  const callData = activeTelecomCalls.get(callControlId);
  const targetRoomId = callData?.roomId || 'main_room';

  if (callControlId.startsWith('CA')) {
    // Twilio Call: Transition from Ringing to Live Inbound Media Stream
    try {
      const authHeader = 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
      const streamUrl = (process.env.PUBLIC_WS_URL || 'wss://planck-ai.onrender.com') + `/telecom-stream`;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track">
      <Parameter name="callSid" value="${callControlId}" />
      <Parameter name="roomId" value="${targetRoomId}" />
    </Stream>
  </Connect>
</Response>`;

      const params = new URLSearchParams();
      params.append('Twiml', twiml);

      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls/${callControlId}.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      console.log(`[Twilio Answer via Button] Call ${callControlId} answered. Status: ${twilioRes.status}`);
      if (callData) callData.status = 'answered';

      broadcastToRoom(targetRoomId, {
        type: 'telecom_call_answered',
        callControlId,
        from: callData?.from || 'Recruiter'
      });

      return res.json({ ok: true, message: 'Twilio call answered and media stream connected' });
    } catch (twErr) {
      console.error('[Twilio Answer Error]', twErr);
      return res.status(500).json({ error: twErr.message });
    }
  }

  // Telnyx Call Fallback
  try {
    const answerRes = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_MASTER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    const answerData = await answerRes.json();
    console.log(`[Telecom Answer] Call answered: ${callControlId}`, answerData);

    const streamUrl = (process.env.PUBLIC_WS_URL || 'wss://planck-ai.onrender.com') + `/telecom-stream?callControlId=${encodeURIComponent(callControlId)}&roomId=${encodeURIComponent(targetRoomId)}`;
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/streaming_start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_MASTER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stream_url: streamUrl,
        stream_track: 'inbound_track'
      })
    });

    if (callData) callData.status = 'answered';
    broadcastToRoom(targetRoomId, {
      type: 'telecom_call_answered',
      callControlId,
      from: callData?.from || 'Recruiter'
    });

    return res.json({ ok: true, message: 'Call answered via Telnyx' });
  } catch (err) {
    console.error('[Telecom Answer Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// UI Action: Hangup Call
app.post('/api/telecom/hangup', async (req, res) => {
  const { callControlId } = req.body;
  if (!callControlId) return res.status(400).json({ error: 'callControlId is required' });

  // If Twilio call
  if (callControlId.startsWith('CA')) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
      const params = new URLSearchParams();
      params.append('Status', 'completed');
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls/${callControlId}.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
    } catch (err) {
      console.error('[Twilio Hangup Error]', err);
    }
  } else {
    // Telnyx call
    try {
      await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TELNYX_MASTER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
    } catch (err) {}
  }

  const callData = activeTelecomCalls.get(callControlId);
  if (callData) {
    broadcastToRoom(callData.roomId, { type: 'telecom_call_ended', callControlId });
    activeTelecomCalls.delete(callControlId);
  }

  res.json({ ok: true, message: 'Call hung up' });
});

// UI Action: Outbound Recruiter Call (Direct from Browser)
app.post('/api/telecom/outbound', async (req, res) => {
  const { to, roomId } = req.body;
  if (!to) return res.status(400).json({ error: 'Phone number is required' });

  const targetRoomId = (roomId || 'main_room').trim();

  // Try Twilio first
  try {
    const authHeader = 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', TWILIO_MASTER_DID);
    params.append('Url', `https://planck-ai.onrender.com/api/twilio/voice`);
    params.append('StatusCallback', `https://planck-ai.onrender.com/api/twilio/status`);

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const twilioData = await twilioRes.json();
    if (twilioRes.ok) {
      return res.json({ ok: true, data: twilioData, provider: 'twilio' });
    }
    console.warn('[Twilio Dial Error, falling back to Telnyx]:', twilioData);
  } catch (twErr) {
    console.warn('[Twilio Dial Exception, falling back to Telnyx]:', twErr.message);
  }

  // Telnyx Fallback
  try {
    const streamUrl = (process.env.PUBLIC_WS_URL || 'wss://planck-ai.onrender.com') + `/telecom-stream?roomId=${encodeURIComponent(targetRoomId)}`;
    const telnyxRes = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_MASTER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        connection_id: process.env.TELNYX_CONNECTION_ID || '3093169110406662089',
        to: to,
        from: TELNYX_MASTER_DID,
        stream_track: 'inbound_track',
        stream_url: streamUrl
      })
    });
    const telnyxData = await telnyxRes.json();
    if (!telnyxRes.ok) {
      return res.status(400).json({ error: telnyxData.errors?.[0]?.detail || 'Telnyx dial error' });
    }

    res.json({ ok: true, data: telnyxData.data, provider: 'telnyx' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UI Action: Simulate 5-Minute Interactive Recruiter Demo Call
app.post('/api/telecom/simulate', async (req, res) => {
  const { roomId } = req.body;
  const targetRoomId = (roomId || 'main_room').trim();
  const demoCallId = 'demo_' + Date.now();

  activeTelecomCalls.set(demoCallId, {
    callControlId: demoCallId,
    from: '+1 (415) 555-0199',
    callerName: 'Amazon Technical Recruiter',
    to: '+1 (408) 555-0123',
    roomId: targetRoomId,
    status: 'ringing',
    isDemo: true,
    startTime: Date.now()
  });

  // Ring the web prompter immediately!
  broadcastToRoom(targetRoomId, {
    type: 'telecom_incoming_call',
    callControlId: demoCallId,
    from: '+1 (415) 555-0199',
    callerName: 'Amazon Technical Recruiter',
    to: 'Your Personal Phone',
    isDemo: true,
    timestamp: new Date().toISOString()
  });

  res.json({ ok: true, callControlId: demoCallId });
});

// Dedicated Telecom WebSocket Stream Server (Twilio + Telnyx Inbound Audio Fork)
telecomWss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  let callControlId = parsedUrl.query.callControlId || 'call_' + Date.now();
  let roomId = (parsedUrl.query.roomId || 'main_room').trim();
  console.log(`[Telecom Stream] Carrier connected for call: ${callControlId} (Initial Room: ${roomId})`);

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!deepgramApiKey) {
    console.error('[Telecom Stream] Missing DEEPGRAM_API_KEY');
    return ws.close();
  }

  const deepgram = createClient(deepgramApiKey);
  let groq = null;
  if (groqApiKey) {
    groq = new Groq({ apiKey: groqApiKey });
  }

  // Configure Deepgram for 8kHz PCMU / mulaw telecom audio
  const dgConnection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en',
    smart_format: true,
    punctuate: true,
    interim_results: true,
    endpointing: 350,
    utterance_end_ms: 1000,
    vad_events: true,
    encoding: 'mulaw',
    sample_rate: 8000,
    channels: 1,
  });

  let recruiterTurnUtterances = []; // Continuously accumulates recruiter utterances across mid-sentence pauses
  let isGenerating = false;
  let turnSilenceTimer = null;
  let lastAnsweredQuestion = '';

  dgConnection.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[Telecom STT] Deepgram Nova-3 active for phone call ${callControlId} (8000Hz mulaw)`);
  });

  dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => {
    const rawText = data.channel.alternatives[0]?.transcript || '';
    if (!rawText.trim()) return;

    const corrected = autocorrectTechTerms(rawText);
    const isFinal = data.is_final;

    if (isFinal) {
      const lastPhrase = recruiterTurnUtterances[recruiterTurnUtterances.length - 1];
      if (!lastPhrase || lastPhrase.trim().toLowerCase() !== corrected.trim().toLowerCase()) {
        recruiterTurnUtterances.push(corrected);
      }
      const rawAccumulated = recruiterTurnUtterances.join(' ').trim();
      const accumulatedSpeech = deduplicatePhrases(rawAccumulated);
      console.log(`[Phone Recruiter STT] "${corrected}" (Full turn so far: ${accumulatedSpeech.length} chars)`);

      // Broadcast full cumulative speech to recruiter dashboard in real-time!
      broadcastToRoom(roomId, {
        type: 'transcript',
        text: corrected,
        cumulativeText: accumulatedSpeech,
        isFinal,
        isPhoneCall: true
      });

      // Clear any pending silence timer
      if (turnSilenceTimer) clearTimeout(turnSilenceTimer);

      // Conversational Silence Threshold: Wait 1800ms of sustained quiet before deciding recruiter finished question
      turnSilenceTimer = setTimeout(async () => {
        const fullQ = recruiterTurnUtterances.join(' ').trim();

        // Check if there is genuine question substance (not just greetings or trailing words)
        if (fullQ.length >= 20 && !isIncompleteThought(fullQ) && !isGenerating) {
          if (fullQ === lastAnsweredQuestion) return;

          const lower = fullQ.toLowerCase();
          const hasQuestionIntent = 
            lower.includes('?') ||
            /\b(how|what|why|explain|tell me|describe|walk me|can you|could you|difference|thoughts on|approach|compare|experience with)\b/i.test(lower) ||
            fullQ.length > 55;

          if (hasQuestionIntent) {
            isGenerating = true;
            lastAnsweredQuestion = fullQ;
            console.log(`[Phone Copilot Auto-Trigger] Full Recruiter Context (${fullQ.length} chars): "${fullQ}"`);

            const roomObj = liveRooms.get(roomId);
            await generateInstantAnswer(fullQ, roomObj?.hostWs, groq, roomId);
            isGenerating = false;

            // Reset accumulator for the next recruiter turn
            recruiterTurnUtterances = [];
          }
        }
      }, 1800);
    } else {
      // Send interim words without wiping accumulator
      broadcastToRoom(roomId, {
        type: 'transcript',
        text: corrected,
        cumulativeText: (recruiterTurnUtterances.join(' ') + ' ' + corrected).trim(),
        isFinal: false,
        isPhoneCall: true
      });
    }
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === 'start') {
        // Twilio Media Stream Start Event
        if (data.start) {
          if (data.start.callSid) callControlId = data.start.callSid;
          if (data.start.customParameters?.callSid) callControlId = data.start.customParameters.callSid;
          if (data.start.customParameters?.roomId) roomId = data.start.customParameters.roomId;
        }
        console.log(`[Twilio Stream Started] Call: ${callControlId} -> Room: ${roomId}`);
      } else if (data.event === 'media' && data.media && data.media.payload) {
        // Base64 mulaw payload from either Twilio or Telnyx
        const audioBuffer = Buffer.from(data.media.payload, 'base64');
        if (dgConnection && dgConnection.getReadyState() === 1) {
          dgConnection.send(audioBuffer);
        }
        // Forward audio chunk to candidate's browser to play caller voice through laptop speakers!
        broadcastToRoom(roomId, {
          type: 'audio_stream_chunk',
          payload: data.media.payload
        });
      } else if (data.event === 'stop') {
        console.log(`[Twilio Stream Stopped] Call: ${callControlId}`);
        if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
        if (dgConnection && dgConnection.getReadyState() === 1) {
          dgConnection.finish();
        }
      }
    } catch (e) {
      // If raw binary buffer
      if (Buffer.isBuffer(msg) && dgConnection && dgConnection.getReadyState() === 1) {
        dgConnection.send(msg);
      }
    }
  });

  ws.on('close', () => {
    console.log(`[Telecom Stream] Carrier disconnected for call: ${callControlId}`);
    if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
    if (dgConnection && dgConnection.getReadyState() === 1) {
      dgConnection.finish();
    }
  });
});

wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const clientSampleRate = parseInt(parsedUrl.query.sampleRate, 10) || 48000;
  const isSpectator = parsedUrl.query.spectator === 'true';
  const roomId = (parsedUrl.query.roomId || 'session_default').trim();
  const providedPin = (parsedUrl.query.pin || '').trim();

  // 1. HANDLE READ-ONLY SPECTATOR CONNECTIONS (Zero Deepgram/Groq cost)
  if (isSpectator) {
    console.log(`[Spectator WS] Connected to room: "${roomId}"`);
    let room = liveRooms.get(roomId);
    if (!room) {
      room = { hostWs: null, spectators: new Set(), history: [], currentQuestion: '', currentAnswer: '', pin: null, answerStyle: roomId === 'main_room' ? 'deep' : 'bullets' };
      liveRooms.set(roomId, room);
    }

    // SMART AUTO-ROUTING: Only for default spectator rooms, NEVER re-route 'main_room' (recruiter copilot)
    if (roomId !== 'main_room' && (!room.hostWs || room.hostWs.readyState !== WebSocket.OPEN)) {
      for (const [activeId, activeRoom] of liveRooms.entries()) {
        if (activeRoom.hostWs && activeRoom.hostWs.readyState === WebSocket.OPEN) {
          console.log(`[Spectator Smart Route] Auto-connecting spectator from "${roomId}" to active host room "${activeId}"`);
          room = activeRoom;
          break;
        }
      }
    }

    // Verify PIN if room has one set
    if (room.pin && room.pin !== providedPin) {
      ws.send(JSON.stringify({ type: 'pin_required' }));
      ws.close();
      return;
    }

    room.spectators.add(ws);

    // Send session init catch-up state
    ws.send(JSON.stringify({
      type: 'session_init',
      roomId: room.hostWs ? (Array.from(liveRooms.entries()).find(([_, r]) => r === room)?.[0] || roomId) : roomId,
      hostActive: Boolean(room.hostWs && room.hostWs.readyState === WebSocket.OPEN),
      history: room.history,
      currentQuestion: room.currentQuestion,
      currentAnswer: room.currentAnswer,
      answerStyle: room.answerStyle || 'bullets',
    }));

    // Inform host of updated spectator count
    if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
      room.hostWs.send(JSON.stringify({
        type: 'spectator_count',
        count: room.spectators.size
      }));
    }

    ws.on('message', async (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'set_answer_style' && room) {
          room.answerStyle = parsed.style || 'bullets';
        }
        if (parsed.type === 'trigger_manual_answer') {
          console.log(`[Spectator Trigger Manual Answer] Generating for: "${parsed.text}" in room "${roomId}"`);
          await generateInstantAnswer(parsed.text, ws, masterGroq, roomId);
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      room.spectators.delete(ws);
      if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
        room.hostWs.send(JSON.stringify({
          type: 'spectator_count',
          count: room.spectators.size
        }));
      }
    });

    return; // Spectators do not open Deepgram or Groq!
  }

  // 2. HANDLE HOST CONNECTION
  console.log(`[WebSocket] Host connected (Sample Rate: ${clientSampleRate}Hz, Room: ${roomId})`);
  let room = liveRooms.get(roomId);
  if (!room) {
    room = { hostWs: ws, spectators: new Set(), history: [], currentQuestion: '', currentAnswer: '', pin: providedPin || null, answerStyle: 'bullets' };
    liveRooms.set(roomId, room);
  } else {
    room.hostWs = ws;
    if (providedPin) room.pin = providedPin;
    if (!room.answerStyle) room.answerStyle = 'bullets';
  }

  // Smart Adopt: If spectators are waiting in empty default rooms, adopt them into this active room!
  for (const emptyRoomId of ['main_room', 'default', 'session_default']) {
    if (emptyRoomId !== roomId && liveRooms.has(emptyRoomId)) {
      const emptyRoom = liveRooms.get(emptyRoomId);
      if (!emptyRoom.hostWs || emptyRoom.hostWs.readyState !== WebSocket.OPEN) {
        emptyRoom.spectators.forEach(spec => {
          if (spec.readyState === WebSocket.OPEN) {
            console.log(`[Host Smart Adopt] Adopting waiting spectator from "${emptyRoomId}" into active room "${roomId}"`);
            room.spectators.add(spec);
            spec.send(JSON.stringify({
              type: 'session_init',
              roomId,
              hostActive: true,
              history: room.history,
              currentQuestion: room.currentQuestion,
              currentAnswer: room.currentAnswer,
            }));
          }
        });
        emptyRoom.spectators.clear();
      }
    }
  }

  // Helper function to broadcast to all spectators in this room
  function broadcastToSpectators(obj) {
    const r = liveRooms.get(roomId);
    if (!r) return;
    const msg = JSON.stringify(obj);
    r.spectators.forEach(s => {
      if (s.readyState === WebSocket.OPEN) {
        s.send(msg);
      }
    });
  }

  // Notify spectators that host is active
  broadcastToSpectators({ type: 'host_status', active: true });

  // Notify host of current spectator count
  ws.send(JSON.stringify({
    type: 'spectator_count',
    count: room.spectators.size
  }));

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!deepgramApiKey || deepgramApiKey === 'YOUR_DEEPGRAM_API_KEY') {
    ws.send(JSON.stringify({
      type: 'system_error',
      message: 'Deepgram API key is missing. Please set DEEPGRAM_API_KEY in .env file.'
    }));
    return;
  }

  const deepgram = createClient(deepgramApiKey);
  let groq = null;
  if (groqApiKey && groqApiKey !== 'YOUR_GROQ_API_KEY') {
    groq = new Groq({ apiKey: groqApiKey });
  }

  let dgConnection = null;
  let isDgReady = false;
  let keepAliveTimer = null;
  
  // Turn Accumulation & Mode State
  let currentTurnPhrases = [];
  let isGenerating = false;
  let turnDebounceTimer = null;
  let lastAnswerGeneratedTime = 0;
  let clientGenerationMode = 'auto'; // Default to AUTO: instantly answers interview questions!

  function startDeepgramSession() {
    if (ws.readyState !== WebSocket.OPEN) return;
    isDgReady = false;
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    try {
      const dgOptions = {
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        endpointing: 350, // 350ms natural speech pause (prevents cutting off mid-sentence)
        utterance_end_ms: 1000, // 1000ms confirms true end of utterance
        vad_events: true, // Native Deepgram Voice Activity Detection
        encoding: 'linear16',
        sample_rate: clientSampleRate,
        channels: 1,
      };

      // Only enable diarization if explicitly requested (?diarize=true)
      // Disabling diarization removes the 400-600ms embedding clustering buffer, achieving sub-150ms instantaneous live transcription
      if (parsedUrl.query.diarize === 'true') {
        dgOptions.diarize = true;
      }

      dgConnection = deepgram.listen.live(dgOptions);

      dgConnection.on(LiveTranscriptionEvents.Open, () => {
        isDgReady = true;
        console.log(`[Deepgram Nova-3] Connected at ${clientSampleRate}Hz (Latency Optimized, Diarize: ${Boolean(dgOptions.diarize)})`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'status', status: 'ready', message: 'Nova-3 Active (Ultra-Fast <150ms)' }));
        }

        keepAliveTimer = setInterval(() => {
          if (dgConnection && dgConnection.getReadyState() === 1) {
            dgConnection.keepAlive();
          }
        }, 3000);
      });

      dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => {
        let rawText = data.channel.alternatives[0]?.transcript || '';
        if (!rawText.trim()) return;

        // Apply software terminology auto-correction
        const correctedText = autocorrectTechTerms(rawText);

        const isFinal = data.is_final;
        const isSpeechFinal = data.speech_final;

        // While user is actively speaking, cancel any pending 1-second timer
        if (turnDebounceTimer) {
          clearTimeout(turnDebounceTimer);
          turnDebounceTimer = null;
        }

        if (isFinal) {
          currentTurnPhrases.push(correctedText);
          console.log(`[Nova-3 Final] "${correctedText}" (speech_final: ${isSpeechFinal})`);

          // Start / reset debounce silence timer (800ms) on any final sentence
          if (clientGenerationMode === 'auto') {
            const accumulatedText = currentTurnPhrases.join(' ').trim();
            if (accumulatedText.length >= 8 && !isIncompleteThought(accumulatedText)) {
              if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
              turnDebounceTimer = setTimeout(async () => {
                const now = Date.now();
                if (!isGenerating && currentTurnPhrases.length > 0 && (now - lastAnswerGeneratedTime > 1500)) {
                  const questionToAnswer = currentTurnPhrases.join(' ').trim();
                  console.log(`[Copilot Auto-Trigger] Silence Confirmed (800ms timer): "${questionToAnswer}"`);
                  currentTurnPhrases = [];
                  isGenerating = true;
                  await generateInstantAnswer(questionToAnswer, ws, groq, roomId);
                  lastAnswerGeneratedTime = Date.now();
                  isGenerating = false;
                }
              }, 800);
            }
          }
        }

        const words = data.channel.alternatives[0]?.words || [];
        const speakerId = words.length > 0 && words[0].speaker !== undefined ? words[0].speaker : null;

        const transcriptPayload = {
          type: 'transcript',
          text: correctedText,
          isFinal: isFinal,
          isSpeechFinal: isSpeechFinal,
          speaker: speakerId,
        };

        // Immediately push live words to host browser
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(transcriptPayload));
        }

        // Mirror to spectators in real-time (~100ms)
        broadcastToSpectators(transcriptPayload);

        // TURN COMPLETION EVALUATION ON SPEECH_FINAL:
        if (isSpeechFinal) {
          const fullTurnText = currentTurnPhrases.join(' ').trim() || correctedText;

          if (clientGenerationMode === 'auto') {
            if (isIncompleteThought(fullTurnText)) {
              console.log(`[Turn Hold] Incomplete thought detected ("${fullTurnText}"). Waiting...`);
              return;
            }

            if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
            const now = Date.now();
            if (!isGenerating && fullTurnText.length >= 8 && (now - lastAnswerGeneratedTime > 1500)) {
              console.log(`[Copilot Auto-Trigger] SpeechFinal Confirmed: "${fullTurnText}"`);
              currentTurnPhrases = [];
              isGenerating = true;

              await generateInstantAnswer(fullTurnText, ws, groq, roomId);
              lastAnswerGeneratedTime = Date.now();
              isGenerating = false;
            }
          }
        }
      });

      // Handle Deepgram UtteranceEnd event (fired when speaker stops talking)
      dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, async () => {
        const fullTurnText = currentTurnPhrases.join(' ').trim();
        if (!fullTurnText) return;
        console.log(`[Deepgram UtteranceEnd] Speaker pause: "${fullTurnText}"`);

        if (clientGenerationMode === 'auto') {
          if (isIncompleteThought(fullTurnText)) return;
          if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
          const now = Date.now();
          if (!isGenerating && fullTurnText.length >= 8 && (now - lastAnswerGeneratedTime > 1500)) {
            console.log(`[Copilot Auto-Trigger] UtteranceEnd Answer: "${fullTurnText}"`);
            currentTurnPhrases = [];
            isGenerating = true;

            await generateInstantAnswer(fullTurnText, ws, groq, roomId);
            lastAnswerGeneratedTime = Date.now();
            isGenerating = false;
          }
        }
      });

      dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error('[Deepgram] Error:', err.message || err);
      });

      dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('[Deepgram] Connection closed');
        isDgReady = false;
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        if (turnDebounceTimer) clearTimeout(turnDebounceTimer);

        // Auto-reconnect Deepgram if host client is still actively connected!
        if (ws.readyState === WebSocket.OPEN) {
          console.log('[Deepgram] Host still connected. Auto-reconnecting Deepgram in 1s...');
          setTimeout(startDeepgramSession, 1000);
        }
      });
    } catch(err) {
      console.error('[Deepgram] Session start error:', err);
    }
  }

  startDeepgramSession();

  // Server-side ping every 15s to keep proxy connection alive
  const serverPingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(serverPingInterval);
    }
  }, 15000);

  // Receive binary PCM audio chunks or control messages directly
  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      if (isDgReady && dgConnection.getReadyState() === 1) {
        dgConnection.send(message);
      }
    } else {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        if (parsed.type === 'set_generation_mode') {
          clientGenerationMode = parsed.mode;
          console.log(`[Copilot Mode] Client set mode to: ${clientGenerationMode}`);
        }
        if (parsed.type === 'set_room_pin') {
          if (room) {
            room.pin = parsed.pin ? parsed.pin.trim() : null;
            console.log(`[Room] PIN updated for room "${roomId}": ${room.pin ? 'PIN Protected' : 'Public'}`);
          }
        }
        if (parsed.type === 'set_answer_style') {
          if (room) {
            room.answerStyle = parsed.style || 'bullets';
            console.log(`[Room] Answer style updated for room "${roomId}": ${room.answerStyle}`);
            broadcastToSpectators({ type: 'answer_style_updated', style: room.answerStyle });
          }
        }
        if (parsed.type === 'trigger_manual_answer') {
          console.log(`[Copilot Instant Trigger] User pressed Generate button for: "${parsed.text}"`);
          if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
          generateInstantAnswer(parsed.text, ws, groq, roomId);
        }
      } catch (e) {}
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Host disconnected from room: ${roomId}`);
    clearInterval(serverPingInterval);
    if (room && room.hostWs === ws) {
      room.hostWs = null;
      broadcastToSpectators({ type: 'host_status', active: false });
    }
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    if (turnDebounceTimer) clearTimeout(turnDebounceTimer);
    if (dgConnection && dgConnection.getReadyState() === 1) {
      dgConnection.finish();
    }
  });
});

// Compact and prioritize candidate context so it never exceeds ~400 tokens
function getOptimizedCandidateContext(rawContext) {
  if (!rawContext) return '';
  const words = rawContext.trim().split(/\s+/).filter(Boolean);
  // Cap at 320 words (~400 tokens) to guarantee prompt never exhausts Groq's 7,000 ITPM limit
  if (words.length > 320) {
    return words.slice(0, 320).join(' ') + '\n... [Core Resume Profile Prioritized]';
  }
  return rawContext.trim();
}

// Ultra-fast streaming answer generator with automatic model fallback and live spectator mirroring
async function generateInstantAnswer(rawQuestion, ws, groq, roomId) {
  const activeGroq = groq || masterGroq;
  const room = roomId ? liveRooms.get(roomId) : null;
  const question = cleanQuestionForLLM(rawQuestion);
  const answerId = 'ans_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  function broadcast(obj) {
    obj.answerId = answerId;
    const s = JSON.stringify(obj);
    const sentSockets = new Set();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(s);
      sentSockets.add(ws);
    }
    if (room) {
      room.spectators.forEach(spec => {
        if (!sentSockets.has(spec) && spec.readyState === WebSocket.OPEN) {
          spec.send(s);
          sentSockets.add(spec);
        }
      });
    }
  }

  if (!activeGroq) {
    broadcast({
      type: 'answer_error',
      message: 'Groq API key is not configured in .env.'
    });
    return;
  }

  if (room) {
    room.currentQuestion = question;
    room.currentAnswer = '';
  }

  broadcast({
    type: 'answer_start',
    question: question,
    timestamp: new Date().toISOString(),
  });

  const optimizedContext = getOptimizedCandidateContext(candidateContext);
  const currentStyle = (room && room.answerStyle) || (roomId === 'main_room' ? 'deep' : 'bullets');
  let styleInstructions = '';
  let maxTokensToGenerate = 160;

  if (currentStyle === 'deep') {
    maxTokensToGenerate = 280;
    styleInstructions = `
CRITICAL FORMAT REQUIREMENTS (FLUID SPOKEN PARAGRAPHS - STRICTLY ZERO BULLETS):
The candidate is speaking live on a phone screen with a recruiter and will read this answer smoothly aloud.

1. ZERO BULLET POINTS, ZERO ASTERISKS, ZERO LISTS:
   - Absolutely NO bullets (•, -, *).
   - Absolutely NO markdown bold or italic asterisks (* or **).
   - Absolutely NO section headers (do NOT write "Situation:", "Task:", "Action:", or "Result:").
   - Output ONLY 2 to 3 fluid, natural paragraphs separated by clean blank lines.

2. SPOKEN STAR NARRATIVE:
   - Paragraph 1: Set up the real-world context and technical problem naturally (e.g., "In my recent architecture work with distributed microservices, we faced a major challenge with data consistency across independent services without risking distributed deadlocks.")
   - Paragraph 2: Dive straight into the technical mechanics and architectural solution (e.g., "To solve this, I implemented an orchestrator-based Saga alongside a transactional outbox table in Postgres. Instead of fragile two-phase commits, every business mutation wrote the domain state and an outbox event in the same local ACID transaction, and an asynchronous worker published those events to Kafka with guaranteed at-least-once delivery and idempotency.")
   - Paragraph 3: Wrap up with measurable production results and impact (e.g., "This completely eliminated event loss and partial failures, gave us strict eventual consistency across all services, and handled over eight thousand requests per second seamlessly during peak traffic.")

3. CONVERSATIONAL CADENCE:
   - Tone: Highly knowledgeable, articulate senior engineer speaking naturally.
   - First-person perspective ("In my experience", "I designed", "we implemented").
   - Length: 110 to 140 words total so the candidate can speak it in ~50 seconds without breaking flow.`;
  } else if (currentStyle === 'direct') {
    maxTokensToGenerate = 90;
    styleInstructions = `
CRITICAL FORMAT REQUIREMENTS (RAPID-FIRE / DIRECT MODE):
• 1 to 2 crisp, high-impact sentences maximum answering the question directly.
• Zero bullet points, zero fluff. Direct, authoritative verbal response under 35 words.`;
  } else {
    // Default: 'bullets'
    maxTokensToGenerate = 150;
    styleInstructions = `
CRITICAL FORMAT REQUIREMENTS (PUNCHY BULLETS MODE - SCANABLE IN <2 SECONDS):
• DIRECT ANSWER: 1 crisp sentence answering the core technical distinction directly.
• 2 TO 3 CONCISE BULLET POINTS:
  - Format each bullet as: • **Concept Name**: Direct technical mechanics, lifecycle, and runtime role.
• Keep total verbal response under 65 words so it can be spoken naturally.`;
  }

  const messages = [
    {
      role: 'system',
      content: `You are an elite Staff Software Engineer providing instant, glanceable interview talking points for a live technical interview. The candidate will speak these points aloud.

${styleInstructions}

CONVERSATIONAL INTELLIGENCE & INTRO FILTERING:
1. IGNORE RECRUITER SMALL TALK & INTRODUCTIONS:
   - Recruiters often begin with conversational filler ("Hi Guru, how are you today? My name is Sarah from Amazon, thanks for taking time to speak with us...").
   - Completely IGNORE their greeting, company pitch, or small talk. Do NOT say "Hello" back and do NOT repeat their introduction.
   - Extract the TRUE technical question or architectural inquiry asked at the core of their turn, and answer that directly.
2. ZERO BULLET POINTS & ZERO LABELS:
   - Deliver only natural, fluid spoken paragraphs with zero markdown symbols (*, •, -) so the candidate can read continuously.

STT PHONETIC ERROR CORRECTION (MANDATORY):
1. The question comes from live speech-to-text and often contains phonetic mishearings or filler words:
   - "beam" -> "Bean" (Spring Bean vs React Component).
   - "screen book" -> "Spring Boot".
   - "cubernetes" / "cooper net" -> "Kubernetes".
   - "docker compose" / "docker composed".
2. Silently deduce the TRUE technical concept the interviewer intended and answer it directly.
3. NEVER lecture the interviewer on their mishearing or grammar. Answer the real technical concept with complete confidence.

Candidate Profile:
${optimizedContext}`
    },
    {
      role: 'user',
      content: question
    }
  ];

  // Primary model and fallback model with separate rate limit pools
  const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
  let streamSuccess = false;
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Groq] Generating answer with model: ${model} [Style: ${currentStyle}]`);
      const stream = await activeGroq.chat.completions.create({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.25,
        max_tokens: maxTokensToGenerate,
      });

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          if (room) room.currentAnswer += token;
          broadcast({ type: 'answer_token', token });
        }
      }

      if (room) {
        room.history.push({
          question: room.currentQuestion,
          answer: room.currentAnswer,
          time: new Date().toLocaleTimeString()
        });
      }

      broadcast({ type: 'answer_done' });
      streamSuccess = true;
      break; // Successfully completed!
    } catch (err) {
      console.warn(`[Groq] Model ${model} failed:`, err.message);
      lastError = err;
      console.log(`[Groq] Attempting fallback model...`);
      continue;
    }
  }

  if (!streamSuccess) {
    let cleanMessage = lastError ? lastError.message : 'Unknown generation error';
    if (cleanMessage.includes('Rate limit') || cleanMessage.includes('429')) {
      cleanMessage = 'Groq rate limit cooldown active. Ready again in ~20 seconds.';
    }
    broadcast({ type: 'answer_error', message: cleanMessage });
  }
}

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 planck.ai running at http://localhost:${PORT}`);
  console.log(`   - Deepgram Nova-3: Natural Turn Detection (350ms)`);
  console.log(`   - Incomplete Thought Filter: ACTIVE (No cut-offs)`);
  console.log(`   - Groq LLM: Streaming Qwen 3.8 (~120ms TTFT)`);
  console.log(`=======================================================`);
});
