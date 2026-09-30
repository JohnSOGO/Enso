// src/server.ts — Local development server (Windows PC)
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import authRoutes from './api/auth';
import eventRoutes from './api/events';
import reminderRoutes from './api/reminders';
import haRoutes from './api/ha';
import { initSQLite, getDB } from './lib/db';

const app = new Hono();

// CORS middleware for dev
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  
  await next();
});

// Ensure schema exists on startup
async function ensureSchema() {
  const fs = require('fs').promises;
  const path = require('path');
  
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  
  // Execute each statement separately (sql.js doesn't support multi-statement)
  const statements = schema.split(';').filter(s => s.trim().length > 0);
  for (const stmt of statements) {
    try {
      getDB().execute(stmt + ';');
    } catch (err: any) {
      // Ignore "table already exists" errors
      if (!String(err).message.includes('already exists')) {
        console.error('Schema error:', err.message);
      }
    }
  }
}

// Start server after DB is ready
async function main() {
  const PORT = parseInt(process.env.PORT || '3001');
  
  // Initialize SQLite (loads WASM — async)
  await initSQLite(process.env.SQLITE_PATH || './data/hrc.db');
  
  // Apply schema
  await ensureSchema();

  // Register routes
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/events', eventRoutes);
  app.route('/api/v1/reminders', reminderRoutes);
  app.route('/api/v1/ha', haRoutes);

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  const server = serve({
    fetch: app.fetch,
    port: PORT,
  });
  
  console.log(`\n=== Home Reminder Calendar ===`);
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`PWA frontend: http://localhost:5173`);
  console.log(`HA target: http://192.168.0.123:8123`);
  console.log(`==============================\n`);
}

main().catch(console.error);

export default app;
