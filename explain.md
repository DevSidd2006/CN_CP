# Technical Explanation: How it Works

This project implements a decentralized communication system where the heavy lifting (video/audio encoding and transmission) happens directly between browsers, while a central server coordinates the "introduction".

## 1. The Signaling Server (`server.py`)
WebRTC is peer-to-peer, but peers don't know how to find each other initially. The **Signaling Server** acts as the matchmaker.

### Key Roles:
- **ID Assignment**: Assigns a unique ID (e.g., `P1`, `P2`) to each connection.
- **Peer Discovery**: Tells new users who is already in the room.
- **Relay Messages**: Forwards `offer`, `answer`, and `ice-candidate` messages between specific peers.

**The server never sees the video or audio data.** It only handles small JSON control messages.

---

## 2. The WebRTC Handshake
The connection process follows a strict "Offer/Answer" protocol:

1.  **Offer**: Peer A creates an "Offer" (an SDP object describing its media capabilities) and sends it to the server.
2.  **Relay**: The server forwards the Offer to Peer B.
3.  **Answer**: Peer B receives the Offer, sets it as its "Remote Description", creates an "Answer", and sends it back.
4.  **ICE Candidates**: Throughout this process, both peers generate "ICE Candidates" (possible network paths) and exchange them. This helps find the best route through routers/firewalls.

---

## 3. Media & Data Handling (`app.js`)

### Media Streams
- `navigator.mediaDevices.getUserMedia` is used to capture the local camera and microphone.
- The `RTCPeerConnection.addTrack()` method attaches these streams to the P2P connection.

### Data Channels
- Instead of using WebSockets for chat (which goes through the server), this app uses `RTCDataChannel`.
- This enables **zero-latency chat** because messages go directly from one browser to another.

### Volume Meter
- Uses the **Web Audio API**. 
- An `AnalyserNode` processes the microphone frequency data in real-time.
- The `requestAnimationFrame` loop updates the CSS width of the volume bar based on the average signal intensity.

---

## 4. UI Architecture
The UI is built with **Vanilla JavaScript** and **Semantic HTML5**. 
- **DOM Manipulation**: To comply with modern security policies (Trusted Types), the app avoids `innerHTML`. Instead, it uses `document.createElement` and `textContent`.
- **Dynamic Grid**: When a new track is received from a peer, a `<video>` element is created and injected into the grid.

## 5. Network Requirements
Since this is a LAN application, it relies on peers being able to reach each other's local IP addresses. In a real-world (internet) scenario, a **STUN/TURN** server would be required to bypass complex NATs.
