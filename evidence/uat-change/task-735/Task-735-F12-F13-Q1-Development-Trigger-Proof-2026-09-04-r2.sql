-- Development-only verification evidence for 0048 (executed successfully).
-- The nested block catches the expected 23P01 exclusion_violation from the
-- second direct write; ROLLBACK guarantees no verification rows persist.
BEGIN;
DO $$
DECLARE u integer; f integer;
BEGIN
  SELECT id INTO u FROM units WHERE NOT is_system LIMIT 1;
  SELECT id INTO f FROM facilities WHERE is_active LIMIT 1;
  INSERT INTO bookings(facility_id, unit_id, start_time, end_time, status, total_amount, payment_status)
  VALUES (f, u, CURRENT_TIMESTAMP + interval '2 days', CURRENT_TIMESTAMP + interval '2 days 1 hour', 'confirmed', 0, 'not_required');
  BEGIN
    INSERT INTO bookings(facility_id, unit_id, start_time, end_time, status, total_amount, payment_status)
    VALUES (f, u, CURRENT_TIMESTAMP + interval '3 days', CURRENT_TIMESTAMP + interval '3 days 1 hour', 'confirmed', 0, 'not_required');
    RAISE EXCEPTION 'trigger did not reject conflict';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
END $$;
ROLLBACK;