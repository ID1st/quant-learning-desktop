ALTER TABLE email_outbox
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

DROP INDEX IF EXISTS email_outbox_pending;

CREATE INDEX IF NOT EXISTS email_outbox_claimable
  ON email_outbox (
    next_attempt_at,
    lease_expires_at,
    created_at
  )
  WHERE status IN ('PENDING', 'FAILED', 'SENDING');

CREATE INDEX IF NOT EXISTS email_outbox_active_lease
  ON email_outbox (lease_expires_at)
  WHERE status = 'SENDING';
