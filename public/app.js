// State variables
let ws = null;
let audioContext = null;
let audioStream = null;
let scriptProcessor = null;
let isRecording = false;
let currentSource = 'mic'; // Default to mic for easy initial testing!
let generationMode = 'auto'; // Default to AUTO real-time AI answer generation!
let currentAnswer = '';
let activeQuestionText = '';
let lastTranscriptText = '';
let qaList = [];
let heartbeatTimer = null;

// DOM Elements
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const sourceTabBtn = document.getElementById('sourceTabBtn');
const sourceMicBtn = document.getElementById('sourceMicBtn');
const instantAnswerBtn = document.getElementById('instantAnswerBtn');
const modeManualBtn = document.getElementById('modeManualBtn');
const modeAutoBtn = document.getElementById('modeAutoBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const audioMeterText = document.getElementById('audioMeterText');
const transcriptContainer = document.getElementById('transcriptContainer');
const emptyPlaceholder = document.getElementById('emptyTranscriptPlaceholder');
const interimBar = document.getElementById('interimBar');
const interimText = document.getElementById('interimText');
const detectedQuestionCard = document.getElementById('detectedQuestionCard');
const detectedQuestionText = document.getElementById('detectedQuestionText');
const answerContent = document.getElementById('answerContent');
const answerStatusBadge = document.getElementById('answerStatusBadge');
const qaHistory = document.getElementById('qaHistory');
const copyAnswerBtn = document.getElementById('copyAnswerBtn');
const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
const apiBanner = document.getElementById('apiBanner');
const apiBannerText = document.getElementById('apiBannerText');

// Context Modal Elements
const openContextBtn = document.getElementById('openContextBtn');
const closeContextBtn = document.getElementById('closeContextBtn');
const cancelContextBtn = document.getElementById('cancelContextBtn');
const contextModal = document.getElementById('contextModal');
const contextTextarea = document.getElementById('contextTextarea');
const saveContextBtn = document.getElementById('saveContextBtn');
const contextSaveStatus = document.getElementById('contextSaveStatus');
const resumeDropZone = document.getElementById('resumeDropZone');
const resumeFileInput = document.getElementById('resumeFileInput');
const uploadStatusBadge = document.getElementById('uploadStatusBadge');
const uploadedFileName = document.getElementById('uploadedFileName');

// Mobile UI Elements
const instantAnswerBtnMobile = document.getElementById('instantAnswerBtnMobile');
const modeManualBtnMobile = document.getElementById('modeManualBtnMobile');
const modeAutoBtnMobile = document.getElementById('modeAutoBtnMobile');
const paneTranscript = document.getElementById('paneTranscript');
const paneAnswers = document.getElementById('paneAnswers');
const toggleAudioBtnText = document.getElementById('toggleAudioBtnText');

// Otter-Style Live Share Elements
const openShareModalBtn = document.getElementById('openShareModalBtn');
const closeShareModalBtn = document.getElementById('closeShareModalBtn');
const shareModal = document.getElementById('shareModal');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');
const copyShareLinkText = document.getElementById('copyShareLinkText');
const sharePinInput = document.getElementById('sharePinInput');
const savePinBtn = document.getElementById('savePinBtn');
const pinSetStatus = document.getElementById('pinSetStatus');
const shareSpectatorCountText = document.getElementById('shareSpectatorCountText');
const spectatorBadgeCount = document.getElementById('spectatorBadgeCount');
const openSpectatorNewTab = document.getElementById('openSpectatorNewTab');

// Persistent Session Room ID (Defaults to main_room so stealth overlay connects automatically)
let hostRoomId = localStorage.getItem('planck_room_id') || 'main_room';
localStorage.setItem('planck_room_id', hostRoomId);
let hostRoomPin = localStorage.getItem('planck_room_pin') || '';

function isMobile() {
  return window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// PDF.js worker setup
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// 1. Initial Checks & Setup
window.addEventListener('DOMContentLoaded', () => {
  // Mobile check: force Mic mode, hide tab sharing (not supported on mobile OS)
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get('mode');

  let initialSource = 'mic';
  if (modeParam === 'recruiter') {
    initialSource = 'tab'; // Only recruiter helper defaults to tab audio!
  } else if (modeParam === 'practice') {
    initialSource = 'mic';
  } else if (modeParam === 'stealth') {
    initialSource = 'mic';
  } else {
    try {
      const saved = localStorage.getItem('planck_audio_source');
      if (saved === 'mic' || saved === 'tab') initialSource = saved;
    } catch (e) {}
  }

  if (isMobile()) {
    initialSource = 'mic';
  }

  setSource(initialSource);
  setGenerationMode('auto');
  checkApiStatus();
  loadContext();
  setupEventListeners();
  applyModeConfiguration(modeParam);
});

function applyModeConfiguration(mode) {
  const banner = document.getElementById('activeModeBanner');
  const badge = document.getElementById('activeModeBadge');
  const text = document.getElementById('activeModeText');
  const downloadStealthHeaderBtn = document.getElementById('downloadStealthHeaderBtn');
  const openStealthHudHeaderBtn = document.getElementById('openStealthHudHeaderBtn');
  const openShareModalBtn = document.getElementById('openShareModalBtn');
  const openContextBtn = document.getElementById('openContextBtn');
  const audioSourceSelector = document.getElementById('audioSourceSelector');
  const transcriptPaneTitle = document.getElementById('transcriptPaneTitle');
  const talkingPointsHeaderLabel = document.getElementById('talkingPointsHeaderLabel');
  const emptyPlaceholderText = document.getElementById('emptyPlaceholderText');
  const paneTranscript = document.getElementById('paneTranscript');
  const paneAnswers = document.getElementById('paneAnswers');

  if (!mode) {
    // Default / All-in-one general mode
    if (paneAnswers) paneAnswers.classList.remove('hidden');
    const mobileBottomBar = document.getElementById('mobileBottomBar');
    if (mobileBottomBar) mobileBottomBar.classList.remove('hidden');
    if (audioSourceSelector) audioSourceSelector.classList.remove('hidden');
    if (downloadStealthHeaderBtn) downloadStealthHeaderBtn.classList.remove('hidden');
    if (openShareModalBtn) openShareModalBtn.classList.remove('hidden');
    if (openContextBtn) openContextBtn.classList.remove('hidden');
    return;
  }

  if (banner) banner.classList.remove('hidden');

  // FIELD-SPECIFIC STRICT FILTERING: Hide unrelated buttons & features
  if (mode === 'recruiter') {
    // Recruiter Call Helper: ONLY field that has Tab Audio!
    if (paneAnswers) paneAnswers.classList.remove('hidden');
    const mobileBottomBar = document.getElementById('mobileBottomBar');
    if (mobileBottomBar) mobileBottomBar.classList.remove('hidden');

    // SHOW TAB AUDIO SELECTOR IN RECRUITER HELPER ONLY
    if (audioSourceSelector) {
      audioSourceSelector.style.setProperty('display', 'flex', 'important');
      audioSourceSelector.classList.remove('hidden');
      audioSourceSelector.classList.add('flex');
    }
    if (sourceTabBtn) {
      sourceTabBtn.disabled = false;
      sourceTabBtn.style.setProperty('display', '', 'important');
      sourceTabBtn.classList.remove('hidden');
    }
    if (sourceMicBtn) {
      sourceMicBtn.disabled = false;
      sourceMicBtn.style.setProperty('display', '', 'important');
      sourceMicBtn.classList.remove('hidden');
    }

    if (downloadStealthHeaderBtn) downloadStealthHeaderBtn.classList.add('hidden');
    if (openStealthHudHeaderBtn) openStealthHudHeaderBtn.classList.add('hidden');
    if (openShareModalBtn) openShareModalBtn.classList.add('hidden');
    if (openContextBtn) openContextBtn.classList.remove('hidden');

    // Default to Tab Audio for Recruiter screening calls
    setSource('tab');

    if (banner) banner.className = 'relative z-20 px-4 sm:px-6 py-2 border-b bg-indigo-950/60 border-indigo-800/60 text-xs flex items-center justify-between shrink-0 shadow-xs';
    if (badge) {
      badge.className = 'font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full text-[10px] bg-indigo-600 text-white';
      badge.textContent = 'Recruiter Helper';
    }
    if (text) text.textContent = 'Tab Audio enabled: Intercept recruiter call audio from Google Meet/Zoom/Phone tab (or switch to Mic). Instant STAR talking points stream in ~120ms.';
    if (transcriptPaneTitle) transcriptPaneTitle.textContent = 'Recruiter Questions & Call Audio';
    if (talkingPointsHeaderLabel) talkingPointsHeaderLabel.innerHTML = '<i data-lucide="sparkles" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400"></i> STAR Talking Points (Situation • Task • Action • Result)';
    if (emptyPlaceholderText) emptyPlaceholderText.innerHTML = '<strong>Recruiter Call Helper:</strong> Click <strong>"Start Listening"</strong> with <strong>Tab Audio</strong> (or switch to Microphone). Upload your resume or JD via <strong>"Upload Resume"</strong>. Instant STAR answers stream in ~120ms.';
  } else if (mode === 'practice') {
    // Otter Practice: Only live transcription & live spectator sharing
    // HIDE SECOND HALF ANSWER GENERATION SCREEN COMPLETELY! ONLY ONE SCREEN FOR HOST!
    if (paneAnswers) paneAnswers.classList.add('hidden');
    const mobileBottomBar = document.getElementById('mobileBottomBar');
    if (mobileBottomBar) mobileBottomBar.classList.add('hidden');

    // STRICTLY DISABLE & REMOVE TAB AUDIO FOR OTTER
    if (audioSourceSelector) {
      audioSourceSelector.style.setProperty('display', 'none', 'important');
      audioSourceSelector.classList.add('hidden');
      audioSourceSelector.classList.remove('md:flex', 'flex');
    }
    if (sourceTabBtn) {
      sourceTabBtn.disabled = true;
      sourceTabBtn.style.setProperty('display', 'none', 'important');
      sourceTabBtn.classList.add('hidden');
    }
    if (downloadStealthHeaderBtn) downloadStealthHeaderBtn.classList.add('hidden');
    if (openStealthHudHeaderBtn) openStealthHudHeaderBtn.classList.add('hidden');
    if (openContextBtn) openContextBtn.classList.add('hidden');
    if (openShareModalBtn) openShareModalBtn.classList.remove('hidden');

    // Make transcript pane take 100% full screen
    if (paneTranscript) {
      paneTranscript.className = 'w-full h-full border-none flex flex-col bg-slate-950 overflow-hidden transition-all';
    }

    // TEXT IN THE MIDDLE LIKE PARTICIPANT FOR OTTER (Centered container)
    const transcriptContainer = document.getElementById('transcriptContainer');
    if (transcriptContainer) {
      transcriptContainer.className = 'flex-1 p-4 sm:p-8 overflow-y-auto space-y-4 max-w-2xl sm:max-w-3xl mx-auto w-full';
    }

    // FORCE SOURCE TO MICROPHONE ONLY (TAB AUDIO DISABLED)
    currentSource = 'mic';
    setSource('mic');

    // Microphone only - Just start speaking is enough
    if (!isRecording) {
      toggleAudioBtn.className = 'bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-2 shadow-md shadow-purple-600/25 transition text-xs sm:text-sm shrink-0';
      toggleAudioBtn.innerHTML = '<i data-lucide="mic" class="w-4 h-4 text-white"></i><span>Start Speaking</span>';
    }

    if (banner) banner.className = 'relative z-20 px-4 sm:px-6 py-2 border-b bg-purple-950/60 border-purple-800/60 text-xs flex items-center justify-between shrink-0 shadow-xs';
    if (badge) {
      badge.className = 'font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full text-[10px] bg-purple-600 text-white';
      badge.textContent = 'Otter Practice';
    }
    if (text) text.textContent = 'Tab audio disabled. Microphone only — just click "Start Speaking" and speak. Text is centered on a single screen.';
    if (transcriptPaneTitle) transcriptPaneTitle.textContent = 'Otter Live Speech Transcription';
    if (emptyPlaceholderText) emptyPlaceholderText.innerHTML = '<strong>Otter Practice Mode:</strong> Tab audio is disabled. Simply click <strong>"Start Speaking"</strong> with your microphone. Spoken words stream in real-time centered in the middle of the screen. Click <strong>"Share Live"</strong> above to mirror this session.';
  } else if (mode === 'stealth') {
    // Interview Copilot (Stealth): NO tab audio selector in this field
    if (paneAnswers) paneAnswers.classList.remove('hidden');
    const mobileBottomBar = document.getElementById('mobileBottomBar');
    if (mobileBottomBar) mobileBottomBar.classList.remove('hidden');
    if (audioSourceSelector) {
      audioSourceSelector.style.setProperty('display', 'none', 'important');
      audioSourceSelector.classList.add('hidden');
      audioSourceSelector.classList.remove('flex');
    }
    if (sourceTabBtn) {
      sourceTabBtn.disabled = true;
      sourceTabBtn.style.setProperty('display', 'none', 'important');
      sourceTabBtn.classList.add('hidden');
    }
    if (openShareModalBtn) openShareModalBtn.classList.add('hidden');
    if (openContextBtn) openContextBtn.classList.add('hidden');
    if (downloadStealthHeaderBtn) downloadStealthHeaderBtn.classList.add('hidden');
    if (openStealthHudHeaderBtn) openStealthHudHeaderBtn.classList.add('hidden');

    if (banner) banner.className = 'relative z-20 px-4 sm:px-6 py-2 border-b bg-emerald-950/60 border-emerald-800/60 text-xs flex items-center justify-between shrink-0 shadow-xs';
    if (badge) {
      badge.className = 'font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white';
      badge.textContent = 'Interview Copilot';
    }
    if (text) text.textContent = 'Only Interview Copilot controls active. 100% Invisible to screenshare & Tab Audio only (zero candidate mic noise).';
    if (transcriptPaneTitle) transcriptPaneTitle.textContent = 'Interviewer Voice (Browser Tab Only)';
    if (talkingPointsHeaderLabel) talkingPointsHeaderLabel.innerHTML = '<i data-lucide="shield-check" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400"></i> Interview Copilot Answers';
    if (emptyPlaceholderText) emptyPlaceholderText.innerHTML = '<strong>Interview Copilot:</strong> 100% invisible on Zoom, Teams & Meet. Click <strong>"Start Listening"</strong> with your interview tab selected. Only the interviewer is captured (your voice is excluded).';
  }

  if (window.lucide) lucide.createIcons();
}

function setSource(source) {
  currentSource = source;
  try { localStorage.setItem('planck_audio_source', source); } catch (e) {}

  const placeholderText = document.getElementById('emptyPlaceholderText');
  const placeholderIcon = document.getElementById('emptyPlaceholderIcon');

  if (source === 'tab') {
    // 1. ORIGINAL INTERVIEW COPILOT: Google Voice / Call Audio Capture
    if (sourceTabBtn) sourceTabBtn.className = 'px-2.5 py-1 rounded-md font-semibold bg-indigo-600 text-white shadow-xs transition';
    if (sourceMicBtn) sourceMicBtn.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white transition';

    if (!isRecording) {
      toggleAudioBtn.className = 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition text-xs sm:text-sm shrink-0';
      toggleAudioBtn.innerHTML = '<i data-lucide="headphones" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i><span class="hidden sm:inline">Start Listening</span><span class="sm:hidden">Listen</span>';
    }

    if (placeholderText && !window.location.search.includes('mode=')) {
      placeholderText.innerHTML = '<strong>Interviewer-Only Mode:</strong> Select your <strong>Google Meet, Zoom, or Call tab</strong> and click <strong>"Start Listening"</strong>. The AI listens <strong>ONLY to the interviewer</strong> (your own voice is excluded). Instant talking points will stream automatically.';
    }
    if (placeholderIcon) {
      placeholderIcon.setAttribute('data-lucide', 'headphones');
    }
  } else {
    // 2. OTTER LIVE MODE: Microphone Speech & Instant Live Share
    if (sourceMicBtn) sourceMicBtn.className = 'px-2.5 py-1 rounded-md font-semibold bg-indigo-600 text-white shadow-xs transition';
    if (sourceTabBtn) sourceTabBtn.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white transition';

    if (!isRecording) {
      toggleAudioBtn.className = 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition text-xs sm:text-sm shrink-0';
      toggleAudioBtn.innerHTML = '<i data-lucide="mic" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i><span class="hidden sm:inline">Start Speaking</span><span class="sm:hidden">Speak</span>';
    }

    if (placeholderText && !window.location.search.includes('mode=')) {
      placeholderText.innerHTML = '<strong>Microphone Mode:</strong> Click <strong>"Start Speaking"</strong> to speak into your microphone and view live transcriptions in ~120ms.';
    }
    if (placeholderIcon) {
      placeholderIcon.setAttribute('data-lucide', 'mic');
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function checkApiStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.deepgramConfigured || !data.groqConfigured) {
      apiBanner.classList.remove('hidden');
      const missing = [];
      if (!data.deepgramConfigured) missing.push('DEEPGRAM_API_KEY');
      if (!data.groqConfigured) missing.push('GROQ_API_KEY');
      apiBannerText.textContent = `Missing API keys: ${missing.join(', ')}. Please update .env and restart.`;
    }
  } catch (err) {
    console.error('Status check failed:', err);
  }
}

async function loadContext() {
  try {
    const res = await fetch('/api/context');
    const data = await res.json();
    contextTextarea.value = data.context || '';
  } catch (err) {
    console.error('Failed to load context:', err);
  }
}

// 2. Event Listeners
function setupEventListeners() {
  toggleAudioBtn.addEventListener('click', toggleRecording);

  if (sourceTabBtn) {
    sourceTabBtn.addEventListener('click', () => {
      if (isRecording) stopRecording();
      setSource('tab');
    });
  }

  if (sourceMicBtn) {
    sourceMicBtn.addEventListener('click', () => {
      if (isRecording) stopRecording();
      setSource('mic');
    });
  }

  // Instant Trigger Button & Keyboard Shortcut
  instantAnswerBtn.addEventListener('click', triggerInstantAnswer);
  if (instantAnswerBtnMobile) {
    instantAnswerBtnMobile.addEventListener('click', triggerInstantAnswer);
  }

  window.addEventListener('keydown', (e) => {
    // Spacebar triggers instant answer if not typing in text field
    if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      triggerInstantAnswer();
    }
  });

  // Mode Selector (Manual vs Auto)
  modeManualBtn.addEventListener('click', () => {
    setGenerationMode('manual');
  });

  modeAutoBtn.addEventListener('click', () => {
    setGenerationMode('auto');
  });

  if (modeManualBtnMobile) {
    modeManualBtnMobile.addEventListener('click', () => {
      setGenerationMode('manual');
    });
  }

  if (modeAutoBtnMobile) {
    modeAutoBtnMobile.addEventListener('click', () => {
      setGenerationMode('auto');
    });
  }

  clearTranscriptBtn.addEventListener('click', () => {
    transcriptContainer.innerHTML = '';
    transcriptContainer.appendChild(emptyPlaceholder);
    emptyPlaceholder.classList.remove('hidden');
  });

  copyAnswerBtn.addEventListener('click', () => {
    if (currentAnswer) {
      navigator.clipboard.writeText(currentAnswer);
      const originalText = copyAnswerBtn.innerHTML;
      copyAnswerBtn.innerHTML = '<span class="text-emerald-600 font-bold">✓ Copied!</span>';
      setTimeout(() => copyAnswerBtn.innerHTML = originalText, 2000);
    }
  });

  // Modal handlers
  openContextBtn.addEventListener('click', () => {
    contextModal.classList.remove('hidden');
    lucide.createIcons();
  });
  closeContextBtn.addEventListener('click', () => contextModal.classList.add('hidden'));
  cancelContextBtn.addEventListener('click', () => contextModal.classList.add('hidden'));

  // Live Share Modal Listeners
  if (openShareModalBtn && shareModal) {
    openShareModalBtn.addEventListener('click', () => {
      updateShareModalInfo();
      shareModal.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    });
  }

  if (closeShareModalBtn && shareModal) {
    closeShareModalBtn.addEventListener('click', () => {
      shareModal.classList.add('hidden');
    });
  }

  if (copyShareLinkBtn) {
    copyShareLinkBtn.addEventListener('click', copyShareLinkBtnAction);
  }

  if (savePinBtn) {
    savePinBtn.addEventListener('click', savePinAction);
  }

  if (sharePinInput) {
    sharePinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        savePinAction();
      }
    });
  }

  if (openSpectatorNewTab) {
    openSpectatorNewTab.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(getShareUrl(), '_blank');
    });
  }

  // Drag and Drop & Resume File Upload handlers
  if (resumeDropZone && resumeFileInput) {
    resumeDropZone.addEventListener('click', () => resumeFileInput.click());

    resumeDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      resumeDropZone.classList.add('border-indigo-600', 'bg-indigo-100/60');
    });

    ['dragleave', 'dragend'].forEach(evt => {
      resumeDropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        resumeDropZone.classList.remove('border-indigo-600', 'bg-indigo-100/60');
      });
    });

    resumeDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      resumeDropZone.classList.remove('border-indigo-600', 'bg-indigo-100/60');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleResumeFile(e.dataTransfer.files[0]);
      }
    });

    resumeFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleResumeFile(e.target.files[0]);
      }
    });
  }

  saveContextBtn.addEventListener('click', async () => {
    const context = contextTextarea.value;
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context })
      });
      if (res.ok) {
        contextSaveStatus.textContent = 'Saved successfully!';
        setTimeout(() => {
          contextSaveStatus.textContent = '';
          contextModal.classList.add('hidden');
        }, 1200);
      }
    } catch (err) {
      contextSaveStatus.textContent = 'Error saving context.';
    }
  });
}

