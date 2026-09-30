// src/api/reminders.ts — Reminder endpoints
import { Hono } from 'hono';
import { getDB, type DB } from '../lib/db';
import { generateUUID } from '../lib/auth';

const reminders = new Hono();

/** GET /api/v1/reminders?status=pending|firing|acknowledged|completed */
reminders.get('/', async (c) => {
  const db = getDB();
  
  const status = c.req.query('status');
  const householdId = c.req.query('household_id');

  let sql = 'SELECT * FROM reminders WHERE 1=1';
  const params: unknown[] = [];

  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  if (householdId) {
    sql += ` AND household_id = ?`;
    params.push(householdId);
  }

  sql += ' ORDER BY trigger_at ASC';

  try {
    const result = await db.query<any>(sql, params);

    return c.json(result.map((r: any) => ({
      ...r,
      channels: r.channels ? JSON.parse(r.channels) : ['push'],
      escalation_config: r.escalation_config ? JSON.parse(r.escalation_config) : null,
      repeat_interval: r.repeat_interval ? JSON.parse(r.repeat_interval) : null,
    })));
  } catch (err) {
    console.error('Reminders query error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/reminders */
reminders.post('/', async (c) => {
  const db = getDB();

  try {
    const body = await c.req.json() as {
      event_id?: string;
      household_id: string;
      creator_id: string;
      title: string;
      type: 'fixed' | 'repeating' | 'delayed';
      trigger_at: string;
      ack_delay_minutes?: number;
      max_repeats?: number;
      channels?: string[];
      escalation_config?: any;
    };

    if (!body.title || !body.type || !body.trigger_at || !body.household_id || !body.creator_id) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const id = generateUUID();

    await db.execute(
      `INSERT INTO reminders (id, household_id, event_id, creator_id, title, type, trigger_at, ack_delay_minutes, max_repeats, channels, escalation_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.household_id,
        body.event_id || null,
        body.creator_id,
        body.title,
        body.type,
        body.trigger_at,
        body.ack_delay_minutes ?? 30,
        body.max_repeats ?? 3,
        JSON.stringify(body.channels ?? ['push']),
        body.escalation_config ? JSON.stringify(body.escalation_config) : null,
      ]
    );

    return c.json({ id, ...body }, 201);
  } catch (err) {
    console.error('Reminder creation error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/reminders/:id/acknowledge */
reminders.post('/:id/acknowledge', async (c) => {
  const db = getDB();
  const id = c.req.param('id');

  try {
    const body = await c.req.json() as { user_id: string };

    // Get current reminder state
    const result = await db.query<any>(`SELECT * FROM reminders WHERE id = ?`, [id]);
    if (result.length === 0) {
      return c.json({ error: 'Reminder not found' }, 404);
    }

    const reminder = result[0];

    // Update state to acknowledged, calculate next fire time
    const ackDelayMinutes = reminder.ack_delay_minutes || 30;
    const now = new Date();
    const nextFire = new Date(now.getTime() + ackDelayMinutes * 60 * 1000);

    await db.execute(
      `UPDATE reminders SET status = 'acknowledged', last_ack_by = ?, last_ack_at = datetime('now'), next_fire_after_ack = ? WHERE id = ?`,
      [body.user_id, nextFire.toISOString(), id]
    );

    // Log ack history
    await db.execute(
      `INSERT INTO reminder_ack_history (reminder_id, member_id, action) VALUES (?, ?, 'acknowledge')`,
      [id, body.user_id]
    );

    return c.json({ status: 'acknowledged', next_fire_at: nextFire.toISOString() });
  } catch (err) {
    console.error('Ack error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/reminders/:id/complete */
reminders.post('/:id/complete', async (c) => {
  const db = getDB();
  const id = c.req.param('id');

  try {
    await db.execute(
      `UPDATE reminders SET status = 'completed' WHERE id = ?`,
      [id]
    );

    return c.json({ status: 'completed' });
  } catch (err) {
    console.error('Complete error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/reminders/:id/dismiss */
reminders.post('/:id/dismiss', async (c) => {
  const db = getDB();
  const id = c.req.param('id');

  try {
    await db.execute(
      `UPDATE reminders SET status = 'dismissed' WHERE id = ?`,
      [id]
    );

    return c.json({ status: 'dismissed' });
  } catch (err) {
    console.error('Dismiss error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default reminders;
