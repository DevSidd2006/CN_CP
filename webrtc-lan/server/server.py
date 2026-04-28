#!/usr/bin/env python3
import asyncio
import json
import logging
import mimetypes
import os
import ssl
from pathlib import Path
from aiohttp import web

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")
log = logging.getLogger(__name__)

# Constants
PORT = 3000
CLIENT_DIR = Path(__file__).resolve().parent.parent / "client"

# Peer state
clients = {} # peerId -> WebSocketResponse
_next_id = 1

def _new_id():
    global _next_id
    pid = f"P{_next_id}"
    _next_id += 1
    return pid

async def _send(ws, obj):
    if not ws.closed:
        await ws.send_str(json.dumps(obj))

async def _broadcast(obj, exclude_id=None):
    for pid, ws in clients.items():
        if pid != exclude_id:
            await _send(ws, obj)

async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    peer_id = _new_id()
    clients[peer_id] = ws
    log.info(f"CONNECT {peer_id} (total: {len(clients)})")

    # Welcome
    existing = [pid for pid in clients if pid != peer_id]
    await _send(ws, {"type": "welcome", "id": peer_id, "peers": existing})
    await _broadcast({"type": "peer-joined", "id": peer_id}, exclude_id=peer_id)

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                mtype = data.get("type")
                to = data.get("to")
                
                if mtype in ("offer", "answer", "ice-candidate"):
                    target_ws = clients.get(to)
                    if target_ws:
                        await _send(target_ws, {**data, "from": peer_id})
    finally:
        clients.pop(peer_id, None)
        log.info(f"DISCONNECT {peer_id} (total: {len(clients)})")
        await _broadcast({"type": "peer-left", "id": peer_id})
    return ws

async def static_handler(request):
    rel = request.match_info.get("path", "") or "index.html"
    file_path = (CLIENT_DIR / rel).resolve()
    
    if not str(file_path).startswith(str(CLIENT_DIR)) or not file_path.is_file():
        return web.Response(status=404)

    content_type, _ = mimetypes.guess_type(str(file_path))
    return web.Response(body=file_path.read_bytes(), content_type=content_type or "application/octet-stream")

def build_app():
    app = web.Application()
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/", static_handler)
    app.router.add_get("/{path:.+}", static_handler)
    return app

def get_ssl():
    cert = Path(__file__).parent / "cert.pem"
    key = Path(__file__).parent / "key.pem"
    if cert.exists() and key.exists():
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        return ctx
    return None

if __name__ == "__main__":
    ssl_ctx = get_ssl()
    log.info(f"Starting server on port {PORT} (SSL: {ssl_ctx is not None})")
    web.run_app(build_app(), host="0.0.0.0", port=PORT, ssl_context=ssl_ctx)