// Parse Resume (PDF, DOCX, TXT, MD) and populate context
async function handleResumeFile(file) {
  if (!file) return;

  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
  const isDocx = lowerName.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isDoc = lowerName.endsWith('.doc') || file.type === 'application/msword';

  uploadStatusBadge.classList.remove('hidden');
  uploadStatusBadge.className = 'text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 mt-2';
  uploadStatusBadge.innerHTML = `<span class="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span> Parsing ${escapeHtml(fileName)}...`;

  try {
    let extractedText = '';

    if (isPdf) {
      if (!window.pdfjsLib) {
        throw new Error('PDF parser is initializing. Please try again in a moment.');
      }
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const pageTexts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const str = textContent.items.map(item => item.str).join(' ');
        pageTexts.push(str);
      }
      extractedText = pageTexts.join('\n\n');
    } else if (isDocx) {
      if (!window.mammoth) {
        throw new Error('DOCX parser is initializing. Please check your connection and try again.');
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      extractedText = result.value || '';
    } else if (isDoc) {
      throw new Error('Legacy .doc format detected. Please save/export your resume as .docx or .pdf for clean parsing.');
    } else {
      extractedText = await file.text();
    }

    if (!extractedText.trim()) {
      throw new Error('No readable text found in the file.');
    }

    // Clean whitespace
    extractedText = extractedText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    contextTextarea.value = extractedText;

    const words = extractedText.split(/\s+/).filter(Boolean).length;
    uploadStatusBadge.className = 'text-xs bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 mt-2';
    uploadStatusBadge.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> <span>${escapeHtml(fileName)} (${words} words extracted)</span>`;
    lucide.createIcons();

    // Auto-save to server
    await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: extractedText })
    });

    contextSaveStatus.textContent = '✓ Active in AI context!';
    setTimeout(() => {
      contextSaveStatus.textContent = '';
    }, 3000);

  } catch (err) {
    console.error('Failed to parse file:', err);
    uploadStatusBadge.className = 'text-xs bg-rose-100 text-rose-800 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 mt-2';
    uploadStatusBadge.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-600"></i> <span>${escapeHtml(err.message)}</span>`;
    lucide.createIcons();
  }
}

