(() => {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const apiBase = (window.IM_API_BASE || (local ? "http://127.0.0.1:3003" : "https://internmatch-server-bj4z-7b0rtm9hx-team-7-baf1.vercel.app")).replace(/\/+$/, "");
  const tokenKey = "im_assessment_observer_token";
  const title = document.getElementById("observer-title");
  const description = document.getElementById("observer-description");
  const identity = document.getElementById("observer-identity");
  const students = document.getElementById("observer-students");
  let token = sessionStorage.getItem(tokenKey) || "";
  let currentDialog = null;
  const api = async (route, options = {}) => {
    const response = await fetch(`${apiBase}/api${route}`, { ...options, cache: "no-store", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status}).`); error.status = response.status; throw error; }
    return data;
  };
  const message = (text) => { title.textContent = text; students.replaceChildren(); };
  async function viewCamera(student) {
    if (currentDialog) return;
    const dialog = document.createElement("dialog"); dialog.className = "assessment-live-dialog";
    dialog.innerHTML = `<div class="assessment-live-dialog__head"><div><span class="company-eyebrow">LIVE ASSESSMENT</span><h2></h2><p>Consented live video · not recorded</p></div><button type="button" class="btn btn--ghost btn--sm" data-close>Close live view</button></div><video autoplay playsinline></video><p class="assessment-live-dialog__status" role="status">Connecting to the student’s camera…</p>`;
    dialog.querySelector("h2").textContent = `${student.studentName} · camera view`;
    document.body.append(dialog); dialog.showModal(); currentDialog = dialog;
    const video = dialog.querySelector("video"); const status = dialog.querySelector(".assessment-live-dialog__status");
    let viewerId = "", timer = 0, closed = false, cursor = 0, remoteReady = false, connection;
    const pendingIce = [];
    const route = (suffix = "") => `/assessment-observer/live/${encodeURIComponent(student.studentId)}${suffix}`;
    const close = async () => {
      if (closed) return; closed = true; clearInterval(timer); connection?.close();
      if (viewerId) await api(route(`/${encodeURIComponent(viewerId)}/signals`), { method: "POST", body: JSON.stringify({ type: "end" }) }).catch(() => {});
      dialog.close(); dialog.remove(); currentDialog = null;
    };
    dialog.querySelector("[data-close]").addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    try {
      const joined = await api(route("/join"), { method: "POST", body: "{}" }); viewerId = joined.viewerId;
      const signalsRoute = route(`/${encodeURIComponent(viewerId)}/signals`);
      connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      connection.ontrack = (event) => { video.srcObject = event.streams[0]; status.textContent = "Live camera view · this video is not recorded."; };
      connection.onconnectionstatechange = () => { if (connection.connectionState === "failed") status.textContent = "Could not connect on this network. The student’s assessment continues."; };
      const send = (type, data) => api(signalsRoute, { method: "POST", body: JSON.stringify({ type, data }) });
      connection.onicecandidate = (event) => { if (event.candidate) send("ice", event.candidate.toJSON()).catch(() => {}); };
      const poll = async () => {
        if (closed) return;
        try {
          const data = await api(`${signalsRoute}?after=${cursor}`); cursor = data.cursor || cursor;
          for (const signal of data.signals || []) {
            if (signal.type === "offer" && !remoteReady) {
              await connection.setRemoteDescription(signal.data); remoteReady = true;
              for (const candidate of pendingIce.splice(0)) await connection.addIceCandidate(candidate).catch(() => {});
              const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); await send("answer", connection.localDescription.toJSON());
            } else if (signal.type === "ice") {
              if (remoteReady) await connection.addIceCandidate(signal.data).catch(() => {}); else pendingIce.push(signal.data);
            }
          }
        } catch (error) { status.textContent = error.message || "The live view has ended."; if ([401, 403, 404].includes(error.status)) close(); }
      };
      await poll(); timer = setInterval(poll, 900);
    } catch (error) { status.textContent = error.message || "Could not connect to the camera."; setTimeout(close, 2500); }
  }
  async function refresh() {
    const data = await api("/assessment-observer/assessment");
    title.textContent = data.assessment.title;
    description.textContent = `${data.companyName} · Verified observer for this assessment`;
    identity.textContent = data.observerEmail;
    students.replaceChildren();
    if (!data.students.length) {
      const empty = document.createElement("p"); empty.className = "company-muted"; empty.textContent = "No student has an active, consented camera view right now."; students.append(empty); return;
    }
    for (const student of data.students) {
      const row = document.createElement("article"); row.className = "observer-student-row";
      const details = document.createElement("div"); const name = document.createElement("strong"); name.textContent = student.studentName; const started = document.createElement("small"); started.textContent = `Assessment started ${new Date(student.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; details.append(name, started);
      const button = document.createElement("button"); button.type = "button"; button.className = "btn btn--primary btn--sm"; button.textContent = "View live camera"; button.addEventListener("click", () => viewCamera(student));
      row.append(details, button); students.append(row);
    }
  }
  (async () => {
    const params = new URLSearchParams(location.search); const invitationToken = params.get("token");
    if (invitationToken) {
      history.replaceState(null, "", location.pathname);
      token = "";
      try {
        const result = await api("/auth/assessment-observer/redeem", { method: "POST", body: JSON.stringify({ token: invitationToken }) });
        token = result.token; sessionStorage.setItem(tokenKey, token);
      } catch (error) { identity.textContent = "Invitation not verified"; message(error.message || "This invitation is invalid or expired."); return; }
    }
    if (!token) { identity.textContent = "Invitation required"; message("Open the one-time teacher invitation from your email."); description.textContent = "Ask the company to send you a new invitation if the link has expired or was already used."; return; }
    try { await refresh(); setInterval(() => refresh().catch((error) => { if ([401, 403].includes(error.status)) { sessionStorage.removeItem(tokenKey); token = ""; message("Observer access has ended"); description.textContent = error.message; } }), 5000); }
    catch (error) { identity.textContent = "Access unavailable"; message(error.message || "Could not load the assessment observer view."); }
  })();
})();
