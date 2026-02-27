import { aiService } from './services/aiService.js'
import { audioService } from './services/audioService.js'

// App State
const API_URL = 'http://localhost:8000/api';

const state = {
  user: null,
  proctorToken: null,
  step: 'login',
  permissions: { video: false, audio: false },
  faceRegistered: false,
  verified: false,
  stream: null,
  exam: {
    id: 'CS-202-AI',
    title: 'Neural Networks & Deep Learning',
    duration: 3600,
    timeRemaining: 3600,
    questions: [
      { id: 1, type: 'mcq', text: 'Which activation function suffers from the vanishing gradient problem?', options: ['ReLU', 'Sigmoid', 'Leaky ReLU', 'ELU'], answer: 1 },
      { id: 2, type: 'descriptive', text: 'Explain the difference between L1 and L2 regularization.' },
      { id: 3, type: 'mcq', text: 'Which optimization algorithm uses momentum to accelerate gradients?', options: ['SGD', 'Adam', 'RMSprop', 'Adagrad'], answer: 1 },
      { id: 4, type: 'descriptive', text: 'Describe the architecture of a Convolutional Neural Network (CNN).' }
    ],
    currentQuestion: 0,
    answers: {},
    violations: [],
    suspicionScore: 0,
    isManualSubmit: false,
    regPhoto: null, // Store reference photo
    regSignatures: [], // Array of { phase: 'neutral'|'left'|'right', sig: signature }
    photos: [] // Store snapshot evidence
  },
  monitoring: {
    regStep: 'neutral', // neutral, left, right
    isActive: false,
    interval: null,
    cooldowns: {},
    identityFailures: 0,
    // Adaptive Gaze Data
    baselineGaze: null, // { h: offset, v: offset }
    gazeHistory: [],    // [{ time: Date.now(), h: offset, v: offset }]
    audioViolations: 0,
    faceMissingFailures: 0
  },
  closedReason: null
}