function setGenerationMode(mode) {
  generationMode = mode;
  if (mode === 'manual') {
    modeManualBtn.className = 'px-2.5 py-1 rounded font-medium bg-indigo-600 text-white shadow-xs transition';
    modeAutoBtn.className = 'px-2.5 py-1 rounded font-medium text-slate-500 hover:text-slate-800 transition';
    if (modeManualBtnMobile) {
      modeManualBtnMobile.className = 'px-2.5 py-1.5 rounded-lg font-bold bg-indigo-600 text-white shadow-xs transition';
    }
    if (modeAutoBtnMobile) {
      modeAutoBtnMobile.className = 'px-2.5 py-1.5 rounded-lg font-bold text-slate-500 hover:text-slate-800 transition';
    }
  } else {
    modeAutoBtn.className = 'px-2.5 py-1 rounded font-medium bg-indigo-600 text-white shadow-xs transition';
    modeManualBtn.className = 'px-2.5 py-1 rounded font-medium text-slate-500 hover:text-slate-800 transition';
    if (modeAutoBtnMobile) {
      modeAutoBtnMobile.className = 'px-2.5 py-1.5 rounded-lg font-bold bg-indigo-600 text-white shadow-xs transition';
    }
    if (modeManualBtnMobile) {
      modeManualBtnMobile.className = 'px-2.5 py-1.5 rounded-lg font-bold text-slate-500 hover:text-slate-800 transition';
    }
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_generation_mode', mode: mode }));
  }
}

