-- F9: Seed the configurable booking advance window in hoa_settings.
--
-- Residents may book a facility at most this many calendar days in advance.
-- Admins are exempt. The value can be changed without a code change.
-- Default: 14 days, confirmed by the product owner 2026-08-21.

INSERT INTO hoa_settings (key, value, created_at, updated_at)
VALUES ('booking_advance_days', '14', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