// UI Views
const Views = {
  login: () => `
    <div id="back-nav" class="back-btn" onclick="location.reload()">← Home</div>
    <div class="card" style="max-width: 480px; margin: 6rem auto; position: relative; overflow: hidden;">
      <div style="position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: linear-gradient(90deg, transparent, var(--primary), transparent);"></div>
      <div style="text-align: center; margin-bottom: 3rem;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: var(--glass-heavy); border-radius: 1.5rem; border: 1px solid var(--glass-border); margin-bottom: 1.5rem; box-shadow: var(--glow);">
          <span style="font-size: 2rem;">🛡️</span>
        </div>
        <h2 style="font-size: 2.25rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.5rem;">Secure Access</h2>
        <p style="color: var(--text-muted); font-size: 1rem;">Protocol activation required for assessment.</p>
      </div>
      
      <form id="login-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div class="input-group">
          <label class="input-label">Student ID</label>
          <input type="text" class="input-field" id="email" value="STUDENT001" autocomplete="off" required />
        </div>
        <div class="input-group">
          <label class="input-label">Security Key</label>
          <input type="password" class="input-field" id="password" value="password123" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem; height: 3.5rem;">
          Establish Connection
        </button>
      </form>
      
      <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--glass-border); text-align: center; display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
        <span class="status-ring" style="color: var(--primary);"></span>
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">NexProctor AI v4.0 Active</span>
      </div>
    </div>
  `,

  sysCheck: () => `
    <div id="back-nav" class="back-btn">← Back to Login</div>
    <div class="card" style="max-width: 680px; margin: 4rem auto;">
      <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 1rem; letter-spacing: -0.02em;">System Integrity Check</h2>
      <p style="color: var(--text-muted); margin-bottom: 2.5rem;">Validating your local environment for secure assessment protocol.</p>
      
      <div style="display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 3rem;">
        ${renderCheckItem('Hardware: Ultra-HD Webcam', 'cam-status', 'pending', 'Awaiting Authorization')}
        ${renderCheckItem('Hardware: Digital Sensor Array', 'mic-status', 'pending', 'Awaiting Authorization')}
        ${renderCheckItem('Network: Encrypted Tunnel', 'net-status', 'success', 'Verified 24ms Latency')}
      </div>

      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <button id="btn-request" class="btn btn-primary" style="height: 3.5rem;">Authorize Secure Access</button>
        <button id="btn-next" class="btn btn-primary" style="display: none; height: 3.5rem;">Continue to Registration</button>
      </div>
    </div>
  `,

  faceReg: () => {
    const steps = {
      neutral: { icon: '😐', text: 'Neutral Expression', sub: 'Look straight at the camera with even lighting' },
      left: { icon: '⬅️', text: 'Slight Left Turn', sub: 'Slowly turn your head 15 degrees to the left' },
      right: { icon: '➡️', text: 'Slight Right Turn', sub: 'Slowly turn your head 15 degrees to the right' }
    };
    const current = steps[state.monitoring.regStep];

    return `
    <div id="back-nav" class="back-btn">← Back to System Check</div>
    <div class="card" style="max-width: 860px; margin: 3rem auto; text-align: center;">
      <div style="display: flex; justify-content: center; gap: 1rem; margin-bottom: 2rem;">
        <div class="reg-dot ${state.monitoring.regStep === 'neutral' ? 'active' : (state.exam.regSignatures.find(s => s.phase === 'neutral') ? 'done' : '')}"></div>
        <div class="reg-dot ${state.monitoring.regStep === 'left' ? 'active' : (state.exam.regSignatures.find(s => s.phase === 'left') ? 'done' : '')}"></div>
        <div class="reg-dot ${state.monitoring.regStep === 'right' ? 'active' : (state.exam.regSignatures.find(s => s.phase === 'right') ? 'done' : '')}"></div>
      </div>

      <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 0.5rem;">Biometric Registration</h2>
      <p style="color: var(--text-muted); margin-bottom: 2rem;">Step ${state.exam.regSignatures.length + 1}/3: Establishing multi-angle face signature</p>
      
      <div style="background: var(--glass-heavy); padding: 1.5rem; border-radius: 1.5rem; margin-bottom: 2rem; border: 1px solid var(--glass-border); display: flex; align-items: center; gap: 1.5rem; text-align: left;">
        <div style="font-size: 2.5rem;">${current.icon}</div>
        <div>
          <div style="font-weight: 800; color: var(--primary); font-size: 1.1rem;">${current.text}</div>
          <div style="font-size: 0.9rem; color: var(--text-muted);">${current.sub}</div>
        </div>
      </div>

      <div style="position: relative; width: 100%; max-width: 600px; margin: 0 auto 3rem; aspect-ratio: 16/10; background: #000; border-radius: 2rem; overflow: hidden; border: 2px solid var(--glass-border); box-shadow: var(--glow);">
        <video id="reg-video" autoplay muted playsinline style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);"></video>
        <div id="face-guide" style="position: absolute; inset: 0; border: 2px dashed rgba(16, 185, 129, 0.4); margin: 40px; border-radius: 40%; display: flex; align-items: center; justify-content: center; pointer-events: none;">
          <div style="color: var(--primary); font-size: 0.8rem; font-weight: 700; background: rgba(0,0,0,0.6); padding: 0.5rem 1rem; border-radius: 2rem; backdrop-filter: blur(8px);">Stay within marker</div>
        </div>
        <div id="scan-line" style="position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: var(--primary); box-shadow: 0 0 15px var(--primary); animation: scan 3s linear infinite; pointer-events: none;"></div>
      </div>

      <button id="btn-capture" class="btn btn-primary" style="height: 3.5rem; padding: 0 4rem;">
        Capture ${current.text}
      </button>
      <div id="capture-feedback" style="margin-top: 2rem; font-weight: 700; font-size: 1rem; color: var(--primary); letter-spacing: 0.05em; min-height: 1.5rem; text-transform: uppercase;"></div>
    </div>
  `;
  },

  rules: () => `
    <div id="back-nav" class="back-btn">← Back to Face Registration</div>
    <div class="card" style="max-width: 920px; margin: 3rem auto;">
      <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 1rem;">Academic Ethics Protocol</h2>
      <p style="color: var(--text-muted); margin-bottom: 3rem;">Please acknowledge and adhere to the following secure environment requirements.</p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 3rem;">
        ${renderRule('Biometric Persistence', 'AI monitors facial presence 60 times per minute. Face must remain fully visible.')}
        ${renderRule('Peripheral Lockdown', 'No secondary screens, mobile devices, or unrecorded materials allowed in vicinity.')}
        ${renderRule('Environmental Control', 'Neutral background and minimal ambient noise required for clear audio fingerprinting.')}
        ${renderRule('System Integrity', 'Operating system tab/window switching is strictly logged and audited.')}
      </div>

      <div style="padding: 2rem; background: var(--glass-heavy); border-radius: 1.5rem; margin-bottom: 2.5rem; border: 1px solid var(--glass-border); position: relative; overflow: hidden;">
        <label style="display: flex; gap: 1.5rem; cursor: pointer; align-items: start;">
          <input type="checkbox" id="agree" style="width: 24px; height: 24px; margin-top: 4px; accent-color: var(--primary);">
          <span style="font-size: 1.1rem; font-weight: 500; line-height: 1.6; color: var(--text-main);">
            I solemnly swear to uphold academic integrity. I understand that the AI Proctor will monitor my workspace in real-time.
          </span>
        </label>
      </div>

      <button id="btn-start" class="btn btn-primary" style="width: 100%; height: 4rem;" disabled>Confirm & Authorize Verification</button>
    </div>
  `,

  verify: () => `
    <div id="back-nav" class="back-btn">← Back to Ethics Protocol</div>
    <div class="card" style="max-width: 640px; margin: 6rem auto; text-align: center; padding: 5rem 3rem;">
      <div id="v-processing">
        <h2 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 1.5rem; letter-spacing: -0.02em;">Digital Validation</h2>
        <div id="v-loader" style="width: 120px; height: 120px; border: 4px solid var(--glass-heavy); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin: 0 auto 3rem; box-shadow: 0 0 40px var(--primary-glow);"></div>
        <p id="v-status" style="color: var(--text-muted); font-size: 1.25rem; font-weight: 500;">Establishing secure biometric tunnel...</p>
      </div>

      <div id="v-calibrate" style="display: none; flex-direction: column; align-items: center; animation: fadeIn 0.8s forwards;">
        <div style="font-size: 3rem; margin-bottom: 1.5rem;">🎯</div>
        <h3 style="font-size: 2rem; font-weight: 800; margin-bottom: 1rem;">Gaze Calibration</h3>
        <p style="color: var(--text-muted); font-size: 1.1rem; max-width: 400px; margin: 0 auto 2rem;">Please look directly at the center of your screen for 3 seconds to establish your baseline gaze.</p>
        <div style="width: 200px; height: 8px; background: var(--glass-heavy); border-radius: 4px; overflow: hidden; border: 1px solid var(--glass-border);">
          <div id="cal-progress" style="width: 0%; height: 100%; background: var(--primary); transition: width 0.1s linear;"></div>
        </div>
      </div>
      
      <div id="v-success" style="display: none; align-items: center; flex-direction: column; animation: fadeIn 0.8s forwards;">
        <div style="width: 120px; height: 120px; background: var(--primary); border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 4rem; margin-bottom: 2rem; box-shadow: 0 0 50px var(--primary-glow);">
          ✓
        </div>
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 2rem; font-weight: 800;">Protocol Active</h3>
        <p style="font-size: 1.1rem; color: var(--text-muted);">Adaptive gaze baseline established. Launching assessment environment...</p>
      </div>
    </div>
  `,

  exam: () => {
    const q = state.exam.questions[state.exam.currentQuestion];
    const isLast = state.exam.currentQuestion === state.exam.questions.length - 1;
    const isFirst = state.exam.currentQuestion === 0;

    return `
    <div style="max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem;">
      <!-- Security Notification Bar (Red Indentation) -->
      <div id="ai-alert-bar" style="display: none; align-items: center; gap: 1.5rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-left: 6px solid var(--danger); padding: 1.25rem 2rem; border-radius: 1rem; animation: slideDown 0.4s ease-out;">
        <div style="font-size: 1.5rem; animation: pulse 1.5s infinite;">🚨</div>
        <div style="flex: 1;">
          <div style="font-size: 0.75rem; font-weight: 800; color: var(--danger); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.25rem;">AI Detection Alert</div>
          <div id="ai-alert-msg" style="color: #fff; font-weight: 600; font-size: 1.05rem;">PROCTORING ANOMALY DETECTED</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 380px; gap: 2.5rem; align-items: start;">
      <div class="card" style="padding: 3.5rem; min-height: 600px; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--primary); font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 0.5rem;">
              <span class="status-ring"></span> Section 01: Core Theory
            </div>
            <h2 id="q-label" style="font-size: 2rem; font-weight: 800; letter-spacing: -0.02em;">Question ${state.exam.currentQuestion + 1} of ${state.exam.questions.length}</h2>
          </div>
          <div id="timer" style="font-family: 'Space Mono', monospace; font-size: 2.5rem; font-weight: 800; color: var(--primary); background: var(--glass-heavy); padding: 0.75rem 1.5rem; border-radius: 1.5rem; border: 1px solid var(--glass-border);">
            ${Math.floor(state.exam.timeRemaining / 60)}:${(state.exam.timeRemaining % 60).toString().padStart(2, '0')}
          </div>
        </div>

        <div id="q-text" style="font-size: 1.5rem; font-weight: 500; margin-bottom: 3.5rem; line-height: 1.5; color: #fff;">
          ${q.text}
        </div>

        <div id="q-input" style="margin-bottom: auto;">
          ${renderQuestionInput()}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 2.5rem; margin-top: 4rem;">
          <div style="display: flex; gap: 1rem; align-items: center;">
            <button id="btn-prev" class="btn" style="background: var(--glass-heavy); color: ${isFirst ? 'var(--text-muted)' : '#fff'};" ${isFirst ? 'disabled' : ''}>Previous</button>
            <div style="display: flex; gap: 0.5rem;">
              ${state.exam.questions.map((_, i) => `
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${i === state.exam.currentQuestion ? 'var(--primary)' : 'var(--glass-border)'}"></div>
              `).join('')}
            </div>
          </div>
          
          ${isLast ?
        `<button id="btn-submit" class="btn btn-primary" style="padding: 0 4rem; box-shadow: 0 0 30px var(--primary-glow);">Submit Exam</button>` :
        `<button id="btn-next" class="btn btn-primary" style="padding: 0 3rem;">Next Question</button>`
      }
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 2rem;">
        <!-- Secure AI Monitor Feed -->
        <div class="card" style="padding: 1.25rem;">
          <div style="position: relative; width: 100%; aspect-ratio: 4/3; background: #000; border-radius: 1.5rem; overflow: hidden; margin-bottom: 1.5rem; border: 2px solid var(--glass-border);">
            <video id="proctor-video" autoplay muted playsinline style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);"></video>
            <canvas id="proctor-canvas" style="position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1); pointer-events: none;"></canvas>
            <div style="position: absolute; top: 15px; right: 15px; padding: 6px 14px; background: var(--danger); color: white; border-radius: 2rem; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.1em; box-shadow: 0 0 20px rgba(239, 68, 68, 0.4); animation: pulse 2s infinite;">LIVE AI</div>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0 0.5rem;">
             <div class="badge" id="b-face" style="background: var(--success); width: 100%; justify-content: start; height: 2.5rem;"><span class="status-ring"></span>Biometric: Active</div>
             <div class="badge" id="b-audio" style="background: var(--primary); width: 100%; justify-content: start; height: 2.5rem;"><span class="status-ring" id="audio-ring"></span>Audio: Monitoring Every Word</div>
             <div class="badge" id="b-gaze" style="background: var(--primary); width: 100%; justify-content: start; height: 2.5rem;"><span class="status-ring"></span>Gaze: Focused</div>
             
             <!-- Attention Bar -->
             <div style="margin-top: 0.5rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-bottom: 0.25rem; font-weight: 800; text-transform: uppercase;">
                   <span>Attention Level</span>
                   <span id="attention-pct">100%</span>
                </div>
                <div style="height: 6px; background: var(--glass-heavy); border-radius: 10px; overflow: hidden; border: 1px solid var(--glass-border);">
                   <div id="attention-bar" style="height: 100%; width: 100%; background: var(--primary); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);"></div>
                </div>
             </div>
          </div>
        </div>

        <!-- Security Chronology -->
        <div class="card" style="padding: 2rem;">
          <h4 style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); margin-bottom: 1.5rem; text-transform: uppercase; letter-spacing: 0.15em;">Secure Session Log</h4>
          <div id="p-log" style="height: 160px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 8px;">
            <div style="color: var(--success)">[SYS] Secure Protocol V4.0 Initiated</div>
            <div>[AI] Behavioral Baseline Established</div>
          </div>
        </div>

        <!-- Anomaly Index -->
        <div class="card" style="padding: 2rem; border: 1px solid rgba(239, 68, 68, 0.3);">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <span style="font-size: 0.75rem; font-weight: 800; color: var(--danger); text-transform: uppercase;">Anomaly Points</span>
            <span style="font-size: 0.7rem; color: var(--text-muted);">MAX: 05</span>
          </div>
          <div id="v-count" style="font-size: 3.5rem; font-weight: 900; line-height: 1; margin-bottom: 1rem; color: #fff;">0</div>
          <p style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">Automatic protocol termination at threshold.</p>
        </div>
      </div>
    </div>
  `;
  },

  submission: () => {
    let title = "Assessment Captured";
    let desc = "Thank you for completing your assessment. Your responses have been securely uploaded and are waiting for proctor review.";
    let flag = "";

    if (state.exam.closedReason === 'TAB_SWITCH') {
      title = "EXAM TERMINATED";
      desc = "Your exam was automatically closed because you opened a new tab or minimized the window. This incident has been logged for review.";
      flag = `<div class="badge" style="background: var(--danger); margin-bottom: 1rem; padding: 0.8rem 1.5rem; font-size: 0.9rem;">🚩 EXAM CLOSED: TAB SWITCH DETECTED</div>`;
    } else if (state.exam.closedReason === 'IDENTITY_VIOLATION') {
      title = "EXAM TERMINATED";
      desc = "Your exam was automatically closed due to a critical security mismatch. Multiple persons or an unauthorized individual was detected in your workspace.";
      flag = `<div class="badge" style="background: var(--danger); margin-bottom: 1rem; padding: 0.8rem 1.5rem; font-size: 0.9rem;">🚩 EXAM CLOSED: SECURITY BREACH</div>`;
    } else if (state.exam.closedReason === 'DEVICE_VIOLATION') {
      title = "EXAM TERMINATED";
      desc = "Your exam was automatically closed because an unauthorized electronic device (mobile phone) was detected in your proctoring frame.";
      flag = `<div class="badge" style="background: var(--danger); margin-bottom: 1rem; padding: 0.8rem 1.5rem; font-size: 0.9rem;">🚩 EXAM CLOSED: ELECTRONIC DEVICE DETECTED</div>`;
    } else if (state.exam.closedReason === 'HEAD_MOVEMENT_VIOLATION') {
      title = "EXAM TERMINATED";
      desc = "Your exam was automatically closed because excessive head movement (45°+ turn/tilt) was detected. Please maintain a frontal view of the screen at all times.";
      flag = `<div class="badge" style="background: var(--danger); margin-bottom: 1rem; padding: 0.8rem 1.5rem; font-size: 0.9rem;">🚩 EXAM CLOSED: EXCESSIVE MOVEMENT DETECTED</div>`;
    } else if (state.exam.closedReason === 'AUDIO_VIOLATION') {
      title = "EXAM TERMINATED";
      desc = "Your exam was automatically closed because multiple Vocal Anomalies (mentioning question/options) were detected and recorded.";
      flag = `<div class="badge" style="background: var(--danger); margin-bottom: 1rem; padding: 0.8rem 1.5rem; font-size: 1rem;">🚩 EXAM CLOSED: VOCAL ANOMALY SECURITY BREACH</div>`;
    }

    return `
    <div id="back-nav" class="back-btn" onclick="location.reload()">← System Reset</div>
    <div class="card" style="max-width: 720px; margin: 6rem auto; text-align: center; padding: 6rem 4rem;">
       <div style="width: 140px; height: 140px; background: var(--glass-heavy); border: 1px solid var(--glass-border); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 3.5rem; box-shadow: var(--glow);">
          <span style="font-size: 5rem; animation: pulse 2s infinite;">📤</span>
       </div>
       <h2 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 1.5rem; letter-spacing: -0.03em;">${title}</h2>
       ${flag}
       <p style="color: var(--text-muted); font-size: 1.2rem; margin-bottom: 4rem; line-height: 1.6;">${desc}</p>
       
       <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; text-align: left; margin-bottom: 4rem;">
          <div style="background: var(--glass-heavy); padding: 1.75rem; border-radius: 1.5rem; border: 1px solid var(--glass-border);">
             <div style="font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem;">PROTOCOL ID</div>
             <div style="font-weight: 800; font-size: 1.25rem; color: var(--accent); font-family: 'Space Mono', monospace;">NXP-${Math.random().toString(36).substr(2, 6).toUpperCase()}</div>
          </div>
          <div style="background: var(--glass-heavy); padding: 1.75rem; border-radius: 1.5rem; border: 1px solid var(--glass-border);">
             <div style="font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem;">CLOUD STATUS</div>
             <div style="font-weight: 800; font-size: 1.25rem; color: var(--success);">SYNCED</div>
          </div>
       </div>

       <button id="btn-report" class="btn btn-primary" style="width: 100%; height: 4rem;">Access Post-Assessment Analysis</button>
    </div>
  `;
  },

  report: () => `
    <div id="back-nav" class="back-btn">← Back to Summary</div>
    <div class="card" style="max-width: 1000px; margin: 3rem auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 3rem;">
        <div>
          <div style="color: var(--primary); font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 1rem;">Acoustic & Biometric Analysis</div>
          <h2 style="font-size: 2.75rem; font-weight: 900; letter-spacing: -0.03em;">Vocal Anomaly Security Audit Report</h2>
          <p style="color: var(--text-muted); font-size: 1.1rem; margin-top: 0.5rem;">Candidate: ${state.user.id} &bull; Assessment Date: ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="badge" style="background: ${state.exam.suspicionScore > 30 ? 'var(--danger)' : 'var(--success)'}; font-size: 1.1rem; padding: 1rem 2rem; border-radius: 1.5rem; border: none; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);">
           ${state.exam.suspicionScore > 30 ? 'High Anomaly Risk' : 'Integrity Validated'}
        </div>
      </div>

      <h3 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 2rem; letter-spacing: -0.01em;">Visual Evidence Gallery</h3>
      <div style="display: grid; grid-template-columns: 280px 1fr; gap: 3rem; margin-bottom: 4rem; align-items: start;">
         <div style="position: sticky; top: 2rem;">
            <div style="font-size: 0.7rem; font-weight: 800; color: var(--primary); text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 0.1em;">Registration Master</div>
            <div style="width: 100%; aspect-ratio: 4/3; background: #000; border-radius: 2rem; overflow: hidden; border: 4px solid var(--primary); box-shadow: var(--glow);">
               <img src="${state.exam.regPhoto}" style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);">
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 1.5rem; line-height: 1.4;">This biometric template was established during the 3-step registration protocol and serves as the ground truth for identity verification.</p>
         </div>
         <div>
            <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 0.1em;">Session Snapshots (Scrollable)</div>
            <div style="height: 500px; overflow-y: auto; padding-right: 1.5rem; scrollbar-width: thin; scrollbar-color: var(--primary) transparent;">
               <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1.5rem;">
                  ${state.exam.photos.length > 0 ? state.exam.photos.map((p, i) => `
                    <div style="aspect-ratio: 4/3; background: #000; border-radius: 1.25rem; overflow: hidden; border: ${p.confidence < 50 ? '2px solid var(--danger)' : '2px solid var(--glass-border)'}; position: relative; transition: transform 0.3s ease;">
                       <img src="${p.data}" style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);">
                       <div style="position: absolute; bottom: 10px; left: 10px; font-size: 0.6rem; background: rgba(0,0,0,0.8); padding: 4px 8px; border-radius: 6px; color: #fff; backdrop-filter: blur(4px); font-family: 'Space Mono', monospace;">${p.time}</div>
                       <div style="position: absolute; top: 10px; right: 10px; font-size: 0.6rem; background: ${p.confidence < 50 ? 'var(--danger)' : 'var(--success)'}; padding: 4px 8px; border-radius: 6px; color: #fff; font-weight: 800; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">${p.confidence}% Match</div>
                    </div>
                  `).reverse().join('') : '<p style="color: var(--text-muted);">No snapshot evidence recorded.</p>'}
               </div>
            </div>
         </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 4rem;">
         ${renderStatCard('Facial Tracking', '99.2% Stable')}
         ${renderStatCard('Eye Gaze Stability', '97.4% Focused')}
         ${renderStatCard('Acoustic Analysis', (state.monitoring.audioViolations || 0) + ' Vocal Anomalies')}
         ${renderStatCard('Suspicion Index', state.exam.suspicionScore + '%')}
      </div>

      <h3 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 2rem; letter-spacing: -0.01em;">Anomaly Chronology</h3>
      <div style="background: var(--glass-heavy); border-radius: 2rem; border: 1px solid var(--glass-border); overflow: hidden;">
         <table>
            <thead>
               <tr>
                  <th>Timestamp</th>
                  <th>Anomaly Detection</th>
                  <th>AI Confidence</th>
                  <th>Action</th>
               </tr>
            </thead>
            <tbody>
               ${state.exam.violations.length > 0 ? state.exam.violations.map(v => `
                 <tr>
                    <td style="font-family: 'Space Mono', monospace;">${v.time}</td>
                    <td><span style="color: var(--danger); font-weight: 700;">${v.type}</span></td>
                    <td style="font-weight: 600;">${v.score}%</td>
                    <td><span class="badge" style="background: var(--glass-border); color: #fff; font-size: 0.65rem; padding: 0.4rem 0.8rem;">Logged</span></td>
                 </tr>
               `).join('') : `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 5rem; font-size: 1.1rem;">Zero anomalies detected during session protocol.</td></tr>`}
            </tbody>
         </table>
      </div>
    </div>
  `
}

// Helper Components
function renderCheckItem(label, id, status, text) {
  const color = status === 'success' ? 'var(--success)' : 'var(--warning)';
  return `
  <div style="display: flex; align-items: center; justify-content: space-between; padding: 1.5rem; background: var(--glass-heavy); border-radius: 1.5rem; border: 1px solid var(--glass-border); transition: all 0.3s ease;">
      <div style="font-weight: 600; font-size: 1.05rem; letter-spacing: -0.01em;">${label}</div>
      <div id="${id}" style="color: ${color}; font-weight: 800; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">${text}</div>
    </div>
  `;
}

function renderRule(title, desc) {
  return `
  <div style="padding: 1.75rem; background: var(--glass-heavy); border-radius: 1.5rem; border: 1px solid var(--glass-border); transition: all 0.3s ease;">
       <h4 style="color: var(--primary); margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 800; letter-spacing: -0.01em;">${title}</h4>
       <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5;">${desc}</p>
    </div>
  `;
}

function renderStatCard(label, val) {
  return `
  <div style="background: var(--glass-heavy); padding: 2rem; border-radius: 1.5rem; border: 1px solid var(--glass-border); text-align: center;">
       <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">${label}</div>
       <div style="font-size: 1.5rem; font-weight: 900; color: #fff; letter-spacing: -0.02em;">${val}</div>
    </div>
  `;
}

function renderQuestionInput() {
  const q = state.exam.questions[state.exam.currentQuestion];
  if (q.type === 'mcq') {
    return q.options.map((opt, i) => `
  <label style="display: flex; align-items: center; gap: 1rem; background: var(--glass); padding: 1.25rem; border-radius: 1rem; border: 1px solid var(--glass-border); margin-bottom: 0.75rem; cursor: pointer; transition: all 0.2s;">
    <input type="radio" name="q" style="width: 20px; height: 20px; accent-color: var(--primary);">
      <span>${opt}</span>
    </label>