function triggerInstantAnswer() {
  if (!lastTranscriptText) {
    console.log('[Trigger] No transcript text to answer yet.');
    if (answerStatusBadge) {
      const prevText = answerStatusBadge.textContent;
      const prevClass = answerStatusBadge.className;
      answerStatusBadge.textContent = 'Say question first';
      answerStatusBadge.className = 'text-[10px] sm:text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full';
      setTimeout(() => {
        if (answerStatusBadge.textContent === 'Say question first') {
          answerStatusBadge.textContent = prevText || 'Standing by';
          answerStatusBadge.className = prevClass || 'text-[10px] sm:text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full';
        }
      }, 1800);
    }
    return;
  }
  console.log('[Trigger] Manual trigger for:', lastTranscriptText);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'trigger_manual_answer', text: lastTranscriptText }));
  }
  instantAnswerBtn.classList.add('scale-98', 'opacity-80');
  setTimeout(() => instantAnswerBtn.classList.remove('scale-98', 'opacity-80'), 150);
  if (instantAnswerBtnMobile) {
    instantAnswerBtnMobile.classList.add('scale-95', 'opacity-80');
    setTimeout(() => instantAnswerBtnMobile.classList.remove('scale-95', 'opacity-80'), 150);
  }
}

// ==========================================
// OTTER-STYLE LIVE SHARE SYSTEM
// ==========================================
function getShareUrl() {
  const origin = window.location.origin;
  let url = `${origin}/live?room=${encodeURIComponent(hostRoomId)}`;
  if (hostRoomPin) {
    url += `&pin=${encodeURIComponent(hostRoomPin)}`;
  }
  return url;
}

