-- Explicit one-way contribution profile installation preserves the original budget.
ALTER TABLE correspondence_vf10_installation ADD COLUMN IF NOT EXISTS active_profile jsonb;
ALTER TABLE correspondence_vf10_installation ADD COLUMN IF NOT EXISTS active_receiver_id text;
ALTER TABLE correspondence_vf10_registrations ADD COLUMN IF NOT EXISTS entry_profile jsonb;
ALTER TABLE correspondence_vf10_registrations ADD COLUMN IF NOT EXISTS receiver_id text;
UPDATE correspondence_vf10_registrations r SET entry_profile=i.profile,receiver_id=i.receiver_id
 FROM correspondence_vf10_installation i WHERE r.entry_profile IS NULL;
