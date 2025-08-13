-- For "Leads" (with capital L)
DROP TRIGGER IF EXISTS leads_notify_trigger ON "Leads";
DROP FUNCTION IF EXISTS notify_leads_change();

CREATE OR REPLACE FUNCTION notify_leads_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('leads_changes', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_notify_trigger
AFTER INSERT OR UPDATE ON "Leads"
FOR EACH ROW
EXECUTE FUNCTION notify_leads_change();

-- For "Campaigns" (also capital C)
DROP TRIGGER IF EXISTS campaigns_notify_trigger ON "Campaigns";
DROP FUNCTION IF EXISTS notify_campaign_change();

CREATE OR REPLACE FUNCTION notify_campaign_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('campaigns_changes', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_notify_trigger
AFTER UPDATE ON "Campaigns"
FOR EACH ROW
EXECUTE FUNCTION notify_campaign_change();