function updateShareModalInfo() {
  if (shareLinkInput) {
    shareLinkInput.value = getShareUrl();
  }
  if (sharePinInput) {
    sharePinInput.value = hostRoomPin;
  }
  const downloadBtns = document.querySelectorAll('a[href^="/download/stealth"]');
  downloadBtns.forEach(btn => {
    btn.href = `/download/stealth?room=${encodeURIComponent(hostRoomId)}`;
  });
}

function copyShareLinkBtnAction() {
  const url = getShareUrl();
  navigator.clipboard.writeText(url).then(() => {
    if (copyShareLinkText) copyShareLinkText.textContent = 'Copied!';
    setTimeout(() => {
      if (copyShareLinkText) copyShareLinkText.textContent = 'Copy';
    }, 2000);
  }).catch(() => {
    if (shareLinkInput) {
      shareLinkInput.select();
      document.execCommand('copy');
      if (copyShareLinkText) copyShareLinkText.textContent = 'Copied!';
      setTimeout(() => {
        if (copyShareLinkText) copyShareLinkText.textContent = 'Copy';
      }, 2000);
    }
  });
}

function savePinAction() {
  if (!sharePinInput) return;
  const pin = sharePinInput.value.trim();
  hostRoomPin = pin;
  if (pin) {
    localStorage.setItem('planck_room_pin', pin);
  } else {
    localStorage.removeItem('planck_room_pin');
  }

  // Update room pin on server if WebSocket is active
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_room_pin', pin: pin }));
  }

  updateShareModalInfo();
  if (pinSetStatus) {
    pinSetStatus.classList.remove('hidden');
    pinSetStatus.textContent = pin ? '✓ PIN protection active' : '✓ PIN removed (Public)';
    setTimeout(() => {
      pinSetStatus.classList.add('hidden');
    }, 2500);
  }
}

