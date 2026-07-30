BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  auth_version integer NOT NULL DEFAULT 0,
  email_verified_at timestamptz NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_auth_version_check CHECK (auth_version >= 0),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (email);

CREATE TABLE IF NOT EXISTS invite_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'ACTIVE',
  claim_expires_at timestamptz NOT NULL,
  total_count integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT invite_batches_status_check
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT invite_batches_total_count_check
    CHECK (total_count BETWEEN 1 AND 500)
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES invite_batches(id),
  code_digest bytea NOT NULL,
  duration_days smallint NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  claim_expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invite_codes_duration_check
    CHECK (duration_days IN (7, 30, 90, 365)),
  CONSTRAINT invite_codes_status_check
    CHECK (status IN ('ACTIVE', 'REDEEMED', 'REVOKED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_digest_unique
  ON invite_codes (code_digest);
CREATE INDEX IF NOT EXISTS invite_codes_batch_status
  ON invite_codes (batch_id, status);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  duration_days smallint NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_duration_check
    CHECK (duration_days IN (7, 30, 90, 365)),
  CONSTRAINT entitlements_period_check
    CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id uuid NOT NULL UNIQUE REFERENCES invite_codes(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_entitlement_ends_at timestamptz,
  entitlement_ends_at timestamptz NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_redemptions_user
  ON invite_redemptions (user_id, redeemed_at DESC);

CREATE TABLE IF NOT EXISTS email_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL,
  code_digest bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consumed_at timestamptz,
  requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_challenges_email_normalized
    CHECK (email = lower(btrim(email))),
  CONSTRAINT email_challenges_purpose_check
    CHECK (purpose IN ('REGISTRATION', 'PASSWORD_RESET')),
  CONSTRAINT email_challenges_attempts_check
    CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS email_challenges_lookup
  ON email_challenges (email, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_label text NOT NULL,
  access_token_digest bytea NOT NULL,
  refresh_token_digest bytea NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT sessions_device_id_length
    CHECK (char_length(device_id) BETWEEN 8 AND 128),
  CONSTRAINT sessions_device_label_length
    CHECK (char_length(device_label) BETWEEN 1 AND 128)
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_access_token_unique
  ON sessions (access_token_digest);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_refresh_token_unique
  ON sessions (refresh_token_digest);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_active_device_unique
  ON sessions (user_id, device_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_active_user
  ON sessions (user_id, created_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_status_check
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  CONSTRAINT email_outbox_attempt_count_check
    CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS email_outbox_pending
  ON email_outbox (next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email text,
  event_type text NOT NULL,
  source_ip inet,
  device_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_audit_events_user_time
  ON auth_audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_audit_events_email_time
  ON auth_audit_events (email, created_at DESC);

COMMIT;
