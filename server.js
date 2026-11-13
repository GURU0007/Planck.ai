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
const wss = new WebSocket.Server({ server, path: '/ws' });

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

// 2. Main Copilot Workspace Application
app.get('/app', (req, res) => {
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

// Download Standalone Stealth Launcher (.bat) configured for user's room (LockedIn AI style)
app.get('/download/stealth', (req, res) => {
  const host = req.get('host') || 'planck-ai.onrender.com';
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const roomId = (req.query.room || 'main_room').trim();
  const targetUrl = `${protocol}://${host}/live?room=${encodeURIComponent(roomId)}`;

  const batContent = `@echo off
title Planck.ai Stealth Copilot
set "TARGET_URL=${targetUrl}"

echo ========================================================
echo  [Planck.ai] Launching Standalone Stealth Q^&A Copilot...
echo  - Target: %TARGET_URL%
echo  - Invisible to Zoom, Teams ^& Google Meet screen-share
echo ========================================================

if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
) else if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --app="%TARGET_URL%" --window-size=580,640
) else (
    start "" "%TARGET_URL%"
)
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
  ];

  for (const { pattern, replacement } of replacements) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
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
      room = { hostWs: null, spectators: new Set(), history: [], currentQuestion: '', currentAnswer: '', pin: null };
      liveRooms.set(roomId, room);
    }

    // SMART AUTO-ROUTING: If the requested room has no active host, auto-connect to any active host
    if (!room.hostWs || room.hostWs.readyState !== WebSocket.OPEN) {
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
    }));

    // Inform host of updated spectator count
    if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
      room.hostWs.send(JSON.stringify({
        type: 'spectator_count',
        count: room.spectators.size
      }));
    }

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
    room = { hostWs: ws, spectators: new Set(), history: [], currentQuestion: '', currentAnswer: '', pin: providedPin || null };
    liveRooms.set(roomId, room);
  } else {
    room.hostWs = ws;
    if (providedPin) room.pin = providedPin;
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
        endpointing: 200, // 200ms ultra-low pause detection for instant turn finalization
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

        // TURN COMPLETION EVALUATION:
        if (isSpeechFinal) {
          const fullTurnText = currentTurnPhrases.join(' ').trim() || correctedText;

          // Only auto-trigger if the client enabled 'auto' mode
          if (clientGenerationMode === 'auto') {
            if (isIncompleteThought(fullTurnText)) {
              console.log(`[Turn Hold] Incomplete thought detected ("${fullTurnText}"). Waiting...`);
              return;
            }

            // 1000ms (1 Full Second) silence confirmation window for Auto mode
            turnDebounceTimer = setTimeout(async () => {
              const now = Date.now();
              if (!isGenerating && fullTurnText.length >= 10 && (now - lastAnswerGeneratedTime > 2000)) {
                console.log(`[Copilot Auto-Trigger] 1-Second Silence Confirmed: "${fullTurnText}"`);
                currentTurnPhrases = [];
                isGenerating = true;

                await generateInstantAnswer(fullTurnText, ws, groq, roomId);
                lastAnswerGeneratedTime = Date.now();
                isGenerating = false;
              }
            }, 1000);
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
async function generateInstantAnswer(question, ws, groq, roomId) {
  const room = roomId ? liveRooms.get(roomId) : null;

  function broadcast(obj) {
    const s = JSON.stringify(obj);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(s);
    if (room) {
      room.spectators.forEach(spec => {
        if (spec.readyState === WebSocket.OPEN) spec.send(s);
      });
    }
  }

  if (!groq) {
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
  const messages = [
    {
      role: 'system',
      content: `You are an elite Staff Software Engineer speaking out loud on a live technical interview call.

CRITICAL INSTRUCTIONS FOR HUMAN, HIGH-CALIBER TECHNICAL ANSWERS:
1. DEEP TECHNICAL JUSTIFICATION: Answer the specific question directly with concrete engineering mechanics, root causes, trade-offs, or protocols (e.g. connection pool saturation, cache-aside invalidation, partition tolerance, N+1 query overhead, Kafka consumer lag, event-driven idempotency keys, thread contention, write-ahead logs).
2. NO GENERIC JUNIOR CHECKLISTS: STRICTLY FORBIDDEN to give generic procedural fluff like "1. I start by checking Datadog... 2. Then I reproduce... 3. Finally I deploy a fix...". Give the real engineering "why" and "how" with architectural depth.
3. NATURAL SPOKEN ELOQUENCE: Sound like a sharp, articulate engineer speaking naturally in conversation. Use natural phrasing that can be spoken out loud with complete confidence.
4. FORMAT: Provide 2 to 3 dense, impactful points with clear technical justification.
5. STRICTLY NO markdown asterisks or stars (NO ** or *).
6. LENGTH: Around 85 to 110 words of rich, substantive technical value.

Candidate Profile Context:
${optimizedContext}`
    },
    {
      role: 'user',
      content: question
    }
  ];

  // Primary model and fallback model with separate rate limit pools
  const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
  let streamSuccess = false;
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Groq] Generating answer with model: ${model}`);
      const stream = await groq.chat.completions.create({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.25,
        max_tokens: 180,
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
      if (err.status === 429 || err.message?.includes('429') || err.message?.includes('Rate limit')) {
        console.log(`[Groq] Rate limit hit on ${model}, attempting fallback...`);
        continue;
      } else {
        break;
      }
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
