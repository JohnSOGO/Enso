-- SPEC §4.2l — the LAN relay is retired (v1.7.0, §9.2); its heartbeat column goes with it.
-- House health is derived from the deliveries table (houseState), never stored.
ALTER TABLE settings DROP COLUMN relay_last_seen;
