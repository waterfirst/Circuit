import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSpiceStatus, runSpiceNetlist, SPICE_PRESETS } from './server/spiceEngine.ts';
import {
  DRIVER_PRESETS,
  PIXEL_PRESET,
  validateDriver,
  calcDriverTiming,
  buildDriverNetlist,
  runDriverSim,
  validatePixel,
  buildPixelNetlist,
  runPixelSim,
  estimateAging,
  startMarginMap,
  getMarginMap,
  optimizeParameters,
  optimizeSignals,
  runCircuitWizard,
} from './server/circuitBackend.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

let activeSimulations = 0;

async function main() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // ==========================================
  // 1. Direct Express.js ngspice Console Routes
  // ==========================================
  app.get(['/api/spice/status', '/circuit/api/spice/status'], async (_req, res) => {
    try {
      const status = await getSpiceStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(['/api/spice/presets', '/circuit/api/spice/presets'], (_req, res) => {
    res.json(SPICE_PRESETS);
  });

  app.post(['/api/spice/run', '/circuit/api/spice/run'], async (req, res) => {
    try {
      const { netlist, timeoutMs, autoOsdi } = req.body || {};
      if (!netlist || typeof netlist !== 'string' || !netlist.trim()) {
        res.status(400).json({ ok: false, error: 'Netlist content is required' });
        return;
      }
      const result = await runSpiceNetlist(netlist, { timeoutMs, autoOsdi });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ==========================================
  // 2. Display Circuit Simulator Routes
  // ==========================================
  app.get(['/api/health', '/circuit/api/health'], (_req, res) => {
    res.json({
      status: 'ok',
      busy: activeSimulations > 0,
      waiting: Math.max(0, activeSimulations - 1),
    });
  });

  app.get(['/api/presets', '/circuit/api/presets'], (_req, res) => {
    res.json(DRIVER_PRESETS);
  });

  app.post(['/api/simulate', '/circuit/api/simulate'], async (req, res) => {
    activeSimulations++;
    try {
      const result = await runDriverSim(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Simulation error'] });
    } finally {
      activeSimulations--;
    }
  });

  app.get(['/api/pixel/preset', '/circuit/api/pixel/preset'], (_req, res) => {
    res.json(PIXEL_PRESET);
  });

  app.post(['/api/pixel/simulate', '/circuit/api/pixel/simulate'], async (req, res) => {
    activeSimulations++;
    try {
      const result = await runPixelSim(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Pixel simulation error'] });
    } finally {
      activeSimulations--;
    }
  });

  app.post(['/api/aging', '/circuit/api/aging'], async (req, res) => {
    activeSimulations++;
    try {
      const result = await estimateAging(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Aging estimation error'] });
    } finally {
      activeSimulations--;
    }
  });

  app.post(['/api/map', '/circuit/api/map'], (req, res) => {
    try {
      const result = startMarginMap(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Margin map error'] });
    }
  });

  app.get(['/api/map/:jid', '/circuit/api/map/:jid'], (req, res) => {
    const result = getMarginMap(req.params.jid);
    res.json(result);
  });

  app.post(['/api/netlist', '/circuit/api/netlist'], (req, res) => {
    try {
      const payload = req.body || {};
      const kind = payload.kind || 'driver';
      const desc = payload.desc || payload;
      if (kind === 'pixel') {
        const { errors, n } = validatePixel(desc);
        if (errors.length > 0) {
          res.status(400).json({ ok: false, errors });
          return;
        }
        const sp = buildPixelNetlist(n);
        res.json({ ok: true, netlist: sp, filename: `${desc.name || 'pixel'}.sp` });
      } else {
        const { errors, n } = validateDriver(desc);
        if (errors.length > 0) {
          res.status(400).json({ ok: false, errors });
          return;
        }
        const t = calcDriverTiming(n);
        const sp = buildDriverNetlist(n, t);
        res.json({ ok: true, netlist: sp, filename: `${desc.name || 'gw_circuit'}.sp` });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Netlist export error'] });
    }
  });

  app.post(['/api/optimize/params', '/circuit/api/optimize/params'], async (req, res) => {
    activeSimulations++;
    try {
      const result = await optimizeParameters(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Parameter optimization error'] });
    } finally {
      activeSimulations--;
    }
  });

  app.post(['/api/optimize/signals', '/circuit/api/optimize/signals'], async (req, res) => {
    activeSimulations++;
    try {
      const result = await optimizeSignals(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Signal optimization error'] });
    } finally {
      activeSimulations--;
    }
  });

  app.post(['/api/optimize/wizard', '/circuit/api/optimize/wizard'], async (req, res) => {
    activeSimulations++;
    try {
      const result = await runCircuitWizard(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, errors: [err.message || 'Wizard optimization error'] });
    } finally {
      activeSimulations--;
    }
  });

  // ==========================================
  // 3. Frontend Serving (Vite in Dev, Static in Prod)
  // ==========================================
  const distPath = path.join(__dirname, 'dist');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
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
