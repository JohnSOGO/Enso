-- SPEC §4.2zzl, §9.2e — a room's Home Assistant devices: one row per device, keyed by its entity id, so a device is in at
-- most one room. Its name and state are asked of HA live; nothing about the device itself is stored.
CREATE TABLE room_devices (
  entity_id  TEXT PRIMARY KEY,                        -- e.g. 'climate.midea_ac_151732605523107'
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  position   INTEGER NOT NULL,                        -- the order picked within the room
  created_at TEXT NOT NULL
);
CREATE INDEX idx_room_devices_room ON room_devices(room_id, position);
