// src/api/ha.ts — Home Assistant integration endpoints
import { Hono } from 'hono';
import { getDB, type DB } from '../lib/db';

const ha = new Hono();

/** GET /api/v1/ha/status */
ha.get('/status', async (c) => {
  try {
    const response = await fetch('http://192.168.0.123:8123/api/states', {
      headers: {
        'Authorization': `Bearer ${process.env.HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return c.json({ online: false, error: 'HA unreachable' }, 503);
    }

    const states = await response.json();
    return c.json({ online: true, entities_count: states.length });
  } catch (err) {
    console.error('HA status check failed:', err);
    return c.json({ online: false, error: 'Connection failed' }, 503);
  }
});

/** POST /api/v1/ha/sync-entities */
ha.post('/sync-entities', async (c) => {
  const db = getDB();

  try {
    // Get all active reminders that need HA entities
    const result = await db.query<any>(
      `SELECT * FROM reminders WHERE status IN ('pending', 'firing', 'acknowledged', 'delayed')`
    );

    if (result.length === 0) {
      return c.json({ created_entities: 0, generated_yaml: '' });
    }

    // Generate YAML for template sensors and input_booleans
    let yaml = '';
    
    result.forEach((r: any) => {
      const safeName = r.title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 32);
      
      yaml += `# HRC Reminder Entity\n`;
      yaml += `sensor:\n`;
      yaml += `  - platform: template\n`;
      yaml += `    sensors:\n`;
      yaml += `      hrc_reminder_${safeName}:\n`;
      yaml += `        friendly_name: "${r.title}"\n`;
      yaml += `        value_template: "{{ 'active' if is_state('input_boolean.hrc_ack_${safeName}', 'on') else 'idle' }}"\n`;
      yaml += `\n`;
      yaml += `input_boolean:\n`;
      yaml += `  hrc_ack_${safeName}:\n`;
      yaml += `    name: "${r.title} Acknowledged"\n`;
      yaml += `\n`;
      yaml += `input_text:\n`;
      yaml += `  hrc_msg_${safeName}:\n`;
      yaml += `    name: "${r.title} Message"\n`;
      yaml += `\n`;
    });

    // In production, write YAML to HA config via SMB or API
    // For now, return the generated YAML for review
    
    return c.json({
      created_entities: result.length,
      generated_yaml: yaml,
      message: 'YAML generated. Write to /config/automations/hrc_sync.yaml on HAOSDOJO.',
    });
  } catch (err) {
    console.error('HA sync error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/ha/announce */
ha.post('/announce', async (c) => {
  try {
    const body = await c.req.json() as { text: string; target?: string; volume?: number };

    if (!body.text) {
      return c.json({ success: false, error: 'Missing text' }, 400);
    }

    // Send announcement to Home Assistant
    const response = await fetch('http://192.168.0.123:8123/api/services/tts/google_say', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media_entity_ids: body.target || ['media_player.all'],
        message: body.text,
        cache: false,
      }),
    });

    if (!response.ok) {
      // Try fallback to notify service
      const fallback = await fetch('http://192.168.0.123:8123/api/services/notify/all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: body.text,
          title: 'Home Reminder Calendar',
        }),
      });

      if (!fallback.ok) {
        return c.json({ success: false, error: 'HA announcement failed' }, 503);
      }
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('HA announce error:', err);
    return c.json({ success: false, error: 'Connection failed' }, 503);
  }
});

/** GET /api/v1/ha/entities/:entity_id */
ha.get('/entities/:entityId', async (c) => {
  try {
    const entityId = c.req.param('entityId');
    
    const response = await fetch(
      `http://192.168.0.123:8123/api/states/${encodeURIComponent(entityId)}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.HA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return c.json({ error: 'Entity not found' }, 404);
    }

    const state = await response.json();
    return c.json(state);
  } catch (err) {
    console.error('HA entity fetch error:', err);
    return c.json({ error: 'Connection failed' }, 503);
  }
});

export default ha;
