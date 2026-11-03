import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import { getSpiceStatus, runSpiceNetlist, SPICE_PRESETS } from './server/spiceEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const PYTHON_PORT = 8767;
const PYTHON_BASE = `http://127.0.0.1:${PYTHON_PORT}`;

let pyProcess: ChildProcess | null = null;

function startPythonBackend() {
  const serverDir = path.join(__dirname, 'server');
  const osdiPath = path.join(serverDir, 'ptft_fit.osdi');

  console.log('[Server] Starting Python FastAPI backend on port', PYTHON_PORT);
  pyProcess = spawn(
    'python3',
    ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(PYTHON_PORT)],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        GW_NGSPICE: process.env.GW_NGSPICE || '/usr/local/bin/ngspice',
        GW_OSDI: osdiPath,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  );

  pyProcess.on('exit', (code, signal) => {
    console.log(`[Python backend exited with code ${code}, signal ${signal}]`);
    pyProcess = null;
  });
}

function stopPythonBackend() {
  if (pyProcess) {
    try {
      pyProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    pyProcess = null;
  }
}

process.on('SIGINT', () => {
  stopPythonBackend();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopPythonBackend();
  process.exit(0);
});
process.on('exit', () => {
  stopPythonBackend();
});

async function main() {
  startPythonBackend();

  const app = express();

  // Parse JSON payloads for Express-handled endpoints
  app.use(express.json({ limit: '10mb' }));

  // ==========================================
  // Direct Express.js ngspice Execution Routes
  // ==========================================

  // 1. Get ngspice status and capabilities
  app.get(['/api/spice/status', '/circuit/api/spice/status'], async (_req, res) => {
    try {
      const status = await getSpiceStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get built-in SPICE templates
  app.get(['/api/spice/presets', '/circuit/api/spice/presets'], (_req, res) => {
    res.json(SPICE_PRESETS);
  });

  // 3. Directly run SPICE netlist using ngspice binary
  app.post(['/api/spice/run', '/circuit/api/spice/run'], async (req, res) => {
    try {
      const { netlist, timeoutMs, autoOsdi } = req.body;
      if (!netlist || typeof netlist !== 'string' || !netlist.trim()) {
        res.status(400).json({ ok: false, error: 'Netlist content is required' });
        return;
      }

      console.log(`[Express ngspice] Running simulation (${netlist.length} bytes)...`);
      const result = await runSpiceNetlist(netlist, { timeoutMs, autoOsdi });
      res.json(result);
    } catch (err: any) {
      console.error('[Express ngspice Error]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ==========================================
  // Proxy high-level display circuit endpoints
  // ==========================================
  const proxyApiRequest = (req: express.Request, res: express.Response) => {
    const targetUrl = new URL(req.originalUrl, PYTHON_BASE);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== 'content-length' && value !== undefined) {
        headers[key] = Array.isArray(value) ? value.join('; ') : value;
      }
    }
    headers['host'] = `127.0.0.1:${PYTHON_PORT}`;

    // If body was already parsed by express.json, serialize it
    const bodyData = req.body ? JSON.stringify(req.body) : undefined;
    if (bodyData) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(bodyData));
    }

    const proxyReq = http.request(
      targetUrl,
      {
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error('[API Proxy Error]', err.message);
      if (!res.headersSent) {
        res.status(502).json({ ok: false, errors: ['Backend service unavailable: ' + err.message] });
      }
    });

    if (bodyData) {
      proxyReq.write(bodyData);
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  };

  app.use('/api', proxyApiRequest);
  app.use('/circuit/api', proxyApiRequest);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] GW Circuit Simulator running at http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
