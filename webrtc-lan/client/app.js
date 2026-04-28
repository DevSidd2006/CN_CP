"use strict";

const elements = {
  statusBadge: document.getElementById("statusBadge"),
  statusText: document.getElementById("statusText"),
  myId: document.getElementById("myId"),
  participantCount: document.getElementById("participantCount"),
  callCount: document.getElementById("callCount"),
  participantsGrid: document.getElementById("participantsGrid"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  screenMuteBtn: document.getElementById("screenMuteBtn"),
  screenCameraBtn: document.getElementById("screenCameraBtn"),
  volumeBar: document.getElementById("volumeBar"),
  audioElements: document.getElementById("audioElements")
};

let myId = null;
let localStream = null;
let ws = null;
const peerConns = new Map();
const dataChannels = new Map();
const participantCards = new Map();

// --- Media Logic ---

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    elements.screenMuteBtn.disabled = false;
    elements.screenCameraBtn.disabled = false;
    
    updateLocalVideo();
    initVolumeMeter(localStream);
  } catch (err) {
    console.warn("[media] Denied or failed:", err);
    // Try audio only as fallback
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      elements.screenMuteBtn.disabled = false;
      initVolumeMeter(localStream);
    } catch (e) {
      console.error("[media] Total failure:", e);
    }
  }
}

function updateLocalVideo() {
  if (!myId || !localStream) return;
  const card = ensureParticipantCard(myId, true);
  const video = card.querySelector("video");
  if (video && video.srcObject !== localStream) {
    video.srcObject = localStream;
  }

  // Add tracks to any existing peer connections that don't have them
  for (const pc of peerConns.values()) {
    const senders = pc.getSenders();
    if (senders.length === 0) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      // Re-negotiate if needed? Yes.
    }
  }
}

function initVolumeMeter(stream) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      elements.volumeBar.style.width = Math.min(100, avg * 2) + "%";
      requestAnimationFrame(update);
    };
    update();
  } catch (e) {
    console.warn("[audio] Context error:", e);
  }
}

function toggleMute() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    elements.screenMuteBtn.querySelector(".control-btn__text").textContent = audioTrack.enabled ? "Mute" : "Unmute";
  }
}

function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    elements.screenCameraBtn.querySelector(".control-btn__text").textContent = videoTrack.enabled ? "Stop Camera" : "Start Camera";
    // In a real app, you might want to stop/start the track to save bandwidth
  }
}

elements.screenMuteBtn.onclick = toggleMute;
elements.screenCameraBtn.onclick = toggleCamera;

// --- Signaling Logic ---

