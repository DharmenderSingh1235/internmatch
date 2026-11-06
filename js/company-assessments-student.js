document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("student-company-assessments");
  if (!list) return;
  const getToken = () => sessionStorage.getItem("im_student_api_token");
  const currentUser = Store.getCurrentUser();
  const run = document.getElementById("student-assessment-run");
  const api = async (route, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response, data;
    try {
      response = await fetch(`${window.IM_API_BASE}/api${route}`, { ...options, signal: controller.signal, headers: { authorization: `Bearer ${getToken() || ""}`, "content-type": "application/json", ...(options.headers || {}) } });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The assessment service did not respond within 10 seconds. Check that the API is running, then refresh.");
      throw new Error("Could not reach the assessment service. Check that the API is running, then refresh.");
    } finally { clearTimeout(timeout); }
    if (!response.ok) { const error = new Error(data.error || `Student API request failed (${response.status}).`); error.status = response.status; throw error; }
    return data;
  };
  const esc = (value) => App.escapeHtml(String(value ?? ""));
  async function load() {
    if (!getToken()) {
      list.innerHTML = currentUser?.role === "student"
        ? `<p class="hint">This browser session is not connected to the assessment service. Sign in with the same student account you used to apply.</p><form id="assessment-inline-login" class="assessment-inline-login"><label class="field"><span>Student email</span><input type="email" name="email" required autocomplete="username" value="${esc(currentUser.email)}"></label><label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label><button class="btn btn--primary btn--sm" type="submit">Sign in and load my assessments</button><p class="hint" data-assessment-login-error role="alert"></p></form>`
        : '<p class="hint">Sign in with the student account that applied to the internship. <a href="login.html?role=student&amp;next=interview-prep.html%23company-assessments-panel">Student sign in</a></p>';
      const loginForm = document.getElementById("assessment-inline-login");
      loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = loginForm.querySelector('[type="submit"]'); const errorLabel = loginForm.querySelector("[data-assessment-login-error]");
        submit.disabled = true; errorLabel.textContent = "Signing in…";
        try {
          const response = await fetch(`${window.IM_API_BASE}/api/auth/student/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value }) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Student sign-in failed.");
          sessionStorage.setItem("im_student_api_token", data.token);
          errorLabel.textContent = "Signed in. Loading your assessments…";
          await load();
        } catch (error) { errorLabel.textContent = error.message; submit.disabled = false; }
      });
      return;
    }
    list.innerHTML = '<p class="hint">Loading available assessments…</p>';
    try {
      const data = await api("/student/assessments");
      list.innerHTML = data.items.length ? data.items.map((item) => `<article class="company-role-card"><div class="company-role-main"><div><span class="company-status-badge ${item.submitted ? "is-active" : ""}">${item.submitted ? "Submitted" : "Available"}</span><h3>${esc(item.title)}</h3><p>${esc(item.companyName)} · ${esc(item.category)} · ${esc(item.difficulty)} · ${item.durationMinutes} minutes · ${item.totalMarks} marks</p>${item.submitted ? `<p><strong>Score:</strong> ${item.result.score}/${item.result.totalMarks} · ${item.result.passed ? "Passing score" : "Below passing score"} · ${esc(item.result.status || "Scored")}</p>` : `<p>Passing score: ${item.passingMarks} · One submission allowed</p>`}</div><div class="company-role-side">${item.submitted ? "✓" : `<button class="btn btn--primary btn--sm" type="button" data-start-assessment="${esc(item.id)}">Start assessment</button>`}</div></div></article>`).join("") : '<p class="hint">No assessment is visible for this account yet. A company assessment appears here after Admin approves it and you have applied to its related internship.</p>';
      list.querySelectorAll("[data-start-assessment]").forEach((button) => button.addEventListener("click", () => start(button.dataset.startAssessment, data.items.find((item) => item.id === button.dataset.startAssessment)?.monitoring || {})));
    } catch (error) {
      list.innerHTML = error.status === 401
        ? '<p class="hint">Your student server session expired. <a href="login.html?role=student&amp;next=interview-prep.html%23company-assessments-panel">Sign in again and return here</a>.</p>'
        : `<p class="hint" role="status">${esc(error.message)} <button class="btn btn--ghost btn--sm" type="button" data-assessment-retry>Try again</button></p>`;
      list.querySelector("[data-assessment-retry]")?.addEventListener("click", load);
    }
  }
  async function start(id, settings) {
    const policy = { focus: settings.focus !== false, fullscreen: settings.fullscreen !== false, clipboard: true, camera: settings.camera === true, sound: settings.sound === true, durationThresholdSeconds: Number(settings.durationThresholdSeconds) || 5, cooldownSeconds: Number(settings.cooldownSeconds) || 30, warningLimit: 4 };
    run.hidden = false;
    run.innerHTML = `<section class="assessment-integrity-intro"><span class="browse-eyebrow">Before you begin</span><h2>Camera-monitored assessment</h2><p>With your permission, the browser checks face count and movement locally. Camera video stays on this device unless you separately opt in to share a live view with this assessment’s recruiter and any teacher you invited by verified email. Face checks do not identify people.</p>${policy.camera ? `<label class="assessment-camera-consent"><input id="assessment-camera-consent" type="checkbox"> I agree to enable the camera face-count and movement check for this test.</label><label class="assessment-signal-consent"><input id="assessment-live-camera-consent" type="checkbox"> Optional: share my live camera video with the recruiter and their verified, invited observers while I am taking this assessment.</label><p class="hint">If more than one face stays in view, the system gives a camera warning. A second sustained detection ends and submits the test for review. Face checks can be mistaken and are not proof of misconduct.</p>` : ""}${policy.sound ? `<label class="assessment-signal-consent"><input id="assessment-sound-consent" type="checkbox"> Optionally allow the microphone to check sustained sound level locally. No audio is recorded or uploaded.</label>` : ""}<p class="hint">Stay in this browser tab and fullscreen. Leaving the exam window or exiting fullscreen automatically submits and ends the assessment. The browser cannot lock other desktop apps.</p><div class="assessment-integrity-actions"><button class="btn btn--primary" type="button" id="assessment-start-camera" ${policy.camera ? "disabled" : ""}>Start assessment</button><button class="btn btn--ghost" type="button" id="assessment-start-cancel">Cancel</button></div><p class="hint" id="assessment-camera-message" role="status"></p></section>`;
    const startButton = document.getElementById("assessment-start-camera");
    const message = document.getElementById("assessment-camera-message");
    document.getElementById("assessment-camera-consent")?.addEventListener("change", (event) => { startButton.disabled = !event.currentTarget.checked; });
    document.getElementById("assessment-start-cancel").addEventListener("click", async () => { if (document.fullscreenElement === run) await document.exitFullscreen().catch(() => {}); run.dataset.assessmentActive = "false"; run.hidden = true; run.innerHTML = ""; });
    startButton.addEventListener("click", async () => {
      startButton.disabled = true;
      let cameraStream = null, audioStream = null;
      if (policy.fullscreen) {
        try {
          if (!document.fullscreenEnabled || !run.requestFullscreen) throw new Error("This browser does not support fullscreen for this assessment.");
          await run.requestFullscreen({ navigationUI: "hide" });
        } catch (error) { message.textContent = error.message || "Allow fullscreen, then try starting the assessment again."; startButton.disabled = false; return; }
      }
      let faceDetector = null;
      if (policy.camera && document.getElementById("assessment-camera-consent")?.checked) {
        try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        catch { message.textContent = "Camera access is required for this recruiter assessment. Allow camera access, then try again."; startButton.disabled = false; if (document.fullscreenElement === run) await document.exitFullscreen().catch(() => {}); return; }
        try { message.textContent = "Loading the on-device face check…"; faceDetector = await loadFaceDetector(); }
        catch (error) { cameraStream.getTracks().forEach((track) => track.stop()); message.textContent = `Could not load the local face-check model: ${error.message}. Check your internet connection and try again.`; startButton.disabled = false; if (document.fullscreenElement === run) await document.exitFullscreen().catch(() => {}); return; }
      }
      if (policy.sound && document.getElementById("assessment-sound-consent")?.checked) {
        try { audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
        catch { message.textContent = "Microphone permission was unavailable. The assessment will continue without local sound signals."; }
      }
      begin(id, cameraStream, audioStream, policy, faceDetector, !!document.getElementById("assessment-live-camera-consent")?.checked);
    });
    run.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function writingStyleSignals(answers) {
    const texts = answers.filter((answer) => typeof answer.text === "string" && answer.text.trim().length >= 40).map((answer) => answer.text.trim());
    const signals = [];
    const disclaimer = "These simple style clues are unreliable, can flag human writing, and do not establish AI use or misconduct.";
    if (!texts.length) return { label: "Not enough written text to review", signals, disclaimer };
    const combined = texts.join(" ").toLowerCase();
    const genericPhrases = ["in today's fast-paced", "it is important to note", "delve into", "moreover", "furthermore", "in conclusion", "plays a crucial role"];
    const found = genericPhrases.filter((phrase) => combined.includes(phrase));
    if (found.length) signals.push("Some common or generic phrasing appears in written answers.");
    if (texts.length >= 2 && texts.map((value) => value.toLowerCase().replace(/\s+/g, " ")).some((value, index, all) => all.indexOf(value) !== index)) signals.push("One or more written answers repeat the same wording.");
    return { label: signals.length ? "Patterns for human review" : "No listed patterns found", signals, disclaimer };
  }
  let faceDetectorPromise = null;
  async function loadFaceDetector() {
    if (!faceDetectorPromise) faceDetectorPromise = (async () => {
      const { FilesetResolver, FaceDetector } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs");
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      const modelAssetPath = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
      try { return await FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath, delegate: "GPU" }, runningMode: "VIDEO", minDetectionConfidence: 0.65 }); }
      catch { return FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath, delegate: "CPU" }, runningMode: "VIDEO", minDetectionConfidence: 0.65 }); }
    })();
    try { return await faceDetectorPromise; }
    catch (error) { faceDetectorPromise = null; throw error; }
  }
  function createLocalSignalMonitor(video, audioStream, enabled, onSignal = () => {}, thresholdSeconds = 5, soundThresholdDbfs = -18, faceDetector = null) {
    const startedAt = Date.now();
    const state = { enabled: !!enabled, soundAvailable: !!audioStream, visualAvailable: !!video, faceAvailable: !!faceDetector, faceCount: 0, faceCountFlags: 0, soundCount: 0, visualCount: 0, soundMoments: [], visualMoments: [] };
    if (!enabled) return { snapshot: () => ({ enabled: false }), stop: async () => {} };
    let audioContext = null; let analyser = null; let audioData = null; let lastSoundAt = 0; let lastVisualAt = 0; let soundAboveSince = 0; let visualAboveSince = 0; let noFaceSince = 0; let multipleFacesSince = 0; let lastFaceSignalAt = 0; let previousFrame = null;
    const stamp = () => { const total = Math.floor((Date.now() - startedAt) / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; };
    const canvas = document.createElement("canvas"); canvas.width = 48; canvas.height = 36;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (audioStream && window.AudioContext) {
      try { audioContext = new AudioContext(); analyser = audioContext.createAnalyser(); analyser.fftSize = 512; audioData = new Uint8Array(analyser.fftSize); const silentOutput = audioContext.createGain(); silentOutput.gain.value = 0; audioContext.createMediaStreamSource(audioStream).connect(analyser); analyser.connect(silentOutput); silentOutput.connect(audioContext.destination); audioContext.resume().catch(() => {}); }
      catch { state.soundAvailable = false; }
    } else state.soundAvailable = false;
    const interval = setInterval(() => {
      if (analyser && audioData) {
        analyser.getByteTimeDomainData(audioData);
        let squares = 0; for (const value of audioData) { const sample = (value - 128) / 128; squares += sample * sample; }
        const rms = Math.sqrt(squares / audioData.length);
        const soundThresholdRms = Math.pow(10, Number(soundThresholdDbfs || -18) / 20);
        if (rms > soundThresholdRms) { soundAboveSince ||= Date.now(); if (Date.now() - soundAboveSince >= thresholdSeconds * 1000 && Date.now() - lastSoundAt > 6000) { state.soundCount = Math.min(100, state.soundCount + 1); if (state.soundMoments.length < 10) state.soundMoments.push(stamp()); lastSoundAt = Date.now(); onSignal("sound_signal"); soundAboveSince = Date.now(); } } else soundAboveSince = 0;
      }
      if (faceDetector && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const detections = faceDetector.detectForVideo(video, performance.now()).detections || [];
          const faceCount = detections.filter((detection) => Number(detection.categories?.[0]?.score) >= 0.65).length;
          state.faceCount = faceCount;
          if (faceCount === 0) {
            noFaceSince ||= Date.now(); multipleFacesSince = 0;
            if (Date.now() - noFaceSince >= thresholdSeconds * 1000 && Date.now() - lastFaceSignalAt > 8000) { state.faceCountFlags = Math.min(100, state.faceCountFlags + 1); lastFaceSignalAt = Date.now(); onSignal("face_absent"); noFaceSince = Date.now(); }
          } else if (faceCount > 1) {
            multipleFacesSince ||= Date.now(); noFaceSince = 0;
            if (Date.now() - multipleFacesSince >= Math.max(5, thresholdSeconds) * 1000 && Date.now() - lastFaceSignalAt > 8000) { state.faceCountFlags = Math.min(100, state.faceCountFlags + 1); lastFaceSignalAt = Date.now(); onSignal("multiple_faces"); multipleFacesSince = Date.now(); }
          } else { noFaceSince = 0; multipleFacesSince = 0; }
        } catch { state.faceAvailable = false; }
      }
      if (context && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          if (previousFrame) {
            let changed = 0; let samples = 0;
            for (let i = 0; i < pixels.length; i += 12) { const delta = Math.abs(pixels[i] - previousFrame[i]) + Math.abs(pixels[i + 1] - previousFrame[i + 1]) + Math.abs(pixels[i + 2] - previousFrame[i + 2]); if (delta > 90) changed++; samples++; }
            if (samples && changed / samples > 0.24) { visualAboveSince ||= Date.now(); if (Date.now() - visualAboveSince >= thresholdSeconds * 1000 && Date.now() - lastVisualAt > 8000) { state.visualCount = Math.min(100, state.visualCount + 1); if (state.visualMoments.length < 10) state.visualMoments.push(stamp()); lastVisualAt = Date.now(); onSignal("camera_movement"); visualAboveSince = Date.now(); } } else visualAboveSince = 0;
          }
          previousFrame = pixels;
        } catch { state.visualAvailable = false; }
      }
    }, 1500);
    return {
      snapshot: () => ({ enabled: true, soundAvailable: state.soundAvailable, visualAvailable: state.visualAvailable, faceAvailable: state.faceAvailable, faceCount: state.faceCount, faceCountFlags: state.faceCountFlags, soundCount: state.soundCount, visualCount: state.visualCount, soundMoments: state.soundMoments.slice(0, 10), visualMoments: state.visualMoments.slice(0, 10), disclaimer: "Face-count, movement, and sound-level signals run locally. They may be inaccurate and are not proof of cheating or AI use." }),
      stop: async () => { clearInterval(interval); try { if (audioContext && audioContext.state !== "closed") await audioContext.close(); } catch {} }
    };
  }
  async function begin(id, cameraStream, audioStream, policy, faceDetector, shareLiveCamera = false) {
    let interval = null;
    let signalMonitor = null;
    let liveBroadcastTimer = null, livePollBusy = false;
    const livePeers = new Map();
      let isSubmitting = false, warningCount = 0, multipleFaceWarningCount = 0, warningBusy = false, contextExitPending = false;
    const stopCamera = async () => {
      clearInterval(liveBroadcastTimer);
      signalMonitor && await signalMonitor.stop();
      for (const [viewerId, peer] of livePeers) {
        try { peer.connection.close(); } catch {}
        api(`/student/assessments/${encodeURIComponent(id)}/live-viewers/${encodeURIComponent(viewerId)}/signals`, { method: "POST", body: JSON.stringify({ type: "end" }) }).catch(() => {});
      }
      livePeers.clear();
      cameraStream?.getTracks().forEach((track) => track.stop()); audioStream?.getTracks().forEach((track) => track.stop());
    };
    try {
      const { assessment } = await api(`/student/assessments/${encodeURIComponent(id)}/start`, { method: "POST", body: JSON.stringify({ shareLiveCamera }) });
      warningCount = Number(assessment.warningCount) || 0;
      multipleFaceWarningCount = Number(assessment.multipleFaceWarningCount) || 0;
      run.dataset.assessmentActive = "true";
      let remaining = assessment.remainingSeconds;
      const monitoring = assessment.monitoring || policy;
      run.innerHTML = `<header class="assessment-exam-topbar"><div><span class="assessment-exam-brand">InternMatch <b>Assessment</b></span><span class="assessment-exam-title">${esc(assessment.title)}</span></div><div class="assessment-exam-meta"><span>${esc(assessment.category)} · ${esc(assessment.totalMarks)} marks</span><strong id="student-assessment-timer" aria-live="polite">Time remaining</strong></div></header><nav class="assessment-question-nav" id="assessment-question-nav" aria-label="Assessment questions"></nav><div id="assessment-warning-counter" class="assessment-warning-banner" role="status" aria-live="polite">Warnings: <strong>${warningCount} / 4</strong> · Camera warnings: <strong>${multipleFaceWarningCount} / 2</strong> · Monitoring active</div><p id="assessment-fullscreen-warning" class="assessment-integrity-note" hidden>Fullscreen was exited. Your test is closing and submitting for review.</p><main class="assessment-exam-layout"><aside class="assessment-exam-side"><span class="browse-eyebrow">ASSESSMENT GUIDE</span><h2>Read each task carefully</h2><p>Your progress is saved on this page as you move between questions.</p><div class="assessment-exam-monitoring"><strong>Monitoring active</strong><span>Camera analysis runs on this device. Live recruiter viewing is enabled only if you opted in. Video is not recorded. Leaving this tab or fullscreen submits the test.</span></div>${cameraStream ? `<div class="assessment-camera-row"><div class="assessment-camera-preview"><video id="assessment-camera-video" autoplay muted playsinline></video><span><i></i> Camera preview · active while test runs</span></div></div>` : ""}</aside><form id="student-assessment-form" class="assessment-exam-question-form"><div id="assessment-current-question"></div><div class="assessment-exam-actions"><button class="btn btn--ghost" id="assessment-previous" type="button">← Previous</button><span id="assessment-question-progress"></span><button class="btn btn--primary" id="assessment-next" type="button">Next →</button><button class="btn btn--primary" id="assessment-submit-final" type="submit" hidden>Submit assessment</button></div><p class="hint" id="assessment-submit-status" role="status" aria-live="polite"></p></form></main>`;
      const video = document.getElementById("assessment-camera-video");
      if (video && cameraStream) video.srcObject = cameraStream;
      if (shareLiveCamera && cameraStream && window.RTCPeerConnection) {
        const sendLiveSignal = (viewerId, type, data) => api(`/student/assessments/${encodeURIComponent(id)}/live-viewers/${encodeURIComponent(viewerId)}/signals`, { method: "POST", body: JSON.stringify({ type, data }) });
        const readViewerSignals = async (viewerId, peer) => {
          const data = await api(`/student/assessments/${encodeURIComponent(id)}/live-viewers/${encodeURIComponent(viewerId)}/signals?after=${peer.cursor}`);
          peer.cursor = data.cursor || peer.cursor;
          for (const signal of data.signals || []) {
            if (signal.type === "answer" && !peer.remoteReady) {
              await peer.connection.setRemoteDescription(signal.data); peer.remoteReady = true;
              for (const candidate of peer.pendingIce.splice(0)) await peer.connection.addIceCandidate(candidate).catch(() => {});
            } else if (signal.type === "ice") {
              if (peer.remoteReady) await peer.connection.addIceCandidate(signal.data).catch(() => {});
              else peer.pendingIce.push(signal.data);
            }
          }
        };
        const pollLiveViewers = async () => {
          if (livePollBusy || isSubmitting || run.dataset.assessmentActive !== "true") return;
          livePollBusy = true;
          try {
            const { viewers = [] } = await api(`/student/assessments/${encodeURIComponent(id)}/live-viewers`);
            const activeIds = new Set(viewers);
            for (const [viewerId, peer] of livePeers) if (!activeIds.has(viewerId)) { peer.connection.close(); livePeers.delete(viewerId); }
            for (const viewerId of viewers) {
              if (!livePeers.has(viewerId)) {
                const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
                const peer = { connection, cursor: 0, remoteReady: false, pendingIce: [] };
                livePeers.set(viewerId, peer);
                cameraStream.getVideoTracks().forEach((track) => connection.addTrack(track, cameraStream));
                connection.onicecandidate = (event) => { if (event.candidate) sendLiveSignal(viewerId, "ice", event.candidate.toJSON()).catch(() => {}); };
                const offer = await connection.createOffer(); await connection.setLocalDescription(offer); await sendLiveSignal(viewerId, "offer", connection.localDescription.toJSON());
              }
              const peer = livePeers.get(viewerId);
              if (peer) await readViewerSignals(viewerId, peer).catch(() => {});
            }
          } catch (error) { console.warn("Recruiter live camera signaling is temporarily unavailable:", error.message); }
          finally { livePollBusy = false; }
        };
        pollLiveViewers(); liveBroadcastTimer = setInterval(pollLiveViewers, 1200);
      }
      const form = document.getElementById("student-assessment-form");
      let currentQuestionIndex = 0;
      const savedAnswers = new Map();
      const questionNav = document.getElementById("assessment-question-nav");
      const questionHost = document.getElementById("assessment-current-question");
      const captureCurrentAnswer = () => {
        const question = assessment.questions[currentQuestionIndex];
        if (!question) return;
        if (question.type === "MCQ") {
          const selected = [...form.querySelectorAll('input[type="radio"]')].find((input) => input.name === `q-${question.id}` && input.checked);
          if (selected) savedAnswers.set(question.id, { questionId: question.id, selectedIndex: Number(selected.value) });
        } else {
          const response = form.querySelector("textarea[data-current-answer]");
          if (response) savedAnswers.set(question.id, { questionId: question.id, text: response.value });
        }
        updateQuestionNav();
      };
      const updateQuestionNav = () => {
        questionNav.querySelectorAll("button[data-question-index]").forEach((button) => {
          const index = Number(button.dataset.questionIndex);
          button.classList.toggle("is-current", index === currentQuestionIndex);
          button.classList.toggle("is-answered", savedAnswers.has(assessment.questions[index]?.id));
          button.setAttribute("aria-current", index === currentQuestionIndex ? "step" : "false");
        });
        document.getElementById("assessment-question-progress").textContent = `Question ${currentQuestionIndex + 1} of ${assessment.questions.length}`;
        document.getElementById("assessment-previous").disabled = currentQuestionIndex === 0;
        document.getElementById("assessment-next").hidden = currentQuestionIndex === assessment.questions.length - 1;
        document.getElementById("assessment-submit-final").hidden = currentQuestionIndex !== assessment.questions.length - 1;
      };
      const renderCurrentQuestion = () => {
        const question = assessment.questions[currentQuestionIndex];
        if (!question) return;
        const saved = savedAnswers.get(question.id);
        questionHost.innerHTML = `<article class="assessment-exam-question"><div class="assessment-exam-question-head"><span>Question ${currentQuestionIndex + 1}</span><span>${esc(question.type)} · ${esc(question.marks)} marks</span></div><h2>${esc(question.prompt)}</h2><div class="assessment-exam-answer">${question.type === "MCQ" ? question.options.map((option, optionIndex) => `<label class="student-assessment-option"><input type="radio" name="q-${esc(question.id)}" value="${optionIndex}" ${saved?.selectedIndex === optionIndex ? "checked" : ""}> <span class="assessment-answer-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${esc(option)}</span></label>`).join("") : `<label class="field"><span>${question.type === "Coding" ? "Your code / solution" : "Your answer"}</span><textarea data-current-answer rows="${question.type === "Coding" ? 12 : 7}" maxlength="10000" placeholder="Write your response here…">${esc(saved?.text || "")}</textarea></label>`}</div></article>`;
        updateQuestionNav();
      };
      questionNav.innerHTML = assessment.questions.map((question, index) => `<button type="button" data-question-index="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`).join("");
      questionNav.addEventListener("click", (event) => {
        const button = event.target.closest("[data-question-index]");
        if (!button) return;
        captureCurrentAnswer(); currentQuestionIndex = Number(button.dataset.questionIndex); renderCurrentQuestion();
      });
      document.getElementById("assessment-previous").addEventListener("click", () => { captureCurrentAnswer(); currentQuestionIndex = Math.max(0, currentQuestionIndex - 1); renderCurrentQuestion(); });
      document.getElementById("assessment-next").addEventListener("click", () => { captureCurrentAnswer(); currentQuestionIndex = Math.min(assessment.questions.length - 1, currentQuestionIndex + 1); renderCurrentQuestion(); });
      form.addEventListener("input", captureCurrentAnswer);
      form.addEventListener("change", captureCurrentAnswer);
      renderCurrentQuestion();
      const warningBox = document.getElementById("assessment-warning-counter");
      const recordWarning = async (signal) => {
        if (warningBusy || isSubmitting || run.dataset.assessmentActive !== "true") return;
        warningBusy = true;
        try {
          const data = await api(`/student/assessments/${encodeURIComponent(id)}/signals`, { method: "POST", body: JSON.stringify({ signal }), keepalive: signal === "context_change" || signal === "fullscreen_exit" });
          warningCount = data.warningCount || warningCount;
          multipleFaceWarningCount = Number(data.multipleFaceWarningCount) || multipleFaceWarningCount;
          if (!data.ignored && data.event) warningBox.innerHTML = `Warnings: <strong>${warningCount} / 4</strong> · Camera warnings: <strong>${multipleFaceWarningCount} / 2</strong> · ${esc(data.event.reason)}${warningCount >= 3 ? " · Final warning" : ""}`;
          warningBox.classList.toggle("is-final", warningCount >= 3 || multipleFaceWarningCount >= 2);
          if (data.terminated) { warningBox.innerHTML = data.terminationReason === "multiple_faces" ? "Multiple faces stayed in view. The test has been closed and submitted for review." : data.terminationReason === "context_change" ? "The assessment window or fullscreen was left. Your answers are being submitted for review." : "Warnings: <strong>4 / 4</strong> · Assessment ended and submitted for review."; form.requestSubmit(); }
        } catch (error) {
          if (signal === "context_change" || signal === "fullscreen_exit") {
            warningBox.textContent = "Exam focus/fullscreen was lost. The page is locked and your answers are being submitted.";
            form.requestSubmit();
          } else App.toast(error.message, "error");
        }
        finally { warningBusy = false; }
      };
      signalMonitor = createLocalSignalMonitor(video, audioStream, !!(cameraStream || audioStream), recordWarning, monitoring.durationThresholdSeconds || policy.durationThresholdSeconds, monitoring.soundThresholdDbfs ?? -18, faceDetector);
      const timer = document.getElementById("student-assessment-timer");
      const format = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      timer.textContent = `Time remaining ${format(remaining)}`;
      interval = setInterval(() => { remaining -= 1; timer.textContent = `Time remaining ${format(Math.max(0, remaining))}`; if (remaining <= 0) { clearInterval(interval); form.requestSubmit(); } }, 1000);
      const stopListeners = () => { document.removeEventListener("visibilitychange", onContextChange); window.removeEventListener("blur", onContextChange); window.removeEventListener("pagehide", onContextChange); document.removeEventListener("fullscreenchange", onFullscreenChange); run.removeEventListener("copy", onClipboard); run.removeEventListener("cut", onClipboard); run.removeEventListener("paste", onClipboard); run.removeEventListener("keydown", onClipboardShortcut); run.removeEventListener("contextmenu", onContextMenu); };
      const terminateForContext = (signal) => {
        if (contextExitPending) return;
        contextExitPending = true;
        form.querySelectorAll("input, textarea, button").forEach((control) => { control.disabled = true; });
        warningBox.textContent = signal === "fullscreen_exit" ? "Fullscreen was exited. The page is locked and your answers are being submitted." : "Exam focus was lost. The page is locked and your answers are being submitted.";
        warningBox.classList.add("is-final");
        const submitOnExit = () => { if (warningBusy && !isSubmitting) { setTimeout(submitOnExit, 150); return; } recordWarning(signal); };
        submitOnExit();
      };
      const onContextChange = () => { if (document.visibilityState === "hidden" || !document.hasFocus()) terminateForContext("context_change"); };
      const onFullscreenChange = () => { const warning = document.getElementById("assessment-fullscreen-warning"); const outside = policy.fullscreen && !document.fullscreenElement; if (warning) warning.hidden = !outside; if (outside) terminateForContext("fullscreen_exit"); };
      const onClipboard = (event) => { event.preventDefault(); recordWarning("clipboard_attempt"); };
      const onClipboardShortcut = (event) => {
        const key = String(event.key || "").toLowerCase();
        const modifierShortcut = (event.ctrlKey || event.metaKey) && ["c", "x", "v"].includes(key);
        const insertDeleteShortcut = event.ctrlKey && key === "insert" || event.shiftKey && ["insert", "delete"].includes(key);
        if (!modifierShortcut && !insertDeleteShortcut) return;
        event.preventDefault(); event.stopPropagation(); recordWarning("clipboard_attempt");
      };
      const onContextMenu = (event) => event.preventDefault();
      document.addEventListener("visibilitychange", onContextChange); window.addEventListener("blur", onContextChange); window.addEventListener("pagehide", onContextChange); document.addEventListener("fullscreenchange", onFullscreenChange);
      run.addEventListener("copy", onClipboard); run.addEventListener("cut", onClipboard); run.addEventListener("paste", onClipboard); run.addEventListener("keydown", onClipboardShortcut); run.addEventListener("contextmenu", onContextMenu);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        isSubmitting = true;
        clearInterval(interval);
        stopListeners();
        const submit = form.querySelector('[type="submit"]');
        const submitStatus = document.getElementById("assessment-submit-status");
        submit.disabled = true;
        submit.textContent = "Submitting…";
        if (submitStatus) submitStatus.textContent = "Saving your answers securely…";
        try {
          captureCurrentAnswer();
          const answers = assessment.questions.map((question) => savedAnswers.get(question.id) || (question.type === "MCQ" ? { questionId: question.id, selectedIndex: null } : { questionId: question.id, text: "" }));
          const result = await api(`/student/assessments/${encodeURIComponent(id)}/submit`, { method: "POST", body: JSON.stringify({ answers, writingReview: writingStyleSignals(answers), integritySignals: signalMonitor?.snapshot() || { enabled: false } }) });
          if (!result?.result) throw new Error("The server did not confirm that your answers were saved. Refresh your assessments and check the submission status.");
          await stopCamera();
          if (document.fullscreenElement === run) await document.exitFullscreen().catch(() => {});
          run.dataset.assessmentActive = "false";
          const resultStatus = result.result.status || "Submitted";
          run.innerHTML = `<h2>${resultStatus === "Terminated for review" ? "Assessment ended for review" : "Assessment submitted"}</h2><p>Your MCQ score: <strong>${Number(result.result.score) || 0}/${Number(result.result.totalMarks) || 0}</strong></p><p>${resultStatus === "Terminated for review" ? "The monitoring policy ended this assessment. The recruiter will review the answers and activity history." : resultStatus === "Scored" ? (result.result.passed ? "You reached the passing score." : "You did not reach the passing score.") : "Your written or coding responses are waiting for recruiter review."}</p><p class="assessment-integrity-note">Activity signals can be inaccurate and are not proof of misconduct. Raw audio and video were not saved or uploaded.</p><button type="button" class="btn btn--primary" id="assessment-done">Back to assessments</button>`;
          document.getElementById("assessment-done").addEventListener("click", () => { run.hidden = true; load(); });
        } catch (error) {
          isSubmitting = false;
          const message = error.message || "Could not submit the assessment. Check your connection and try again.";
          if (submitStatus) submitStatus.textContent = message;
          App.toast(message, "error");
          submit.disabled = false;
          submit.textContent = "Retry submission";
          if (run.dataset.assessmentActive === "true") interval = setInterval(() => { remaining = Math.max(0, remaining - 1); timer.textContent = `Time remaining ${format(remaining)}`; if (remaining <= 0) { clearInterval(interval); form.requestSubmit(); } }, 1000);
        }
      });
      run.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { clearInterval(interval); await stopCamera(); if (document.fullscreenElement === run) await document.exitFullscreen().catch(() => {}); run.dataset.assessmentActive = "false"; App.toast(error.message, "error"); }
  }
  run.addEventListener("click", (event) => {
    if (event.target.closest("[data-resume-assessment-fullscreen]") && run.requestFullscreen) run.requestFullscreen({ navigationUI: "hide" }).catch(() => App.toast("Could not reopen full screen. Use your browser’s full-screen control.", "error"));
  });
  document.getElementById("company-assessments-refresh").addEventListener("click", load);
  load();
});
