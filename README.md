# 🌐 WebRTC LAN Meet - P2P Video & Chat

A premium, real-time video conferencing application designed for Local Area Networks (LAN). Built with Python (aiohttp) for signaling and Vanilla JavaScript for the frontend.

## 🚀 Features
- **Peer-to-Peer Video & Audio**: Direct high-quality transmission between devices on the same network.
- **Low Latency Chat**: Real-time messaging powered by WebRTC DataChannels.
- **Dynamic Grid**: Automatically adjusts as participants join or leave.
- **Volume Meter**: Real-time visual feedback of your microphone activity.
- **Premium UI**: Modern dark-mode interface with a focus on user experience.
- **HTTPS/WSS Support**: Secure communication for browser compatibility with camera/mic.

## 📋 Requirements
- Python 3.10+
- `aiohttp` library
- `cryptography` library (for SSL certificate generation)

## 🛠️ Setup

1. **Install Dependencies**:
   ```bash
   cd server
   pip install -r requirements.txt
   pip install cryptography
   ```

2. **Generate SSL Certificates**:
   WebRTC requires a secure context (HTTPS) to access the camera/microphone.
   ```bash
   python3 generate_cert.py
   ```

3. **Start the Server**:
   ```bash
   python3 server.py
   ```

## 🌐 Usage

### Local Machine
Visit: [https://localhost:3000](https://localhost:3000)

### Other Devices on LAN
1. Find your local IP (e.g., `hostname -I`).
2. Visit: `https://<YOUR_IP>:3000` (e.g., `https://192.168.1.8:3000`).
3. **Note**: Since the certificate is self-signed, you must click **Advanced** -> **Proceed** in your browser.

## 🏗️ Project Structure
- `server/`: Signaling server logic and SSL management.
- `client/`: Frontend assets (HTML, CSS, JS).
- `client/app.js`: Core WebRTC and signaling client logic.
- `client/style.css`: Modern UI design system.