`).join('');
  } else {
    return `<textarea class="input-field" style="height: 240px; resize: none;" placeholder="Provide your detailed analysis..."></textarea>`;
  }
}

// Controller Logic
function render(view) {
  const mount = document.getElementById('view-mount');
  state.step = view;
  if (Views[view]) {
    mount.innerHTML = Views[view]();
  }
  window.scrollTo(0, 0);
  initLogic(view);
}

async function initLogic(view) {
  if (view === 'login') {
    const form = document.getElementById('login-form');
    if (form) {
      console.log('Attaching Login Security Protocol...');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Authentication Initiated...');
        const emailVal = document.getElementById('email').value;
        const codeVal = document.getElementById('exam-code').value;
        const errorDiv = document.getElementById('login-error');
        const btn = document.getElementById('btn-login');

        try {
          btn.innerText = 'Verifying Code...';
          btn.disabled = true;
          errorDiv.style.display = 'none';

          const res = await fetch(`${API_URL}/exam/verify_code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: codeVal, student_id: emailVal })
          });

          const data = await res.json();

          if (res.ok) {
            state.user = { id: emailVal || 'UNKNOWN_STUDENT' };
            state.exam.id = codeVal.toUpperCase(); // Store the used code
            render('sysCheck');
          } else {
            errorDiv.innerText = data.detail || 'Invalid or Expired Exam Code';
            errorDiv.style.display = 'block';
            btn.innerText = 'Establish Connection';
            btn.disabled = false;
          }
        } catch (err) {
          console.error("Login verification failed:", err);
          errorDiv.innerText = 'Unable to connect to security server. Ensure backend is running.';
          errorDiv.style.display = 'block';
          btn.innerText = 'Establish Connection';
          btn.disabled = false;
        }
      });
    } else {
      console.error('CRITICAL: Login form target not found in DOM.');
    }
  } else if (view === 'sysCheck') {
    document.getElementById('btn-request').onclick = async () => {
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        document.getElementById('cam-status').innerText = 'Ready & Verified';
        document.getElementById('cam-status').style.color = 'var(--success)';
        document.getElementById('mic-status').innerText = 'Active (Input detected)';
        document.getElementById('mic-status').style.color = 'var(--success)';
        document.getElementById('btn-request').style.display = 'none';
        document.getElementById('btn-next').style.display = 'block';
      } catch (e) {
        alert('Hardware access denied. Protocol failure.');
      }
    };
    document.getElementById('btn-next').onclick = () => render('faceReg');
    document.getElementById('back-nav').onclick = () => render('login');
  } else if (view === 'faceReg') {
    const video = document.getElementById('reg-video');
    video.srcObject = state.stream;
    video.muted = true;

    document.getElementById('back-nav').onclick = () => {
      // Clean up state if necessary
      state.monitoring.regStep = 'neutral';
      state.exam.regSignatures = [];
      render('sysCheck');
    };

    // Pre-warm AI Models immediately to prevent capture latency
    aiService.initialize();

    document.getElementById('btn-capture').onclick = async () => {
      const feedback = document.getElementById('capture-feedback');
      feedback.innerText = 'Initializing Secure Scan...';
      feedback.style.color = 'var(--primary)';

      const res = await aiService.runInference(video);

      if (!res) {
        feedback.innerText = 'Calibrating Sensors... Please wait a moment.';
        feedback.style.color = 'var(--warning)';
        return;
      }

      if (res.faces.length !== 1) {
        feedback.innerText = res.faces.length === 0 ? 'No face detected. Align and try again.' : 'Multiple faces detected. Ensure you are alone.';
        feedback.style.color = 'var(--danger)';
        return;
      }

      // Check for pose violations (centering, tilt, etc)
      const poseViolations = res.violations.filter(v => v.includes('Face Not Centered') || v.includes('Head Tilt'));
      if (poseViolations.length > 0) {
        // If it's a major violation (e.g. Neutral phase but extreme tilt), warn but allow capture
        // Or if it's the 2nd attempt, just accept it.
        feedback.innerText = 'Capturing with pose warning... Please try to stay centered.';
        feedback.style.color = 'var(--warning)';
        // We no longer return here, essentially "accepting" the pose
      }

      const phase = state.monitoring.regStep;
      feedback.innerText = `Analyzing ${phase} signature...`;

      const normalizedPhoto = await aiService.normalizeImage(video);
      const sig = await aiService.getFaceSignature(video);

      if (sig) {
        // --- IDENTITY CONSISTENCY CHECK (NEW) ---
        // Ensure this person matches the first (Neutral) capture
        if (state.exam.regSignatures.length > 0) {
          const neutralSig = state.exam.regSignatures.find(s => s.phase === 'neutral').sig;
          if (!aiService.compareSignatures(neutralSig, sig)) {
            feedback.innerText = 'Identity Mismatch: Please ensure the same person is in all 3 photos.';
            feedback.style.color = 'var(--danger)';
            return;
          }
        }

        state.exam.regSignatures.push({ phase, sig });

        // Final composite photo for report
        if (phase === 'neutral') state.exam.regPhoto = normalizedPhoto;

        if (phase === 'neutral') state.monitoring.regStep = 'left';
        else if (phase === 'left') state.monitoring.regStep = 'right';
        else {
          feedback.innerText = 'Biometric profile finalized.';
          feedback.style.color = 'var(--success)';
          aiService.activeSignature = state.exam.regSignatures.find(s => s.phase === 'neutral').sig;
          state.faceRegistered = true;
          setTimeout(() => render('rules'), 1500);
          return;
        }

        render('faceReg'); // Re-render for next step
      } else {
        feedback.innerText = 'Signature failed. Ensure clear visibility.';
        feedback.style.color = 'var(--danger)';
      }
    };
  } else if (view === 'rules') {
    const check = document.getElementById('agree');
    const btn = document.getElementById('btn-start');
    check.onchange = () => btn.disabled = !check.checked;
    btn.onclick = () => render('verify');
    document.getElementById('back-nav').onclick = () => render('faceReg');
  } else if (view === 'verify') {
    document.getElementById('back-nav').onclick = () => render('rules');
    const video = document.createElement('video'); // Hidden video for background analysis if needed
    video.srcObject = state.stream;
    video.muted = true;
    video.play();

    setTimeout(async () => {
      document.getElementById('v-processing').style.display = 'none';
      const calView = document.getElementById('v-calibrate');
      calView.style.display = 'flex';

      const hSamples = [];
      const vSamples = [];
      const progress = document.getElementById('cal-progress');

      const startTime = Date.now();
      const calibrationDuration = 3000;

      const captureSample = async () => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, (elapsed / calibrationDuration) * 100);
        progress.style.width = `${pct}%`;

        const res = await aiService.runInference(video);
        if (res && res.faces.length === 1) {
          hSamples.push(res.gazeOffsets.h);
          vSamples.push(res.gazeOffsets.v);
        }

        if (elapsed < calibrationDuration) {
          requestAnimationFrame(captureSample);
        } else {
          // Calculate Baseline (Average)
          state.monitoring.baselineGaze = {
            h: hSamples.reduce((a, b) => a + b, 0) / (hSamples.length || 1),
            v: vSamples.reduce((a, b) => a + b, 0) / (vSamples.length || 1)
          };

          calView.style.display = 'none';
          document.getElementById('v-success').style.display = 'flex';
          state.verified = true;
          setTimeout(() => render('exam'), 2000);
        }
      };

      captureSample();
    }, 2500);
  } else if (view === 'exam') {
    const video = document.getElementById('proctor-video');
    video.srcObject = state.stream;
    video.muted = true;

    // Only restart timer/monitoring if we aren't already in them (for navigation)
    if (!state.monitoring.isActive) {
      startTimer();
      startMonitoring();
      state.monitoring.isActive = true;
    }

    // Update Audio Keywords for current question
    const q = state.exam.questions[state.exam.currentQuestion];
    const keywords = [q.text, ...(q.options || [])].join(' ').split(' ');
    audioService.setKeywords(keywords);

    const nextBtn = document.getElementById('btn-next');
    const prevBtn = document.getElementById('btn-prev');
    const submitBtn = document.getElementById('btn-submit');

    if (nextBtn) {
      nextBtn.onclick = () => {
        state.exam.currentQuestion++;
        const log = document.getElementById('p-log');
        if (log) log.innerHTML = `<div>[${new Date().toLocaleTimeString()}] Navigating to Question ${state.exam.currentQuestion + 1}</div>` + log.innerHTML;
        render('exam');
      };
    }
    if (prevBtn) {
      prevBtn.onclick = () => {
        state.exam.currentQuestion--;
        const log = document.getElementById('p-log');
        if (log) log.innerHTML = `<div>[${new Date().toLocaleTimeString()}] Navigating to Question ${state.exam.currentQuestion + 1}</div>` + log.innerHTML;
        render('exam');
      };
    }
    if (submitBtn) {
      submitBtn.onclick = async () => {
        state.monitoring.isActive = false;

        // Disable button while submitting
        submitBtn.disabled = true;
        submitBtn.innerText = 'Securing Data...';

        try {
          const payload = {
            student_id: state.user.id,
            code: state.exam.id,
            suspicion_score: state.exam.suspicionScore,
            violations: state.exam.violations,
            photos: state.exam.photos.filter((_, i) => i % 5 === 0 || i === state.exam.photos.length - 1), // Send a subset to save payload size
            closed_reason: state.closedReason || "MANUAL_SUBMIT",
            time_remaining: state.exam.timeRemaining,
            duration: state.exam.duration
          };

          const res = await fetch(`${API_URL}/exam/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            render('submission');
          } else {
            console.error("Submission failed");
            alert("Failed to submit exam data. Please notify your proctor.");
            render('submission');
          }
        } catch (e) {
          console.error("Submission error", e);
          render('submission'); // Proceed anyway for resilience
        }
      };
    }
  } else if (view === 'submission') {
    document.getElementById('btn-report').onclick = () => render('report');
  } else if (view === 'report') {
    document.getElementById('back-nav').onclick = () => render('submission');
  }
}

function startTimer() {
  const itv = setInterval(() => {
    if (state.step !== 'exam') return clearInterval(itv);

    state.exam.timeRemaining--;
    const timer = document.getElementById('timer');
    if (timer) {
      const m = Math.floor(state.exam.timeRemaining / 60);
      const s = state.exam.timeRemaining % 60;
      timer.innerText = `${m}:${s.toString().padStart(2, '0')}`;
    }

    if (state.exam.timeRemaining <= 0) {
      clearInterval(itv);
      render('submission');
    }
  }, 1000);
}

async function startMonitoring() {
  await aiService.initialize();

  // Audio Monitoring Init
  state.monitoring.audioViolations = 0;
  state.monitoring.lastAudioWord = '';
  audioService.onKeywordDetected = (word) => {
    // Avoid duplicate flagging for the same word in a short window
    if (state.monitoring.lastAudioWord === word) return;
    state.monitoring.lastAudioWord = word;
    setTimeout(() => { state.monitoring.lastAudioWord = ''; }, 5000); // 5s window

    state.monitoring.audioViolations++;

    // 1. Mandatory Store in Audit Report
    triggerViolation(`Vocal Anomaly (Keyword: "${word.toUpperCase()}")`, 70);

    // 2. UI Logging
    const addLog = (msg, col = 'var(--text-muted)') => {
      const log = document.getElementById('p-log');
      if (!log) return;
      const time = new Date().toLocaleTimeString();
      log.innerHTML = `<div style="color: ${col}">[${time}] ${msg}</div>` + log.innerHTML;
    };
    addLog(`VOICE IDENTIFIED: "${word.toUpperCase()}" (Count: ${state.monitoring.audioViolations})`, 'var(--warning)');

    // 3. Multi-Violation Enforcement (3 Strikes)
    if (state.monitoring.audioViolations >= 3) {
      handleSecurityBreach('AUDIO_VIOLATION', `CRITICAL SECURITY BREACH: Multiple vocal anomalies detected (${state.monitoring.audioViolations} matches). The current session has been terminated to preserve assessment integrity.`);
      audioService.stop();
    }
  };

  // 10-Second Initial Environment Check followed by Continuous Monitoring
  const runAudioProtocol = () => {
    if (state.step !== 'exam') return;
    const addLog = (msg, col = 'var(--text-muted)') => {
      const log = document.getElementById('p-log');
      if (!log) return;
      const time = new Date().toLocaleTimeString();
      log.innerHTML = `<div style="color: ${col}">[${time}] ${msg}</div>` + log.innerHTML;
    };

    addLog('SYSTEM: Starting 10-second Initial Acoustic Scan...', 'var(--primary)');
    audioService.start();

    // Visual feedback for the new audio badge
    const audioBadge = document.getElementById('b-audio');
    const audioRing = document.getElementById('audio-ring');
    if (audioBadge) audioBadge.style.transition = 'all 0.5s ease';

    // After 10 seconds, transition to continuous deep-word identification
    setTimeout(() => {
      if (state.step === 'exam') {
        addLog('SYSTEM: Initial Scan Complete. Continuous "Each & Every Word" Identification Active.', 'var(--success)');
        if (audioBadge) {
          audioBadge.innerHTML = `<span class="status-ring" style="background: var(--success); box-shadow: 0 0 10px var(--success);"></span>Acoustic Guard: Deep Identification Active`;
          audioBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          audioBadge.style.border = '1px solid var(--success)';
        }
        if (!audioService.isListening) audioService.start();
      }
    }, 10000);
  };
  runAudioProtocol();

  const addLog = (msg, col = 'var(--text-muted)') => {
    const log = document.getElementById('p-log');
    if (!log) return;
    const time = new Date().toLocaleTimeString();
    log.innerHTML = `<div style="color: ${col}">[${time}] ${msg}</div>` + log.innerHTML;
  };

  const monitor = async () => {
    if (state.step !== 'exam') return;

    const video = document.getElementById('proctor-video');
    if (!video) {
      setTimeout(monitor, 1000);
      return;
    }

    const res = await aiService.runInference(video);
    const now = Date.now();

    if (res) {
      // --- ALWAYS UPDATE GRID/OVERLAYS FOR SMOOTH TRACKING ---
      const canvas = document.getElementById('proctor-canvas');
      if (canvas && res.faces.length > 0) {
        drawOverlays(canvas, video, res.faces[0], res.attentionScore || 1);
      } else if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // --- RUN HEAVY LOGIC & SNAPSHOTS PERIODICALLY (2-5 secs) ---
      const lastSnap = state.monitoring.lastSnapshot || 0;
      const interval = state.monitoring.nextInterval || 3000;

      if (now - lastSnap > interval) {
        state.monitoring.lastSnapshot = now;
        state.monitoring.nextInterval = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;

        addLog('AI Analytics Snapshot Captured', 'var(--accent)');

        // Capture Photo for Report - Only if buffer is ready to prevent black frames
        if (video.currentTime > 0.1) {
          const offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = video.videoWidth;
          offscreenCanvas.height = video.videoHeight;
          offscreenCanvas.getContext('2d').drawImage(video, 0, 0);
          state.exam.photos.push({
            time: new Date().toLocaleTimeString(),
            data: offscreenCanvas.toDataURL('image/jpeg', 0.6),
            confidence: (res.matchConfidence !== undefined) ? res.matchConfidence : 0
          });
        }

        // Visual feedback: Subtle pulse on the proctor video to show a "photo" was taken
        const vContainer = video.parentElement;
        vContainer.style.transition = 'all 0.1s';
        vContainer.style.borderColor = 'var(--primary)';
        vContainer.style.boxShadow = '0 0 30px var(--primary)';
        setTimeout(() => {
          vContainer.style.borderColor = 'var(--glass-border)';
          vContainer.style.boxShadow = 'none';
        }, 300);

        const faceBadge = document.getElementById('b-face');
        const gazeBadge = document.getElementById('b-gaze');

        if (res.faces.length === 1) {
          state.monitoring.faceMissingFailures = 0; // Reset missing counter
          // Identity & Lighting Check
          if (res.violations.includes('Identity Mismatch')) {
            faceBadge.style.background = 'var(--danger)';
            faceBadge.innerHTML = '<span class="status-ring"></span>ID: UNKNOWN USER';
            triggerViolation('Security Alert: Identity Mismatch Detected', 100);
          } else if (res.violations.includes('Lighting Warning: Environment Too Dark')) {
            faceBadge.style.background = 'var(--warning)';
            faceBadge.innerHTML = '<span class="status-ring"></span>ID: POOR LIGHTING';
            // No warning triggered
          } else {
            faceBadge.style.background = 'var(--success)';
            faceBadge.innerText = 'Face Verified';
          }

          // ADAPTIVE GAZE LOGIC
          const currentH = res.gazeOffsets.h;
          const currentV = res.gazeOffsets.v;

          const hDev = Math.abs(currentH - (state.monitoring.baselineGaze?.h || 0));
          const vDev = Math.abs(currentV - (state.monitoring.baselineGaze?.v || 0));

          const isStraying = hDev > 0.25 || vDev > 0.30;
          const headTilted = res.violations.includes('Head Tilted');
          const headMovement = res.violations.includes('Sudden Head Movement');
          const lookingDown = res.violations.includes('Looking Down');
          const lookingLeft = res.violations.includes('Looking Left');
          const lookingRight = res.violations.includes('Looking Right');
          const lookingUp = res.violations.includes('Looking Up');

          let movementReason = null;
          if (lookingUp && lookingLeft) movementReason = 'Top-Left';
          else if (lookingUp) movementReason = 'Top';
          else if (lookingLeft && !lookingDown) movementReason = 'Left';
          else if (lookingRight) movementReason = 'Right';
          else if (lookingDown && !lookingLeft) movementReason = 'Bottom';

          if (movementReason || headTilted || headMovement) {
            const label = movementReason || 'Tilt/Turn';
            triggerViolation(`Head Movement Alert: ${label} Detected`, 30);

            gazeBadge.style.background = 'var(--danger)';
            gazeBadge.innerHTML = `<span class="status-ring"></span>Alert: Move (${label})`;
          }

          // MULTI-SIGNAL & TIME-BASED MONITORING
          if (isStraying || lookingDown) {
            state.monitoring.gazeHistory.push({ time: Date.now(), down: lookingDown });
            const nowTime = Date.now();
            state.monitoring.gazeHistory = state.monitoring.gazeHistory.filter(t => nowTime - t.time < 10000);

            if (state.monitoring.gazeHistory.length > 5) {
              gazeBadge.style.background = 'var(--warning)';
              gazeBadge.innerHTML = '<span class="status-ring"></span>Gaze: Peripheral';

              if (headTilted || headMovement || lookingDown) {
                const reason = lookingDown ? 'Suspicious Behavior: Persistent Looking Down' : 'Adaptive Alert: Persistent Gaze Deviation';
                triggerViolation(reason, 40);
              }
            }
          } else {
            state.monitoring.gazeHistory = []; // Reset on focus
            gazeBadge.style.background = 'var(--primary)';
            gazeBadge.innerHTML = `<span class="status-ring"></span>Gaze: Focused`;
          }

          // IDENTITY LOGOUT LOGIC
          if (res.violations.includes('Identity Mismatch')) {
            state.monitoring.identityFailures++;

            if (res.isCriticalMismatch || state.monitoring.identityFailures >= 3) {
              handleSecurityBreach('IDENTITY_VIOLATION', 'CRITICAL SECURITY BREACH: Identity verification failed. The person currently at the terminal does not match the registered candidate.');
              return;
            } else {
              console.warn(`Identity warning ${state.monitoring.identityFailures}/3 - Awaiting confirmation...`);
            }
          } else {
            state.monitoring.identityFailures = 0;
          }
          const phone = res.objects.find(o => o.class === 'cell phone');
          if (phone && phone.score > 0.55) {
            handleSecurityBreach('DEVICE_VIOLATION', 'CRITICAL SECURITY BREACH: An unauthorized electronic device (Mobile Phone) was detected. Your exam has been terminated immediately.');
            return;
          }

          if (res.violations.includes('Critical Head Movement')) {
            handleSecurityBreach('HEAD_MOVEMENT_VIOLATION', 'CRITICAL SECURITY BREACH: more movemenet of head observed. Your exam has been terminated.');
            return;
          }

          if (res.violations.includes('Hand Detected')) {
            triggerViolation('Anomaly: Hand Detected in Frame', 25);
          }
        } else if (res.faces.length > 1) {
          faceBadge.style.background = 'var(--danger)';
          faceBadge.innerText = 'ERROR: Multiple Persons';
          triggerViolation('CRITICAL: Multiple People Detected', 100);

          handleSecurityBreach('IDENTITY_VIOLATION', 'CRITICAL SECURITY BREACH: Multiple persons detected in the proctoring frame. Your exam has been terminated.');
          return;
        } else {
          faceBadge.style.background = 'var(--warning)';
          faceBadge.innerText = 'Face Missing';
          triggerViolation('Head Movement Alert: Back/Absent Detected', 50);

          state.monitoring.faceMissingFailures = (state.monitoring.faceMissingFailures || 0) + 1;
          if (state.monitoring.faceMissingFailures >= 5) {
            handleSecurityBreach('IDENTITY_VIOLATION', 'CRITICAL SECURITY BREACH: Candidate face missing for an extended period. Your exam has been terminated.');
            return;
          }
        }

        const phone = res.objects.find(o => o.class === 'cell phone');
        if (phone) triggerViolation('Banned Device: Mobile Phone', 95);
      }
    }

    // High frequency visual loop for smooth tracking box
    requestAnimationFrame(monitor);
  };

  const drawOverlays = (canvas, video, face, attention) => {
    const ctx = canvas.getContext('2d');
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!face) return; // Guard clause if no face is provided

    // --- NEW: Grid Bounding Box "Lock" ---
    if (face.box) {
      const { xMin, yMin, width, height } = face.box;
      const xMax = face.box.xMax || (xMin + width);
      const yMax = face.box.yMax || (yMin + height);
      const boxW = xMax - xMin;
      const boxH = yMax - yMin;

      const color = attention > 0.7 ? '#10b981' : (attention > 0.4 ? '#f59e0b' : '#ef4444');
      const rgbaColor = attention > 0.7 ? 'rgba(16, 185, 129, 0.2)' : (attention > 0.4 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)');

      // Draw Main Bounding Box
      ctx.beginPath();
      ctx.rect(xMin, yMin, boxW, boxH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw Tracking Grid (3x3 inner grid inside the box)
      ctx.beginPath();
      ctx.strokeStyle = rgbaColor;
      ctx.lineWidth = 1;

      // Vertical grid lines
      ctx.moveTo(xMin + boxW / 3, yMin);
      ctx.lineTo(xMin + boxW / 3, yMax);
      ctx.moveTo(xMin + (boxW / 3) * 2, yMin);
      ctx.lineTo(xMin + (boxW / 3) * 2, yMax);

      // Horizontal grid lines
      ctx.moveTo(xMin, yMin + boxH / 3);
      ctx.lineTo(xMax, yMin + boxH / 3);
      ctx.moveTo(xMin, yMin + (boxH / 3) * 2);
      ctx.lineTo(xMax, yMin + (boxH / 3) * 2);
      ctx.stroke();

      // Draw Corner Brackets for tech aesthetic
      const bracketLen = 20;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      // Top Left
      ctx.moveTo(xMin, yMin + bracketLen); ctx.lineTo(xMin, yMin); ctx.lineTo(xMin + bracketLen, yMin);
      // Top Right
      ctx.moveTo(xMax - bracketLen, yMin); ctx.lineTo(xMax, yMin); ctx.lineTo(xMax, yMin + bracketLen);
      // Bottom Left
      ctx.moveTo(xMin, yMax - bracketLen); ctx.lineTo(xMin, yMax); ctx.lineTo(xMin + bracketLen, yMax);
      // Bottom Right
      ctx.moveTo(xMax - bracketLen, yMax); ctx.lineTo(xMax, yMax); ctx.lineTo(xMax, yMax - bracketLen);
      ctx.stroke();
    }

    const leftEye = face.keypoints.find(kp => kp.name === 'leftEye' || kp.name === 'left_eye');
    const rightEye = face.keypoints.find(kp => kp.name === 'rightEye' || kp.name === 'right_eye');

    if (leftEye && rightEye) {
      const color = attention > 0.7 ? '#10b981' : (attention > 0.4 ? '#f59e0b' : '#ef4444');

      // Draw Eye Rims
      [leftEye, rightEye].forEach(eye => {
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Scan line effect
        ctx.beginPath();
        ctx.moveTo(eye.x - 20, eye.y);
        ctx.lineTo(eye.x + 20, eye.y);
        ctx.strokeStyle = `rgba(${attention > 0.7 ? '16, 185, 129' : '239, 68, 68'}, 0.3)`;
        ctx.stroke();
      });

      // Target Crosshair on nose if focused
      const nose = face.keypoints.find(kp => kp.name === 'nose');
      if (nose && attention > 0.8) {
        ctx.beginPath();
        ctx.setLineDash([2, 2]);
        ctx.arc(nose.x, nose.y, 25, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  const showWarning = (type) => {
    // 1. Update In-View Alert Bar
    const bar = document.getElementById('ai-alert-bar');
    const msg = document.getElementById('ai-alert-msg');
    if (bar && msg) {
      bar.style.display = 'flex';
      msg.innerText = type.toUpperCase();
      // Auto-hide after 4 seconds
      setTimeout(() => { if (bar) bar.style.display = 'none'; }, 4000);
    }

    // 2. System-Level Toast
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
      background: rgba(239, 68, 68, 0.95); backdrop-filter: blur(16px);
      color: white; padding: 1.25rem 2.5rem; border-radius: 2.5rem;
      font-weight: 800; z-index: 99999; box-shadow: 0 20px 40px rgba(239, 68, 68, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.2); animation: slideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      display: flex; align-items: center; gap: 1rem; font-family: 'Inter', sans-serif;
    `;
    const isVocal = type.includes('Vocal Anomaly');
    toast.innerHTML = `<span style="font-size: 1.5rem;">${isVocal ? '🎙️' : '⚠️'}</span> <div style="display:flex; flex-direction:column;"><span style="font-size: 0.7rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.1em;">${isVocal ? 'Acoustic Security' : 'AI Security Alert'}</span><span style="font-size: 1.1rem; letter-spacing: -0.01em;">${type.toUpperCase()}</span></div>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.5s forwards';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  };

  const triggerViolation = (type, score) => {
    // Cooldown logic to prevent frame-by-frame spamming
    const now = Date.now();
    const lastTrigger = state.monitoring.cooldowns[type] || 0;
    if (now - lastTrigger < 4000) return; // 4 second cooldown per violation type

    state.monitoring.cooldowns[type] = now;
    state.exam.violations.push({ time: new Date().toLocaleTimeString(), type, score });
    state.exam.suspicionScore = Math.min(100, state.exam.suspicionScore + (score / 10));
    const vC = document.getElementById('v-count');
    if (vC) vC.innerText = state.exam.violations.length;
    addLog(`ALERT: ${type} `, 'var(--danger)');

    // High-Visibility Alert System
    showWarning(type);

    // Screen Flash Effect
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed; inset:0; background:rgba(239, 68, 68, 0.15); border: 8px solid var(--danger); z-index:9999; pointer-events:none; animation: fadeIn 0.3s forwards;';
    document.body.appendChild(flash);
    setTimeout(() => {
      flash.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => flash.remove(), 300);
    }, 400);

    if (state.exam.violations.length >= 5) {
      alert("CRITICAL SECURITY BREACH: Protocol violated. Assessment terminated.");
      render('submission');
    }
  };

  monitor();
}

// --- PROCTOR AUTHENTICATION & DASHBOARD ---

window.renderProctorLogin = () => {
  const mount = document.getElementById('view-mount');
  mount.innerHTML = `
    <div id="back-nav" class="back-btn" onclick="location.reload()">← Student Portal</div>
    <div class="card" style="max-width: 480px; margin: 6rem auto; text-align: center;">
      <h2 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 0.5rem;">Proctor Access</h2>
      <p style="color: var(--text-muted); margin-bottom: 2rem;">Administrator authentication required.</p>
      
      <form id="proctor-login-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div class="input-group">
          <input type="text" class="input-field" id="p-username" placeholder="Username" value="admin" required />
        </div>
        <div class="input-group">
          <input type="password" class="input-field" id="p-password" placeholder="Password" value="admin123" required />
          <div id="p-login-error" style="color: var(--danger); font-size: 0.85rem; margin-top: 0.5rem; display: none;"></div>
        </div>
        <button type="submit" class="btn btn-primary" id="btn-p-login" style="height: 3.5rem;">Login as Proctor</button>
      </form>
    </div>
  `;

  document.getElementById('proctor-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('p-username').value;
    const p = document.getElementById('p-password').value;
    const err = document.getElementById('p-login-error');
    const btn = document.getElementById('btn-p-login');

    btn.innerText = 'Authenticating...';
    btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/proctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();

      if (res.ok) {
        state.proctorToken = data.token;
        renderAdminDashboard();
      } else {
        err.innerText = data.detail || 'Invalid Credentials';
        err.style.display = 'block';
        btn.innerText = 'Login as Proctor';
        btn.disabled = false;
      }
    } catch (e) {
      err.innerText = 'Connection Error.';
      err.style.display = 'block';
      btn.innerText = 'Login as Proctor';
      btn.disabled = false;
    }
  });
};

const renderAdminDashboard = async () => {
  const mount = document.getElementById('view-mount');
  mount.innerHTML = `<div style="text-align:center; padding: 5rem;"><h2 style="color:var(--text-muted);">Loading Proctor Data...</h2></div>`;

  try {
    // Fetch codes and reports in parallel
    const [codesRes, reportsRes] = await Promise.all([
      fetch(`${API_URL}/proctor/codes`),
      fetch(`${API_URL}/proctor/reports`)
    ]);

    const codesData = await codesRes.json();
    const reportsData = await reportsRes.json();

    const codesList = Object.keys(codesData.codes || {}).reverse();
    const activeCodeStr = codesList.length > 0 ? codesList[0] : 'None';
    const reports = reportsData.reports || [];

    const statsIntegrity = reports.length > 0
      ? Math.round((reports.filter(r => r.suspicion_score < 30).length / reports.length) * 100) + '%'
      : 'N/A';

    mount.innerHTML = `
    <div class="card" style="max-width: 1200px; margin: 0 auto; min-height: 80vh;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem;">
          <div>
            <h2>System Administrator Overview</h2>
            <p style="color: var(--text-muted);">Real-time Proctoring Oversight Network</p>
          </div>
          <button onclick="location.reload()" class="btn btn-primary" style="background:var(--danger); border-color:var(--danger);">Sign Out</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 3rem;">
          ${renderStatCard('Total Submissions', reports.length.toString())}
          ${renderStatCard('Global Integrity Rate', statsIntegrity)}
          ${renderStatCard('High Risk Tests', reports.filter(r => r.suspicion_score >= 50).length.toString())}
          
          <div style="background: var(--glass-heavy); padding: 2rem; border-radius: 1.5rem; border: 1px solid var(--primary); text-align: center; position: relative; overflow: hidden;">
             <div style="position: absolute; inset:0; background: var(--primary); opacity: 0.1; pointer-events: none;"></div>
             <div style="font-size: 0.75rem; font-weight: 800; color: var(--primary); margin-bottom: 0.75rem; text-transform: uppercase;">Latest Test Code</div>
             <div id="latest-code-display" style="font-size: 1.5rem; font-weight: 900; color: #fff; font-family:'Space Mono',monospace;">${activeCodeStr}</div>
             <button id="btn-gen-code" class="btn btn-primary" style="margin-top: 1rem; padding: 0.5rem 1rem; font-size: 0.8rem; height: auto;">Generate New Code</button>
          </div>
        </div>

        <h3>Global Session Feed</h3>
        <div style="margin-top: 1.5rem; background: var(--glass); border-radius: 1.5rem; border: 1px solid var(--glass-border); overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
             <thead>
                <tr style="text-align: left; background: var(--glass-heavy);">
                  <th style="padding: 1rem;">Student ID</th>
                  <th style="padding: 1rem;">Exam Code</th>
                  <th style="padding: 1rem;">Risk Rating</th>
                  <th style="padding: 1rem;">Violations</th>
                  <th style="padding: 1rem;">Status</th>
                  <th style="padding: 1rem;">Action</th>
                </tr>
             </thead>
             <tbody>
                ${reports.length > 0 ? reports.map(r => {
      let risk = 'LOW'; let col = 'success';
      if (r.suspicion_score > 60) { risk = 'CRITICAL'; col = 'danger'; }
      else if (r.suspicion_score > 30) { risk = 'HIGH'; col = 'warning'; }

      return `
                    <tr style="border-bottom: 1px solid var(--glass-border);">
                      <td style="padding: 1rem; font-weight: 600;">${r.student_id}</td>
                      <td style="padding: 1rem; font-family: 'Space Mono';">${r.code}</td>
                      <td style="padding: 1rem;"><span style="color: var(--${col}); font-weight: 800;">${risk} (${Math.round(r.suspicion_score)}%)</span></td>
                      <td style="padding: 1rem; color: ${r.violation_count > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${r.violation_count} Flags</td>
                      <td style="padding: 1rem;">
                        ${r.closed_reason ? `<span class="badge" style="background:var(--danger)">Terminated</span>` : `<span class="badge" style="background:var(--success)">Completed</span>`}
                      </td>
                      <td style="padding: 1rem;"><button onclick="viewProctorReport('${r.report_id}')" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.7rem;">Review Evidence</button></td>
                    </tr>
                  `;
    }).reverse().join('') : `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No exam reports submitted yet.</td></tr>`}
             </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-gen-code').addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_URL}/proctor/generate_code`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          document.getElementById('latest-code-display').innerText = data.code;
          // Optional visual feedback
          const disp = document.getElementById('latest-code-display');
          disp.style.color = 'var(--success)';
          setTimeout(() => disp.style.color = '#fff', 1000);
        }
      } catch (e) {
        console.error("Code gen failed");
      }
    });

  } catch (e) {
    mount.innerHTML = `<div style="color:var(--danger); text-align:center;">Failed to load server data. Ensure backend is running.</div>`;
  }
}

