/**
 * @file server.ts
 * @description Express server for Singapore Parking Discovery application.
 * Manages server-side endpoints (/api/insight, /api/parking/lta, /api/config)
 * and mounts Vite development middleware or serves static production files.
 */

import express from 'express';
import path from 'path';
import { handleInsightRequest } from './api/insight.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON bodies
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Singapore Parking Discovery API',
      timestamp: new Date().toISOString(),
    });
  });

  // Client configuration endpoint (exposes public keys/flags safely)
  app.get('/api/config', (req, res) => {
    res.json({
      hasGoogleMapsKey: Boolean(process.env.GOOGLE_MAPS_PLATFORM_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      hasLtaKey: Boolean(process.env.LTA_ACCOUNT_KEY),
      defaultLocation: {
        name: 'Singapore (Central)',
        lat: 1.3521,
        lng: 103.8198,
      },
    });
  });

  // AI-powered / Deterministic Explanation endpoint
  app.post('/api/insight', async (req, res) => {
    try {
      await handleInsightRequest(req, res);
    } catch (err: any) {
      console.error('Server error handling /api/insight:', err);
      res.status(500).json({ error: 'Internal server error processing insight request.' });
    }
  });

  // LTA DataMall Live Parking Proxy endpoint (if LTA_ACCOUNT_KEY is supplied)
  app.get('/api/parking/lta', async (req, res) => {
    const ltaKey = process.env.LTA_ACCOUNT_KEY;
    if (!ltaKey) {
      return res.status(200).json({
        live: false,
        message: 'LTA_ACCOUNT_KEY not configured. Using verified Singapore carpark directory.',
        value: [],
      });
    }

    try {
      const response = await fetch('http://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2', {
        headers: {
          AccountKey: ltaKey,
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`LTA DataMall API responded with status ${response.status}`);
      }

      const data = await response.json();
      return res.json({
        live: true,
        source: 'LTA DataMall CarParkAvailabilityv2',
        updatedAt: new Date().toISOString(),
        value: data.value || [],
      });
    } catch (err: any) {
      console.error('LTA DataMall proxy error:', err.message);
      return res.status(502).json({
        live: false,
        error: 'Failed to fetch live data from LTA DataMall.',
        details: err.message,
      });
    }
  });

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Singapore Parking App running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
