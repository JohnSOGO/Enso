// src/workers/index.ts — Cloudflare Workers entry point (production)
import { Hono } from 'hono';
import { env } from 'hono/adapter';
import authRoutes from '../api/auth';
import eventRoutes from '../api/events';
import reminderRoutes from '../api/reminders';
import haRoutes from '../api/ha';

// D1 binding — provided by Cloudflare at runtime
interface Env {
  DB: D1Database;
  HA_TOKEN: string;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware for production
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
  }
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  
  await next();
});

// Inject D1 binding into the DB module
const originalGetDB = require('../lib/db').getDB;
require('../lib/db').getDB = () => {
  const e = env<{ DB: D1Database }>(c);
  return new (require('../lib/db').D1DB)(e.DB);
};

// API routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/events', eventRoutes);
app.route('/api/v1/reminders', reminderRoutes);
app.route('/api/v1/ha', haRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