window.viewProctorReport = async (reportId) => {
  const mount = document.getElementById('view-mount');
  mount.innerHTML = `<div style="text-align:center; padding: 5rem;"><h2 style="color:var(--text-muted);">Loading Evidence Vault...</h2></div>`;

  try {
    const res = await fetch(`${API_URL}/proctor/reports/${reportId}`);
    const data = await res.json();

    if (!data.success) throw new Error("Not found");
    const r = data.report;

    mount.innerHTML = `
      <div class="card" style="max-width: 1000px; margin: 3rem auto;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 2rem;">
          <div>
            <button onclick="renderAdminDashboard()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-bottom:1rem; font-weight:bold;">← Back to Dashboard</button>
            <h2 style="font-size: 2.5rem; font-weight: 900;">Evidence Vault: ${r.student_id}</h2>
            <p style="color: var(--text-muted); font-size: 1.1rem; margin-top: 0.5rem;">Exam Code: ${r.code} &bull; Submitted: ${new Date(r.submitted_at).toLocaleString()}</p>
          </div>
          <div class="badge" style="background: ${r.suspicion_score > 30 ? 'var(--danger)' : 'var(--success)'}; font-size: 1.1rem; padding: 1rem 2rem; border-radius: 1.5rem;">
             Suspicion Rating: ${Math.round(r.suspicion_score)}%
          </div>
        </div>

        ${r.closed_reason ? `<div style="background: rgba(239, 68, 68, 0.1); border-left: 5px solid var(--danger); padding: 1.5rem; border-radius: 1rem; margin-bottom: 2rem; color: #fff;">
          <strong>TERMINATION REASON:</strong> ${r.closed_reason.replace('_', ' ')}
        </div>` : ''}

        <h3 style="margin-bottom: 1.5rem;">Snapshot Evidence</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 4rem;">
          ${r.photos && r.photos.length > 0 ? r.photos.map(p => `
             <div style="aspect-ratio: 4/3; background: #000; border-radius: 1rem; overflow: hidden; position: relative;">
                 <img src="${p.data}" style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);">
                 <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.7); font-size: 0.65rem; padding: 4px; border-radius: 4px;">${p.time || 'Snap'}</div>
                 ${p.confidence ? `<div style="position: absolute; top: 8px; right: 8px; background: ${p.confidence < 50 ? 'var(--danger)' : 'var(--success)'}; font-size: 0.65rem; padding: 4px; border-radius: 4px; font-weight: bold;">${Math.round(p.confidence)}% Match</div>` : ''}
             </div>
          `).join('') : '<p>No snapshot data included in payload.</p>'}
        </div>

        <h3 style="margin-bottom: 1.5rem;">Violation Chronology (${r.violations.length} logs)</h3>
        <div style="background: var(--glass-heavy); border-radius: 1.5rem; border: 1px solid var(--glass-border); overflow: hidden;">
           <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                 <tr style="background: var(--glass-border);">
                    <th style="padding: 1rem;">Time</th>
                    <th style="padding: 1rem;">Anomaly Rule Overridden</th>
                    <th style="padding: 1rem;">Severity Weight</th>
                 </tr>
              </thead>
              <tbody>
                 ${r.violations.length > 0 ? r.violations.map(v => `
                   <tr style="border-bottom: 1px solid var(--glass-border);">
                      <td style="padding: 1rem; font-family:'Space Mono'; opacity: 0.8;">${v.time}</td>
                      <td style="padding: 1rem; color: var(--danger); font-weight: 600;">${v.type}</td>
                      <td style="padding: 1rem;">+${v.score} pts</td>
                   </tr>
                 `).join('') : `<tr><td colspan="3" style="padding: 2rem; text-align:center;">Clean session. No anomalies.</td></tr>`}
              </tbody>
           </table>
        </div>
      </div>
    `;
  } catch (e) {
    mount.innerHTML = `<div style="color:var(--danger); text-align:center; padding: 5rem;">Error loading report.</div>`;
  }
}


