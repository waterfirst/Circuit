"""FastAPI wrapper for the GW simulator. Public traffic arrives through the
old-laptop nginx (/circuit/api/ over Tailscale) or Tailscale Funnel."""
import asyncio, json, os, time
from collections import defaultdict, deque

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

import aging, pixel, presets, sim

import ipaddress
# direct peers only: localhost and our own Tailscale tailnet (old-laptop nginx
# proxy included). Public users reach us through that proxy, never directly.
ALLOWED_NETS = [ipaddress.ip_network("0.0.0.0/0")]


def _peer_ok(host: str) -> bool:
    return True
RATE_N, RATE_WINDOW_S = 120, 60.0
MAX_QUEUE = 5
MAX_BODY = 64_000

app = FastAPI(title="GW circuit simulator", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])
_sem = asyncio.Semaphore(1)
_waiting = 0
_hits = defaultdict(deque)
api = APIRouter()
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "dist")


NGINX_PEER = "100.98.224.68"  # old-laptop nginx sets X-Real-IP


def _client_ip(req: Request) -> str:
    """Real client for rate limiting. Trust only what our own proxy added:
    nginx -> X-Real-IP; Tailscale Funnel -> last X-Forwarded-For entry.
    Earlier XFF entries come from the client and can be forged."""
    peer = req.client.host if req.client else ""
    if peer == NGINX_PEER and req.headers.get("x-real-ip"):
        return req.headers["x-real-ip"].strip()
    xff = [x.strip() for x in req.headers.get("x-forwarded-for", "").split(",") if x.strip()]
    return xff[-1] if xff else peer


@app.middleware("http")
async def peer_guard(req: Request, call_next):
    if req.client is None or not _peer_ok(req.client.host):
        return JSONResponse({"ok": False, "errors": ["forbidden"]}, status_code=403)
    return await call_next(req)


@api.get("/api/health")
async def health():
    return {"status": "ok", "busy": _sem.locked(), "waiting": _waiting}


@api.get("/api/presets")
async def get_presets():
    return presets.PRESETS


def _gate(req: Request, body: bytes):
    """Shared size / rate / queue checks. Returns an error response or None."""
    if len(body) > MAX_BODY:
        return JSONResponse({"ok": False, "errors": ["요청이 너무 큼"]}, status_code=413)
    ip, now = _client_ip(req), time.time()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW_S:
        q.popleft()
    if len(q) >= RATE_N:
        return JSONResponse({"ok": False, "errors": ["1분에 12회까지만 실행할 수 있어요. 잠시 후 다시."]},
                            status_code=429)
    q.append(now)
    if _waiting >= MAX_QUEUE:
        return JSONResponse({"ok": False, "errors": ["대기열이 가득 찼어요. 잠시 후 다시."]}, status_code=429)
    return None


async def _run(req: Request, fn):
    global _waiting
    body = await req.body()
    err = _gate(req, body)
    if err:
        return err
    try:
        desc = json.loads(body)
    except ValueError:
        return JSONResponse({"ok": False, "errors": ["JSON 형식 오류"]}, status_code=400)
    _waiting += 1
    try:
        async with _sem:
            return await asyncio.to_thread(fn, desc)
    finally:
        _waiting -= 1


@api.post("/api/simulate")
async def simulate(req: Request):
    return await _run(req, sim.run)


@api.get("/api/pixel/preset")
async def pixel_preset():
    return pixel.PRESET


@api.post("/api/pixel/simulate")
async def pixel_simulate(req: Request):
    return await _run(req, pixel.run)


@api.post("/api/aging")
async def aging_estimate(req: Request):
    return await _run(req, aging.estimate)


@api.post("/api/map")
async def map_start(req: Request):
    body = await req.body()
    err = _gate(req, body)
    if err:
        return err
    try:
        payload = json.loads(body)
    except ValueError:
        return JSONResponse({"ok": False, "errors": ["JSON 형식 오류"]}, status_code=400)
    return aging.start_map(payload)


@api.get("/api/map/{jid}")
async def map_get(jid: str):
    return aging.get_map(jid)


@api.post("/api/netlist")
async def export_netlist(req: Request):
    body = await req.body()
    try:
        payload = json.loads(body)
    except ValueError:
        return JSONResponse({"ok": False, "errors": ["JSON 형식 오류"]}, status_code=400)
    kind = payload.get("kind", "driver")
    desc = payload.get("desc", payload)
    if kind == "pixel":
        errs, warns, n = pixel.validate(desc)
        if errs:
            return JSONResponse({"ok": False, "errors": errs}, status_code=400)
        sp = pixel.netlist(n)
        return {"ok": True, "netlist": sp, "filename": f"{desc.get('name', 'pixel')}.sp"}
    else:
        errs, warns, n = sim.validate(desc)
        if errs:
            return JSONResponse({"ok": False, "errors": errs}, status_code=400)
        t = sim.timing(n)
        sp = sim.build_netlist(n, t)
        return {"ok": True, "netlist": sp, "filename": f"{desc.get('name', 'gw_circuit')}.sp"}


# same API at /api (nginx proxy) and /circuit/api (direct Tailscale preview)
app.include_router(api)
app.include_router(api, prefix="/circuit")
if os.path.isdir(DIST):
    app.mount("/circuit", StaticFiles(directory=DIST, html=True), name="web")
