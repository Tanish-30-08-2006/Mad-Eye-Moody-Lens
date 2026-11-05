#!/usr/bin/env node
/**
 * tests/mock-server/index.mjs – Mock backend server for Moody Lens extension.
 *
 * Implements the API contract (/api/v1/health, /api/v1/detect, /api/v1/jobs/:id, /api/v1/detect-url).
 * Enables full extension development and testing without spinning up the real Python ML backend.
 * Uses zero external dependencies (Node.js built-in http module).
 *
 * Usage:
 *   node tests/mock-server/index.mjs
 *   PORT=8000 node tests/mock-server/index.mjs
 */

import http from 'node:http';

const PORT = parseInt(process.env.PORT || '8000', 10);

// In-memory mock jobs store
const mockJobs = new Map();

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client',
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client',
    });
    return res.end();
  }

  // ── GET /api/v1/health ────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/v1/health') {
    return sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0-mock',
      models_available: ['hybrid_xception_vit', 'ssl_antispoof', 'video_frame'],
      mock: true,
    });
  }

  // ── POST /api/v1/detect ───────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/v1/detect') {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const job = {
      job_id: jobId,
      status: 'completed',
      overall_score: 0.12,
      label: 'likely_real',
      models: {
        image: {
          score: 0.12,
          label: 'real',
          confidence: 0.94,
        },
      },
      model_versions: {
        image: '1.0.0',
      },
      mock: true,
      created_at: now,
      updated_at: now,
    };

    mockJobs.set(jobId, job);

    return sendJson(res, 202, { job_id: jobId });
  }

  // ── POST /api/v1/detect-url ───────────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/v1/detect-url') {
    const jobId = `job_url_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const job = {
      job_id: jobId,
      status: 'completed',
      overall_score: 0.78,
      label: 'likely_fake',
      models: {
        face: {
          score: 0.85,
          label: 'manipulated',
          confidence: 0.91,
        },
      },
      model_versions: {
        face: '1.0.0',
      },
      mock: true,
      created_at: now,
      updated_at: now,
    };

    mockJobs.set(jobId, job);

    return sendJson(res, 202, { job_id: jobId });
  }

  // ── GET /api/v1/jobs/:id ──────────────────────────────────────────────────
  if (method === 'GET' && pathname.startsWith('/api/v1/jobs/')) {
    const jobId = pathname.replace('/api/v1/jobs/', '').trim();
    if (!jobId) {
      return sendJson(res, 400, { error: 'Job ID missing' });
    }

    if (mockJobs.has(jobId)) {
      return sendJson(res, 200, mockJobs.get(jobId));
    }

    // Default mock response for any arbitrary requested job ID
    const now = new Date().toISOString();
    return sendJson(res, 200, {
      job_id: jobId,
      status: 'completed',
      overall_score: 0.25,
      label: 'likely_real',
      models: {
        image: {
          score: 0.25,
          label: 'real',
          confidence: 0.88,
        },
      },
      model_versions: {
        image: '1.0.0',
      },
      mock: true,
      created_at: now,
      updated_at: now,
    });
  }

  // Fallthrough 404
  return sendJson(res, 404, { error: 'Not found', path: pathname });
});

import { fileURLToPath } from 'node:url';

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Moody Lens mock server listening on http://localhost:${PORT}`);
  });
}

export { server };