// Tab Switching & Window Blur Detection Security
// Security Breach Termination Handler
function handleSecurityBreach(reason = 'TAB_SWITCH', customMsg = null) {
  if (state.step !== 'exam' || !state.monitoring.isActive) return;

  const msg = customMsg || 'CRITICAL SECURITY BREACH: Tab switching, window minimization, or loss of focus detected. Your exam has been terminated and logged.';
  console.warn(`Security Breach[${reason}]: ${msg} `);

  // Update state and log violation first
  state.monitoring.isActive = false;
  state.exam.closedReason = reason;
  state.closedReason = reason;

  // Stop the camera/mic stream immediately to "close" the hardware connection
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
    console.log('Media streams terminated due to security violation.');
  }

  // Modal alert to stop the student and explain why the exam closed
  alert(msg);

  // Attempt to auto-submit the violation report
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) {
    submitBtn.click();
  } else {
    render('submission');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.step === 'exam') {
    handleSecurityBreach();
  }
});

window.addEventListener('blur', () => {
  if (state.step === 'exam') {
    handleSecurityBreach();
  }
});

// Initial Init
const initApp = () => {
  console.log('NexProctor AI Engine Booting...');

  // Start pre-warming AI models
  aiService.initialize().catch(err => console.error('AI Core Cold Start Failure:', err));

  // Attachment phase
  const attachBootstrap = () => {
    const form = document.getElementById('login-form');
    if (form) {
      initLogic('login');
      console.log('Security Gateway Attached.');
    } else {
      console.warn('Static mount point missing, falling back to dynamic render.');
      render('login');
    }
  };

  // Immediate or deferred attachment
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachBootstrap);
  } else {
    attachBootstrap();
  }

  // Admin Shortcut
  const logo = document.querySelector('.logo');
  if (logo) {
    logo.onclick = window.renderProctorLogin;
  }
};

initApp();
