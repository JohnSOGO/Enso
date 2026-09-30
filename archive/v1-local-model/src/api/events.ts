// src/api/events.ts — Calendar event endpoints
import { Hono } from 'hono';
import { getDB, type DB } from '../lib/db';
import { generateUUID } from '../lib/auth';

const events = new Hono();

/** GET /api/v1/events?start=...&end=...&range_days=30 */
events.get('/', async (c) => {
  const db = getDB();
  
  const start = c.req.query('start') || '2026-01-01';
  const end = c.req.query('end') || '2026-12-31';
  const rangeDays = parseInt(c.req.query('range_days') || '30');

  // Get household_id from auth (in production, extract from JWT)
  const authHeader = c.req.header('Authorization');
  let householdId: string | null = null;
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // In production: verifyJWT and extract household_id
    // For now, return events without filtering by household
  }

  try {
    const result = await db.query<any>(
      `SELECT * FROM events 
       WHERE start_time >= ? AND end_time <= ? 
       ORDER BY start_time ASC`,
      [start, end]
    );

    // Parse JSON fields
    const events = result.map((e: any) => ({
      ...e,
      assigned_to: e.assigned_to ? JSON.parse(e.assigned_to) : [],
      recurring_rule: e.recurring_rule ? JSON.parse(e.recurring_rule) : null,
    }));

    return c.json(events);
  } catch (err) {
    console.error('Events query error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/events */
events.post('/', async (c) => {
  const db = getDB();

  try {
    const body = await c.req.json() as {
      title: string;
      description?: string;
      start_time: string;
      end_time?: string;
      is_all_day?: boolean;
      recurring_rule?: any;
      assigned_to?: string[];
      household_id: string;
      creator_id: string;
    };

    if (!body.title || !body.start_time || !body.household_id || !body.creator_id) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const id = generateUUID();
    
    await db.execute(
      `INSERT INTO events (id, household_id, creator_id, title, description, start_time, end_time, is_all_day, recurring_rule, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.household_id,
        body.creator_id,
        body.title,
        body.description || null,
        body.start_time,
        body.end_time || null,
        body.is_all_day ? 1 : 0,
        body.recurring_rule ? JSON.stringify(body.recurring_rule) : null,
        body.assigned_to ? JSON.stringify(body.assigned_to) : null,
      ]
    );

    // Log audit event
    await db.execute(
      `INSERT INTO audit_log (household_id, member_id, action, entity_type, entity_id, details) VALUES (?, ?, 'event_created', 'event', ?, ?)`,
      [body.household_id, body.creator_id, id, JSON.stringify({ title: body.title })]
    );

    return c.json({ id, ...body }, 201);
  } catch (err) {
    console.error('Event creation error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/v1/events/:id */
events.get('/:id', async (c) => {
  const db = getDB();
  const id = c.req.param('id');

  try {
    const result = await db.query<any>(
      `SELECT * FROM events WHERE id = ?`,
      [id]
    );

    if (result.length === 0) {
      return c.json({ error: 'Event not found' }, 404);
    }

    const event = result[0];
    return c.json({
      ...event,
      assigned_to: event.assigned_to ? JSON.parse(event.assigned_to) : [],
      recurring_rule: event.recurring_rule ? JSON.parse(event.recurring_rule) : null,
    });
  } catch (err) {
    console.error('Event fetch error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** PUT /api/v1/events/:id */
events.put('/:id', async (c) => {
  const db = getDB();
  const id = c.req.param('id');

  try {
    const body = await c.req.json() as Partial<{
      title: string;
      description: string;
      start_time: string;
      end_time: string;
      is_all_day: boolean;
      recurring_rule: any;
      assigned_to: string[];
    }>;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(body.title); }
    if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description); }
    if (body.start_time !== undefined) { updates.push('start_time = ?'); params.push(body.start_time); }
    if (body.end_time !== undefined) { updates.push('end_time = ?'); params.push(body.end_time); }
    if (body.is_all_day !== undefined) { updates.push('is_all_day = ?'); params.push(body.is_all_day ? 1 : 0); }
    if (body.recurring_rule !== undefined) { updates.push('recurring_rule = ?'); params.push(JSON.stringify(body.recurring_rule)); }
    if (body.assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(JSON.stringify(body.assigned_to)); }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    await db.execute(
      `UPDATE events SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return c.json({ success: true, id });
  } catch (err) {
    console.error('Event update error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** DELETE /api/v1/events/:id */
events.delete('/:id', async (c) => {
  const db = getDB();
  const id = c.req.param('id');

  try {
    await db.execute(`DELETE FROM events WHERE id = ?`, [id]);
    return c.json({ success: true, id });
  } catch (err) {
    console.error('Event delete error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default events;