// 3. Audio Recording Engine
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    console.log('[Audio] Requesting user media...');

    // Guarantee that Otter mode strictly uses microphone only (tab audio disabled)
    const currentMode = new URLSearchParams(window.location.search).get('mode');
    if (currentMode === 'practice') {
      currentSource = 'mic';
    }

    // 1. Capture audio based on user selection
    if (currentSource === 'tab') {
      try {
        audioStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        });
        // Stop unwanted video track immediately
        audioStream.getVideoTracks().forEach(t => t.stop());
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('NO_TAB_AUDIO');
        }
      } catch (err) {
        if (err.message === 'NO_TAB_AUDIO') {
          alert("Google Voice tab audio was not shared! When selecting your Google Voice or Meeting tab in the browser popup, make sure the checkbox 'Also share tab audio' (at bottom-left) is checked.");
        } else if (err.name !== 'NotAllowedError') {
          console.warn('[Audio] Tab capture cancelled or error:', err);
        }
        stopRecording();
        return;
      }
    } else {
      // Normal Mode: Microphone (captures room audio / both voices)
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        }
      });
    }

    // 2. Initialize Web Audio Context at native hardware sample rate
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    const sampleRate = audioContext.sampleRate;
    console.log(`[AudioContext] Resumed at native rate: ${sampleRate}Hz`);

    // 3. Connect WebSocket with sampleRate and room parameters
    connectBackendWs(sampleRate);

  } catch (err) {
    console.error('Audio capture error:', err);
    alert('Audio capture failed: ' + err.message);
    stopRecording();
  }
}

function connectBackendWs(sampleRate) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsUrl = `${protocol}//${window.location.host}/ws?sampleRate=${sampleRate}&roomId=${encodeURIComponent(hostRoomId)}`;
  if (hostRoomPin) {
    wsUrl += `&pin=${encodeURIComponent(hostRoomPin)}`;
  }
  
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try { ws.close(); } catch (e) {}
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WebSocket] Connected to backend');
    if (!scriptProcessor) {
      setupAudioProcessing();
    }

    // Ping every 10 seconds to keep connection permanently alive on proxies / Render
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 10000);
  };

  ws.onmessage = handleWebSocketMessage;
  ws.onerror = (err) => console.error('[WebSocket] Error:', err);

  ws.onclose = () => {
    console.log('[WebSocket] Connection closed');
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    // If still recording, immediately auto-reconnect without turning off the record button!
    if (isRecording) {
      console.log('[WebSocket] Auto-reconnecting in 800ms...');
      setTimeout(() => {
        if (isRecording && (!ws || ws.readyState === WebSocket.CLOSED)) {
          connectBackendWs(sampleRate);
        }
      }, 800);
    }
  };
}

function setupAudioProcessing() {
  const sourceNode = audioContext.createMediaStreamSource(audioStream);

  // Buffer size 1024 = ~21ms at 48kHz for lightning-fast streaming chunks
  scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1);

  // Non-zero gain keeps Chromium audio render thread active and prevents GC
  const muteGain = audioContext.createGain();
  muteGain.gain.value = 0.00001;

  sourceNode.connect(scriptProcessor);
  scriptProcessor.connect(muteGain);
  muteGain.connect(audioContext.destination);

  // Bind to window to guarantee Chromium V8 never garbage-collects active audio nodes
  window._planck_audio = { audioContext, audioStream, sourceNode, scriptProcessor, muteGain };

  // Auto-resume if audioContext is suspended by browser power saving
  audioContext.onstatechange = () => {
    if (audioContext && audioContext.state === 'suspended' && isRecording) {
      console.log('[AudioContext] Auto-resuming suspended audio context...');
      audioContext.resume();
    }
  };

  let chunkCount = 0;

  scriptProcessor.onaudioprocess = (e) => {
    if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;

    const inputData = e.inputBuffer.getChannelData(0);

    // Audio meter calculation
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const db = Math.round(20 * Math.log10(rms || 0.0001));
    audioMeterText.textContent = `${Math.max(-60, db)} dB`;

    // Convert Float32 [-1, 1] to Int16 PCM
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send binary PCM chunk over WebSocket
    ws.send(pcm16.buffer);
    chunkCount++;
    if (chunkCount === 1) {
      console.log('[Audio] First PCM chunk sent to WebSocket!');
    }
  };

  // Update UI to recording state
  isRecording = true;
  const currentMode = new URLSearchParams(window.location.search).get('mode');
  if (currentMode === 'practice') {
    toggleAudioBtn.className = 'bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-2 shadow-md shadow-rose-600/25 transition active:scale-95 text-xs sm:text-sm shrink-0';
    toggleAudioBtn.innerHTML = '<i data-lucide="square" class="w-4 h-4 fill-white"></i><span>Stop Speaking</span>';
  } else {
    toggleAudioBtn.className = 'bg-rose-600 hover:bg-rose-700 text-white font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition active:scale-95 text-xs sm:text-sm shrink-0';
    if (currentSource === 'tab') {
      toggleAudioBtn.innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white"></i><span class="hidden sm:inline">Stop Listening</span><span class="sm:hidden">Stop</span>';
    } else {
      toggleAudioBtn.innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white"></i><span class="hidden sm:inline">Stop Speaking</span><span class="sm:hidden">Stop</span>';
    }
  }
  recordingIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
  lucide.createIcons();

  audioStream.getTracks()[0].onended = () => {
    console.warn('[Audio] MediaStreamTrack ended');
    if (currentSource === 'tab') {
      stopRecording();
    }
  };
}