function connectSignaling() {
  const host = window.location.hostname;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${host}:3000/ws`;

  console.log("[ws] Connecting to:", url);
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("[ws] Connected!");
    setStatus(true);
  };
  
  ws.onclose = () => {
    console.log("[ws] Disconnected!");
    setStatus(false);
    setTimeout(connectSignaling, 3000);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleSignal(msg);
    } catch (err) {
      console.error("[ws] JSON parse error:", err);
    }
  };
}

function setStatus(connected) {
  elements.statusBadge.className = `badge badge--${connected ? "connected" : "disconnected"}`;
  elements.statusText.textContent = connected ? "Connected" : "Disconnected";
}

function handleSignal(msg) {
  const { type, id, peers, from, sdp, candidate } = msg;
  switch (type) {
    case "welcome":
      myId = id;
      elements.myId.textContent = `Your ID: ${myId}`;
      updateLocalVideo();
      peers.forEach(pid => {
        ensureParticipantCard(pid, false);
        if (peerNumber(myId) < peerNumber(pid)) startCall(pid);
      });
      break;
    case "peer-joined":
      ensureParticipantCard(id, false);
      if (peerNumber(myId) < peerNumber(id)) startCall(id);
      break;
    case "peer-left":
      removeParticipant(id);
      break;
    case "offer":
      handleOffer(from, sdp);
      break;
    case "answer":
      handleAnswer(from, sdp);
      break;
    case "ice-candidate":
      handleIceCandidate(from, candidate);
      break;
  }
}

function peerNumber(pid) {
  return parseInt(pid.replace("P", "")) || 0;
}

// --- WebRTC Logic ---

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

async function startCall(pid) {
  console.log("[webrtc] Starting call to", pid);
  const pc = createPC(pid);
  const dc = pc.createDataChannel("chat");
  setupDC(dc, pid);
  
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", to: pid, sdp: pc.localDescription }));
}

async function handleOffer(from, sdp) {
  console.log("[webrtc] Handling offer from", from);
  const pc = createPC(from);
  pc.ondatachannel = e => setupDC(e.channel, from);
  
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", to: from, sdp: pc.localDescription }));
}

async function handleAnswer(from, sdp) {
  const pc = peerConns.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleIceCandidate(from, candidate) {
  const pc = peerConns.get(from);
  if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {});
}

function createPC(pid) {
  if (peerConns.has(pid)) return peerConns.get(pid);
  
  const pc = new RTCPeerConnection(RTC_CONFIG);
  peerConns.set(pid, pc);
  updateCallCount();

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({ type: "ice-candidate", to: pid, candidate: e.candidate }));
  };

  pc.ontrack = e => {
    const card = participantCards.get(pid);
    if (card) {
      const video = card.querySelector("video");
      if (video) video.srcObject = e.streams[0];
    }
    
    // Handle audio deduplication
    const audioTrack = e.streams[0].getAudioTracks()[0];
    if (audioTrack) {
      const existing = elements.audioElements.querySelector(`audio[data-peer="${pid}"]`);
      if (!existing) {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.srcObject = e.streams[0];
        audio.dataset.peer = pid;
        elements.audioElements.appendChild(audio);
      }
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`[webrtc] PC with ${pid} state: ${pc.connectionState}`);
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      // Logic for cleanup if needed
    }
  };

  return pc;
}

function setupDC(dc, pid) {
  dataChannels.set(pid, dc);
  dc.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      appendMsg(pid, data.text, "remote");
    } catch(err) {}
  };
}

// --- UI Helpers ---

function ensureParticipantCard(pid, isSelf) {
  if (participantCards.has(pid)) return participantCards.get(pid);

  const card = document.createElement("div");
  card.className = `participant-card ${isSelf ? "participant-card--self" : ""}`;
  
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  if (isSelf) {
    video.muted = true;
    if (localStream) video.srcObject = localStream;
  }
  card.appendChild(video);

  const name = document.createElement("div");
  name.className = "participant-name";
  name.textContent = isSelf ? `${pid} (You)` : pid;
  card.appendChild(name);

  elements.participantsGrid.appendChild(card);
  participantCards.set(pid, card);
  updateCounts();
  return card;
}

function removeParticipant(pid) {
  const card = participantCards.get(pid);
  if (card) card.remove();
  participantCards.delete(pid);
  
  const pc = peerConns.get(pid);
  if (pc) pc.close();
  peerConns.delete(pid);
  
  dataChannels.delete(pid);
  
  const audio = elements.audioElements.querySelector(`audio[data-peer="${pid}"]`);
  if (audio) audio.remove();
  
  updateCounts();
}

function updateCounts() {
  elements.participantCount.textContent = participantCards.size;
  updateCallCount();
}

function updateCallCount() {
  elements.callCount.textContent = peerConns.size;
}

function appendMsg(sender, text, type) {
  const div = document.createElement("div");
  div.className = `msg msg--${type}`;
  
  const meta = document.createElement("div");
  meta.className = "msg--system"; // repurposed for internal meta style
  meta.style.fontSize = "0.7rem";
  meta.textContent = `${sender} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  div.appendChild(meta);
  
  const content = document.createElement("div");
  content.textContent = text;
  div.appendChild(content);

  elements.chatMessages.appendChild(div);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  document.getElementById("emptyChatState").style.display = "none";
}

// --- Initialization ---

elements.sendBtn.onclick = () => {
  const text = elements.chatInput.value.trim();
  if (!text) return;
  dataChannels.forEach(dc => {
    if (dc.readyState === "open") dc.send(JSON.stringify({ text }));
  });
  appendMsg("You", text, "self");
  elements.chatInput.value = "";
};

elements.chatInput.onkeydown = e => { if (e.key === "Enter") elements.sendBtn.click(); };

(async () => {
  console.log("[app] Init...");
  initMedia().catch(e => console.error(e));
  connectSignaling();
})();
