-- §4.2zza, §8.5b — each member's own After work / After school for 📌 Reminders; NULL = by role (⚑ Q315).
ALTER TABLE member_prefs ADD COLUMN after_kind TEXT CHECK (after_kind IN ('work', 'school'));
ALTER TABLE member_prefs ADD COLUMN after_time TEXT;
-- MojoSOGO 2026-10-19: "After work for John is 3:30" — the founder (the earliest member).
UPDATE member_prefs SET after_time = '15:30'
  WHERE member_id = (SELECT id FROM members ORDER BY created_at, id LIMIT 1);