function stopRecording() {
  isRecording = false;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }
  if (window._planck_audio) {
    delete window._planck_audio;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
    ws = null;
  }

  // Reset UI
  const currentMode = new URLSearchParams(window.location.search).get('mode');
  if (currentMode === 'practice') {
    toggleAudioBtn.className = 'bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-2 shadow-md shadow-purple-600/25 transition text-xs sm:text-sm shrink-0';
    toggleAudioBtn.innerHTML = '<i data-lucide="mic" class="w-4 h-4 text-white"></i><span>Start Speaking</span>';
  } else {
    toggleAudioBtn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition active:scale-95 text-xs sm:text-sm shrink-0';
    if (currentSource === 'tab') {
      toggleAudioBtn.innerHTML = '<i data-lucide="headphones" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i><span class="hidden sm:inline">Start Listening</span><span class="sm:hidden">Listen</span>';
    } else {
      toggleAudioBtn.innerHTML = '<i data-lucide="mic" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i><span class="hidden sm:inline">Start Speaking</span><span class="sm:hidden">Speak</span>';
    }
  }
  recordingIndicator.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
  audioMeterText.textContent = '0 dB';
  interimBar.classList.add('hidden');
  lucide.createIcons();
}

// 4. Handle Live Transcripts & LLM Streaming Responses
let activeBubble = null;

function handleWebSocketMessage(event) {
  const data = JSON.parse(event.data);

  if (data.type === 'spectator_count') {
    const count = data.count || 0;
    if (spectatorBadgeCount) {
      spectatorBadgeCount.textContent = count;
      if (count > 0) {
        spectatorBadgeCount.classList.remove('hidden');
      } else {
        spectatorBadgeCount.classList.add('hidden');
      }
    }
    if (shareSpectatorCountText) {
      shareSpectatorCountText.textContent = count === 1 ? '1 spectator watching live' : `${count} spectators watching live`;
    }
  }

  if (data.type === 'transcript') {
    renderLiveTranscript(data.text, data.isFinal, data.speaker);
  }

  if (data.type === 'answer_start') {
    activeQuestionText = data.question;
    currentAnswer = '';

    // Solidify any active speech bubble so the flashing/pulsing ping dot stops
    if (activeBubble) {
      const pingDot = activeBubble.querySelector('.animate-ping');
      if (pingDot) pingDot.classList.remove('animate-ping');
      const pulseCursor = activeBubble.querySelector('.animate-pulse');
      if (pulseCursor) pulseCursor.remove();
      const statusSpan = activeBubble.querySelector('span.font-bold');
      if (statusSpan && statusSpan.textContent.includes('...')) {
        statusSpan.textContent = statusSpan.textContent.replace('...', '');
      }
    }

    // Immediately cut off previous question and start fresh for the next turn
    activeBubble = null;
    currentTurnAccumulator = [];

    detectedQuestionCard.classList.remove('hidden');
    detectedQuestionText.textContent = `"${data.question}"`;
    document.getElementById('questionTime').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    answerStatusBadge.className = 'text-[11px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full animate-pulse';
    answerStatusBadge.textContent = '⚡ Streaming Answer (~120ms)...';
    answerContent.innerHTML = '';
    copyAnswerBtn.disabled = true;
  }

  if (data.type === 'answer_token') {
    currentAnswer += data.token;
    renderFormattedAnswer(currentAnswer);
    answerContent.scrollTop = answerContent.scrollHeight;
  }

  if (data.type === 'answer_done') {
    answerStatusBadge.className = 'text-[11px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full';
    answerStatusBadge.textContent = '✓ Ready to Speak';
    copyAnswerBtn.disabled = false;

    addToHistory(activeQuestionText, currentAnswer);
  }

  if (data.type === 'answer_error' || data.type === 'system_error') {
    answerStatusBadge.className = 'text-[11px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full';
    answerStatusBadge.textContent = 'Cooldown Active';
    answerContent.innerHTML = `
      <div class="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 space-y-2 text-xs">
        <div class="font-bold flex items-center gap-1.5 text-sm">
          <span>⏳</span> AI Rate Limit Cooldown
        </div>
        <p class="leading-relaxed">${escapeHtml(data.message)}</p>
        <p class="text-[11px] text-amber-700">Your token bucket resets automatically in ~15-20 seconds. Resume context has been optimized.</p>
      </div>
    `;
  }
}

// Render live transcript directly in the chat feed with paragraph accumulation
let currentTurnAccumulator = [];
let lastBubbleTime = 0;

