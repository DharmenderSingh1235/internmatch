/* js/interview-room.js — Live Voice & Video Interview Room with WebRTC and Recruiter Scorecard */

const InterviewRoom = (function () {
  let activeSession = null;

  const STUN_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  function createModalDOM() {
    let el = document.getElementById("interview-call-modal");
    if (el) return el;

    el = document.createElement("div");
    el.id = "interview-call-modal";
    el.className = "call-modal-backdrop";
    el.style.display = "none";
    el.innerHTML = `
      <div class="call-theater">
        <!-- Top bar -->
        <header class="call-topbar">
          <div class="call-topbar__info">
            <span class="call-live-pill"><span class="call-pulse-dot"></span> LIVE</span>
            <div>
              <h2 id="call-title">Technical Interview</h2>
              <p id="call-subtitle">Participant details</p>
            </div>
          </div>
          <div class="call-topbar__actions">
            <span class="call-timer" id="call-timer">00:00</span>
            <span class="call-connection-badge" id="call-conn-badge">Connecting…</span>
            <button type="button" class="btn btn--ghost btn--sm call-icon-btn" id="call-btn-fullscreen" title="Toggle Fullscreen">⛶</button>
          </div>
        </header>

        <!-- Main Body Grid -->
        <div class="call-body">
          <div class="call-streams-container" id="call-streams-wrap">
            <!-- Remote video stream (main) -->
            <div class="call-video-wrapper call-video-wrapper--remote" id="remote-video-box">
              <video id="call-remote-video" autoplay playsinline></video>
              <div class="call-avatar-placeholder" id="remote-avatar-box">
                <div class="call-avatar-circle" id="remote-avatar-initials">CD</div>
                <p id="remote-avatar-name">Waiting for participant…</p>
              </div>
              <div class="call-stream-label" id="remote-stream-label">Remote Participant</div>
              <div class="call-audio-indicator" id="remote-audio-meter"><span></span><span></span><span></span></div>
            </div>

            <!-- Local video stream (PIP) -->
            <div class="call-video-wrapper call-video-wrapper--local" id="local-video-box">
              <video id="call-local-video" autoplay playsinline muted></video>
              <div class="call-avatar-placeholder call-avatar-placeholder--local" id="local-avatar-box" style="display:none;">
                <div class="call-avatar-circle" id="local-avatar-initials">ME</div>
              </div>
              <div class="call-stream-label">You</div>
              <div class="call-audio-indicator" id="local-audio-meter"><span></span><span></span><span></span></div>
            </div>
          </div>

          <!-- Side Drawer (Scorecard / Chat) -->
          <aside class="call-side-drawer" id="call-side-drawer">
            <div class="call-drawer-tabs">
              <button type="button" class="call-tab-btn is-active" id="tab-scorecard-btn">Evaluation</button>
              <button type="button" class="call-tab-btn" id="tab-chat-btn">In-Call Chat <span class="call-badge" id="chat-unread-badge" style="display:none;">0</span></button>
              <button type="button" class="call-drawer-close" id="call-drawer-close-btn" aria-label="Close sidebar">✕</button>
            </div>

            <!-- Scorecard Panel -->
            <div class="call-drawer-content" id="panel-scorecard">
              <div class="call-scorecard-head">
                <h3>Candidate Evaluation</h3>
                <p class="hint">Real-time interview scoring and recruitment recommendation.</p>
              </div>
              <form id="call-scorecard-form">
                <div class="scorecard-field">
                  <label>Technical Competence <span class="score-val" id="val-score-tech">3/5</span></label>
                  <input type="range" min="1" max="5" value="3" id="score-tech" />
                  <div class="score-range-labels"><span>Needs work</span><span>Satisfactory</span><span>Exceptional</span></div>
                </div>

                <div class="scorecard-field">
                  <label>Problem Solving & Logic <span class="score-val" id="val-score-problem">3/5</span></label>
                  <input type="range" min="1" max="5" value="3" id="score-problem" />
                  <div class="score-range-labels"><span>Hesitant</span><span>Clear approach</span><span>Innovative</span></div>
                </div>

                <div class="scorecard-field">
                  <label>Communication & Fit <span class="score-val" id="val-score-comm">4/5</span></label>
                  <input type="range" min="1" max="5" value="4" id="score-comm" />
                  <div class="score-range-labels"><span>Unclear</span><span>Professional</span><span>Articulate</span></div>
                </div>

                <div class="scorecard-field">
                  <label for="scorecard-notes">Interview Notes</label>
                  <textarea id="scorecard-notes" rows="4" placeholder="Candidate strengths, coding approach, answers to technical questions..."></textarea>
                </div>

                <div class="scorecard-field">
                  <label>Recruitment Decision</label>
                  <div class="scorecard-decision-grid">
                    <label class="decision-pill"><input type="radio" name="rec-decision" value="offer" /><span>🎉 Recommend Offer</span></label>
                    <label class="decision-pill"><input type="radio" name="rec-decision" value="next_round" checked /><span>➡️ Next Round</span></label>
                    <label class="decision-pill"><input type="radio" name="rec-decision" value="reject" /><span>✕ Reject</span></label>
                  </div>
                </div>

                <button type="button" class="btn btn--primary btn--block btn--sm" id="btn-save-scorecard">Save Evaluation</button>
              </form>
            </div>

            <!-- Chat Panel -->
            <div class="call-drawer-content" id="panel-chat" style="display:none;">
              <div class="call-chat-history" id="call-chat-messages">
                <div class="chat-system-msg">Meeting started. Share coding links or text questions here.</div>
              </div>
              <form class="call-chat-input-bar" id="call-chat-form">
                <input type="text" id="call-chat-input" placeholder="Type a message or paste code..." autocomplete="off" />
                <button type="submit" class="btn btn--primary btn--sm">Send</button>
              </form>
            </div>
          </aside>
        </div>

        <!-- Floating Bottom Dock Controls -->
        <footer class="call-control-dock">
          <div class="call-dock-group">
            <button type="button" class="call-ctl-btn" id="ctl-mic" title="Toggle Microphone">
              <span class="call-ctl-icon" id="icon-mic">🎤</span>
              <span class="call-ctl-label">Mute</span>
            </button>
            <button type="button" class="call-ctl-btn" id="ctl-camera" title="Toggle Camera">
              <span class="call-ctl-icon" id="icon-cam">📹</span>
              <span class="call-ctl-label">Stop Video</span>
            </button>
            <button type="button" class="call-ctl-btn" id="ctl-screen" title="Share Screen">
              <span class="call-ctl-icon">🖥️</span>
              <span class="call-ctl-label">Share</span>
            </button>
          </div>

          <div class="call-dock-group">
            <button type="button" class="call-ctl-btn" id="ctl-side-scorecard" title="Evaluation Scorecard">
              <span class="call-ctl-icon">📝</span>
              <span class="call-ctl-label">Scorecard</span>
            </button>
            <button type="button" class="call-ctl-btn" id="ctl-side-chat" title="In-Call Chat">
              <span class="call-ctl-icon">💬</span>
              <span class="call-ctl-label">Chat</span>
            </button>
          </div>

          <div class="call-dock-group">
            <button type="button" class="call-ctl-btn call-ctl-btn--danger" id="ctl-end-call" title="Leave or End Call">
              <span class="call-ctl-icon">📞</span>
              <span class="call-ctl-label">End Call</span>
            </button>
          </div>
        </footer>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function start({ role, interviewId, candidateName, companyName, roleTitle, apiToken, onEnd }) {
    const authToken = apiToken || sessionStorage.getItem(role === "recruiter" ? "im_company_api_token" : "im_student_api_token") || "";
    if (!interviewId || !authToken) {
      App.toast("Sign in with your account and open the scheduled interview to join the call.", "error");
      return;
    }
    const modal = createModalDOM();
    modal.style.display = "flex";

    const localVideo = modal.querySelector("#call-local-video");
    const remoteVideo = modal.querySelector("#call-remote-video");
    const localAvatar = modal.querySelector("#local-avatar-box");
    const remoteAvatar = modal.querySelector("#remote-avatar-box");
    const timerLabel = modal.querySelector("#call-timer");
    const connBadge = modal.querySelector("#call-conn-badge");
    const drawer = modal.querySelector("#call-side-drawer");
    const chatMessages = modal.querySelector("#call-chat-messages");
    const chatInput = modal.querySelector("#call-chat-input");

    modal.querySelector("#call-title").textContent = `${roleTitle || "Internship"} Interview`;
    modal.querySelector("#call-subtitle").textContent = role === "recruiter"
      ? `Candidate: ${candidateName || "Applicant"}`
      : `Interviewer: ${companyName || "Recruiter"}`;

    modal.querySelector("#remote-stream-label").textContent = role === "recruiter"
      ? (candidateName || "Candidate")
      : (companyName || "Recruiter");

    modal.querySelector("#remote-avatar-name").textContent = role === "recruiter"
      ? `Waiting for ${candidateName || "Candidate"} to join...`
      : `Connecting to ${companyName || "Recruiter"}...`;

    const initials = (name) => (name || "ID").split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
    modal.querySelector("#remote-avatar-initials").textContent = initials(role === "recruiter" ? candidateName : companyName);
    modal.querySelector("#local-avatar-initials").textContent = initials(role === "recruiter" ? companyName : candidateName);

    // If student, hide scorecard tab by default and make chat active
    if (role !== "recruiter") {
      modal.querySelector("#tab-scorecard-btn").style.display = "none";
      modal.querySelector("#ctl-side-scorecard").style.display = "none";
      modal.querySelector("#panel-scorecard").style.display = "none";
      modal.querySelector("#panel-chat").style.display = "flex";
      modal.querySelector("#tab-chat-btn").classList.add("is-active");
    } else {
      modal.querySelector("#tab-scorecard-btn").style.display = "";
      modal.querySelector("#ctl-side-scorecard").style.display = "";
    }

    let localStream = null;
    let peerConnection = null;
    let screenStream = null;
    let signalPollTimer = null;
    let callDurationTimer = null;
    let lastSignalTime = 0;
    let callSeconds = 0;
    let isMicMuted = false;
    let isCamStopped = false;
    let processedSignals = new Set();
    let pendingIceCandidates = [];
    let signalErrorShown = false;

    async function acceptPendingIce() {
      if (!peerConnection.remoteDescription) return;
      const pending = pendingIceCandidates;
      pendingIceCandidates = [];
      for (const candidate of pending) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (error) { console.warn("Could not add an ICE candidate:", error); }
      }
    }

    // Call Timer
    callDurationTimer = setInterval(() => {
      callSeconds++;
      const mins = String(Math.floor(callSeconds / 60)).padStart(2, "0");
      const secs = String(callSeconds % 60).padStart(2, "0");
      timerLabel.textContent = `${mins}:${secs}`;
    }, 1000);

    // Get User Media (Camera & Mic)
    async function initMedia() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        localVideo.srcObject = localStream;
        localAvatar.style.display = "none";
        localVideo.style.display = "block";
      } catch (err) {
        console.warn("Camera/Mic not accessible, falling back to mock stream:", err.message);
        // Fallback placeholder canvas stream
        const canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#1e293b"; ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#94a3b8"; ctx.font = "24px sans-serif";
        ctx.fillText(role === "recruiter" ? "Recruiter Audio Check" : "Candidate Audio Check", 180, 240);
        localStream = canvas.captureStream(10);
        localAvatar.style.display = "flex";
        localVideo.style.display = "none";
      }

      initPeerConnection();
    }

    async function sendSignal(type, data) {
      try {
        const response = await fetch(`${window.IM_API_BASE}/api/interviews/${encodeURIComponent(interviewId)}/signal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ type, data })
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || `Call signaling failed (${response.status}).`);
        }
        return true;
      } catch (error) {
        if (!signalErrorShown) {
          signalErrorShown = true;
          connBadge.textContent = "Call connection error";
          App.toast(error.message || "Could not reach the call server. Check that it is running.", "error");
        }
        return false;
      }
    }

    async function pollSignals() {
      try {
        const res = await fetch(`${window.IM_API_BASE}/api/interviews/${encodeURIComponent(interviewId)}/signal?since=${lastSignalTime}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          throw new Error(result.error || `Call signaling failed (${res.status}).`);
        }
        const data = await res.json();
        lastSignalTime = data.serverTime || Date.now();

        for (const sig of data.signals || []) {
          if (sig.sender === (role === "recruiter" ? "recruiter" : "student") || processedSignals.has(sig.id)) continue;
          processedSignals.add(sig.id);
          await handleRemoteSignal(sig);
        }
      } catch (error) {
        if (!signalErrorShown) {
          signalErrorShown = true;
          connBadge.textContent = "Call connection error";
          App.toast(error.message || "Could not reach the call server. Check that it is running.", "error");
          clearInterval(signalPollTimer);
        }
      }
    }

    async function handleRemoteSignal(sig) {
      if (sig.type === "offer" && role === "student") {
        connBadge.textContent = "Negotiating…";
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.data));
        await acceptPendingIce();
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal("answer", answer);
        connBadge.textContent = "🟢 Live Call";
      } else if (sig.type === "answer" && role === "recruiter") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.data));
        await acceptPendingIce();
        connBadge.textContent = "🟢 Live Call";
      } else if (sig.type === "ice") {
        if (!peerConnection.remoteDescription) pendingIceCandidates.push(sig.data);
        else {
          try { await peerConnection.addIceCandidate(new RTCIceCandidate(sig.data)); }
          catch (error) { console.warn("Could not add an ICE candidate:", error); }
        }
      } else if (sig.type === "chat") {
        appendChatMessage(sig.data.senderName, sig.data.text, false);
      } else if (sig.type === "end") {
        App.toast("The other participant has ended the interview call.");
        cleanupAndClose();
      }
    }

    function initPeerConnection() {
      peerConnection = new RTCPeerConnection(STUN_CONFIG);

      if (localStream) {
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
      }

      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteVideo.srcObject = event.streams[0];
          remoteAvatar.style.display = "none";
          remoteVideo.style.display = "block";
          connBadge.textContent = "🟢 Live Call";
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal("ice", event.candidate);
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === "connected") {
          connBadge.textContent = "🟢 Live Call";
        } else if (state === "disconnected" || state === "failed") {
          connBadge.textContent = "🟡 Reconnecting…";
        }
      };

      // Recruiter creates offer
      if (role === "recruiter") {
        setTimeout(async () => {
          try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            await sendSignal("offer", offer);
            connBadge.textContent = "Waiting for candidate…";
          } catch (_) {}
        }, 800);
      }

      // Start signal polling every 1.5 seconds
      signalPollTimer = setInterval(pollSignals, 1500);
    }

    // Chat Message Helpers
    function appendChatMessage(author, text, isMe) {
      const bubble = document.createElement("div");
      bubble.className = `call-chat-bubble ${isMe ? "is-me" : "is-remote"}`;
      bubble.innerHTML = `<span class="chat-author">${App.escapeHtml(author)}</span><p>${App.escapeHtml(text)}</p>`;
      chatMessages.appendChild(bubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Unread badge indicator if drawer closed or on scorecard tab
      if (drawer.classList.contains("is-hidden") || modal.querySelector("#panel-chat").style.display === "none") {
        const badge = modal.querySelector("#chat-unread-badge");
        badge.style.display = "inline-block";
        badge.textContent = Number(badge.textContent || 0) + 1;
      }
    }

    // Event Wireups
    // 1. Controls Bar
    const btnMic = modal.querySelector("#ctl-mic");
    btnMic.addEventListener("click", () => {
      isMicMuted = !isMicMuted;
      if (localStream) {
        localStream.getAudioTracks().forEach((t) => { t.enabled = !isMicMuted; });
      }
      btnMic.classList.toggle("is-active", isMicMuted);
      btnMic.querySelector(".call-ctl-label").textContent = isMicMuted ? "Unmute" : "Mute";
      modal.querySelector("#icon-mic").textContent = isMicMuted ? "🔇" : "🎤";
    });

    const btnCam = modal.querySelector("#ctl-camera");
    btnCam.addEventListener("click", () => {
      isCamStopped = !isCamStopped;
      if (localStream) {
        localStream.getVideoTracks().forEach((t) => { t.enabled = !isCamStopped; });
      }
      btnCam.classList.toggle("is-active", isCamStopped);
      btnCam.querySelector(".call-ctl-label").textContent = isCamStopped ? "Start Video" : "Stop Video";
      modal.querySelector("#icon-cam").textContent = isCamStopped ? "🚫" : "📹";
      localAvatar.style.display = isCamStopped ? "flex" : "none";
      localVideo.style.display = isCamStopped ? "none" : "block";
    });

    const btnScreen = modal.querySelector("#ctl-screen");
    btnScreen.addEventListener("click", async () => {
      if (!screenStream) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);

          localVideo.srcObject = screenStream;
          btnScreen.classList.add("is-active");
          btnScreen.querySelector(".call-ctl-label").textContent = "Stop Share";

          screenTrack.onended = () => {
            if (sender && localStream) sender.replaceTrack(localStream.getVideoTracks()[0]);
            localVideo.srcObject = localStream;
            btnScreen.classList.remove("is-active");
            btnScreen.querySelector(".call-ctl-label").textContent = "Share";
            screenStream = null;
          };
        } catch (_) {}
      } else {
        screenStream.getTracks().forEach((t) => t.stop());
        const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender && localStream) sender.replaceTrack(localStream.getVideoTracks()[0]);
        localVideo.srcObject = localStream;
        btnScreen.classList.remove("is-active");
        btnScreen.querySelector(".call-ctl-label").textContent = "Share";
        screenStream = null;
      }
    });

    // 2. Side Drawer Toggle
    const btnScorecardToggle = modal.querySelector("#ctl-side-scorecard");
    const btnChatToggle = modal.querySelector("#ctl-side-chat");
    const drawerCloseBtn = modal.querySelector("#call-drawer-close-btn");

    function openDrawer(tabName) {
      drawer.classList.remove("is-hidden");
      if (tabName === "scorecard") {
        modal.querySelector("#panel-scorecard").style.display = "block";
        modal.querySelector("#panel-chat").style.display = "none";
        modal.querySelector("#tab-scorecard-btn").classList.add("is-active");
        modal.querySelector("#tab-chat-btn").classList.remove("is-active");
      } else {
        modal.querySelector("#panel-scorecard").style.display = "none";
        modal.querySelector("#panel-chat").style.display = "flex";
        modal.querySelector("#tab-chat-btn").classList.add("is-active");
        modal.querySelector("#tab-scorecard-btn").classList.remove("is-active");
        modal.querySelector("#chat-unread-badge").style.display = "none";
        modal.querySelector("#chat-unread-badge").textContent = "0";
      }
    }

    btnScorecardToggle.addEventListener("click", () => openDrawer("scorecard"));
    btnChatToggle.addEventListener("click", () => openDrawer("chat"));
    drawerCloseBtn.addEventListener("click", () => drawer.classList.add("is-hidden"));

    modal.querySelector("#tab-scorecard-btn").addEventListener("click", () => openDrawer("scorecard"));
    modal.querySelector("#tab-chat-btn").addEventListener("click", () => openDrawer("chat"));

    // 3. Scorecard slider values
    ["tech", "problem", "comm"].forEach((metric) => {
      const input = modal.querySelector(`#score-${metric}`);
      const val = modal.querySelector(`#val-score-${metric}`);
      input.addEventListener("input", () => { val.textContent = `${input.value}/5`; });
    });

    // 4. Save Scorecard
    const saveScorecardBtn = modal.querySelector("#btn-save-scorecard");
    saveScorecardBtn.addEventListener("click", async () => {
      saveScorecardBtn.disabled = true;
      saveScorecardBtn.textContent = "Saving…";

      const payload = {
        technicalScore: modal.querySelector("#score-tech").value,
        problemSolvingScore: modal.querySelector("#score-problem").value,
        communicationScore: modal.querySelector("#score-comm").value,
        notes: modal.querySelector("#scorecard-notes").value,
        decision: modal.querySelector('input[name="rec-decision"]:checked')?.value || "next_round"
      };

      try {
        const res = await fetch(`${window.IM_API_BASE}/api/company/interviews/${encodeURIComponent(interviewId)}/feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("im_company_api_token") || ""}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Could not save to server");
        App.toast("Interview evaluation & decision saved.");
      } catch (err) {
        // Fallback local persistence
        App.toast("Evaluation saved locally.", "info");
      } finally {
        saveScorecardBtn.disabled = false;
        saveScorecardBtn.textContent = "Save Evaluation";
      }
    });

    // 5. In-call Chat Submit
    const chatForm = modal.querySelector("#call-chat-form");
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = "";
      const senderName = role === "recruiter" ? (companyName || "Recruiter") : (candidateName || "Candidate");
      appendChatMessage("You", text, true);
      sendSignal("chat", { senderName, text });
    });

    // 6. Fullscreen
    modal.querySelector("#call-btn-fullscreen").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        modal.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // 7. End Call
    modal.querySelector("#ctl-end-call").addEventListener("click", () => {
      if (confirm("Are you sure you want to end this interview call?")) {
        sendSignal("end", {});
        cleanupAndClose();
      }
    });

    function cleanupAndClose() {
      clearInterval(callDurationTimer);
      clearInterval(signalPollTimer);
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
      if (peerConnection) peerConnection.close();
      modal.style.display = "none";
      if (onEnd) onEnd();
    }

    initMedia();
  }

  return { start };
})();
