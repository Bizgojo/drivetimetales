-- ATL-TESTUSER-002 (Marc, 2026-08-24): auto-flag m.postlewaite+* signups as test accounts
-- Trigger fires on INSERT/UPDATE so any signup path auto-sets is_test_account=true
-- for Marc's +alias testing pattern.

CREATE OR REPLACE FUNCTION auto_flag_test_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email ILIKE 'm.postlewaite+%@gmail.com' THEN
    NEW.is_test_account := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_flag_test_account
  BEFORE INSERT OR UPDATE OF email ON users
  FOR EACH ROW EXECUTE FUNCTION auto_flag_test_account();