function renderLiveTranscript(text, isFinal, speakerId) {
  emptyPlaceholder.classList.add('hidden');

  let speakerLabel = 'Speaker';
  let badgeColor = 'bg-indigo-500';

  if (currentSource === 'tab') {
    speakerLabel = 'Interviewer (Google Voice)';
    badgeColor = 'bg-indigo-600';
  } else if (speakerId !== null && speakerId !== undefined) {
    speakerLabel = `Speaker ${speakerId + 1}`;
    badgeColor = speakerId % 2 === 0 ? 'bg-indigo-500' : 'bg-emerald-500';
  } else {
    speakerLabel = 'You (Speaker)';
    badgeColor = 'bg-indigo-500';
  }

  const now = Date.now();
  // If more than 3 seconds of silence passed since last speech, start a fresh bubble
  if (now - lastBubbleTime > 3000 && activeBubble) {
    activeBubble = null;
    currentTurnAccumulator = [];
  }
  lastBubbleTime = now;

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!activeBubble) {
    activeBubble = document.createElement('div');
    activeBubble.className = 'bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2 hover:border-slate-700 transition shadow-xs text-white';
    activeBubble.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-slate-100 flex items-center gap-1.5">
          <span class="bubble-dot w-1.5 h-1.5 rounded-full ${badgeColor} animate-ping"></span>
          <span class="bubble-speaker">${escapeHtml(speakerLabel)}...</span>
        </span>
        <span class="text-[10px] text-slate-400 font-mono">${timeStr}</span>
      </div>
      <p class="bubble-p text-sm sm:text-base text-white font-medium leading-relaxed"></p>
      <div class="bubble-actions pt-1 flex justify-end hidden">
        <button class="manual-answer-btn text-[11px] text-indigo-300 hover:text-white bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition">
          ⚡ Answer this question
        </button>
      </div>
    `;
    transcriptContainer.appendChild(activeBubble);
    currentTurnAccumulator = [];
  }

  if (isFinal) {
    if (text.trim()) {
      currentTurnAccumulator.push(text.trim());
    }
  }

  // Combined full question text from all clauses so far
  const fullText = currentTurnAccumulator.length > 0 
    ? (isFinal ? currentTurnAccumulator.join(' ') : currentTurnAccumulator.join(' ') + ' ' + text)
    : text;

  lastTranscriptText = fullText;

  const bubbleP = activeBubble.querySelector('.bubble-p');
  const bubbleDot = activeBubble.querySelector('.bubble-dot');
  const bubbleSpeaker = activeBubble.querySelector('.bubble-speaker');
  const bubbleActions = activeBubble.querySelector('.bubble-actions');

  if (!isFinal) {
    // Live in-progress speech with 60 FPS kinetic word transitions
    if (bubbleP) {
      const words = fullText.trim().split(/\s+/).filter(Boolean);
      const existingSpans = bubbleP.querySelectorAll('.bubble-word');
      
      let html = '';
      for (let i = 0; i < words.length; i++) {
        const isBrandNew = i >= existingSpans.length;
        html += `<span class="bubble-word ${isBrandNew ? 'k-word' : ''} text-white font-medium">${escapeHtml(words[i])} </span>`;
      }
      html += `<span class="inline-block w-1.5 h-3 bg-indigo-500 ml-1 animate-pulse rounded-2xs align-middle"></span>`;
      bubbleP.innerHTML = html;
    }
  } else {
    // Solid text containing this finalized question
    if (bubbleP) {
      bubbleP.textContent = fullText;
      bubbleP.className = 'bubble-p text-sm sm:text-base text-white leading-relaxed font-semibold';
    }
    if (bubbleDot) bubbleDot.classList.remove('animate-ping');
    if (bubbleSpeaker) bubbleSpeaker.textContent = speakerLabel;
    
    if (bubbleActions) {
      bubbleActions.classList.remove('hidden');
      const btn = bubbleActions.querySelector('.manual-answer-btn');
      const capturedFullQuestion = fullText;
      btn.onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          console.log('[Manual Trigger] Sending question:', capturedFullQuestion);
          ws.send(JSON.stringify({ type: 'trigger_manual_answer', text: capturedFullQuestion }));
        }
      };
    }

    // CUT OFF: Keep complete questions together (up to 30-35 words max)
    const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
    const trimmed = text.trim();
    if (trimmed.endsWith('?') || wordCount >= 30) {
      activeBubble = null;
      currentTurnAccumulator = [];
    }
  }

  transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

// Render formatted, clean, compact talking points without huge gaps or markdown stars
function renderFormattedAnswer(text) {
  if (!text || !text.trim()) {
    answerContent.innerHTML = `<p class="text-xs text-slate-400 italic">Listening for question...</p>`;
    return;
  }

  // 1. Convert markdown bold **word** to clean bold HTML tags
  let cleaned = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');

  // 2. Normalize whitespace and newlines (prevent multiple blank rows)
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  // 3. Split by lines and remove empty rows
  const rawLines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  const formattedHtml = rawLines.map(line => {
    // Numbered item: "1. ..." or "1) ..."
    const numMatch = line.match(/^(\d+)[.)]\s*(.*)/);
    if (numMatch) {
      return `
        <div class="flex items-start gap-2.5 py-1.5 border-b border-slate-850/80 last:border-0">
          <span class="shrink-0 w-5 h-5 rounded-md bg-indigo-950 text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-800/80 mt-0.5">${numMatch[1]}</span>
          <div class="flex-1 text-white text-[13.5px] sm:text-sm leading-snug font-medium">${numMatch[2]}</div>
        </div>
      `;
    }
    // Bullet item
    if (line.startsWith('•') || line.startsWith('-')) {
      const content = line.replace(/^[•\-]\s*/, '');
      return `
        <div class="flex items-start gap-2 py-1 text-white text-[13.5px] sm:text-sm leading-snug font-medium">
          <span class="text-indigo-400 font-bold leading-tight">•</span>
          <div class="flex-1">${content}</div>
        </div>
      `;
    }
    // Regular paragraph
    return `<p class="text-white text-[13.5px] sm:text-sm leading-snug py-1 font-medium">${line}</p>`;
  }).join('');

  answerContent.innerHTML = formattedHtml || `<p class="text-xs text-slate-400 italic">Formatting answer...</p>`;
}

// Add to previous Q&A turns
function addToHistory(question, answer) {
  qaList.unshift({ question, answer, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  
  qaHistory.innerHTML = '';
  qaList.slice(0, 5).forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1 hover:border-indigo-500/50 cursor-pointer transition shadow-xs';
    card.innerHTML = `
      <div class="flex justify-between items-center text-slate-400 text-[10px]">
        <span class="font-bold text-indigo-400">Q#${qaList.length - index}</span>
        <span>${item.time}</span>
      </div>
      <p class="font-semibold text-slate-200 truncate">"${escapeHtml(item.question)}"</p>
    `;
    card.addEventListener('click', () => {
      detectedQuestionCard.classList.remove('hidden');
      detectedQuestionText.textContent = `"${item.question}"`;
      renderFormattedAnswer(item.answer);
      currentAnswer = item.answer;
      copyAnswerBtn.disabled = false;
    });
    qaHistory.appendChild(card);
  });
}

function escapeHtml(string) {
  const div = document.createElement('div');
  div.innerText = string;
  return div.innerHTML;
}
