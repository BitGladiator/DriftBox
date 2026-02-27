-- DriftBox — Initial Schema Migration
-- Run order: 001


CREATE EXTENSION IF NOT EXISTS "pgcrypto";


CREATE TABLE IF NOT EXISTS users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  storage_used  BIGINT DEFAULT 0,
  storage_quota BIGINT DEFAULT 15000000000,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  device_id   UUID,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS devices (
  device_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  device_name   VARCHAR(100),
  last_sync_at  TIMESTAMP WITH TIME ZONE,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS files (
  file_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  folder_path TEXT NOT NULL DEFAULT '/',
  size        BIGINT DEFAULT 0,
  mime_type   VARCHAR(100),
  is_deleted  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS chunks (
  chunk_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash         CHAR(64) UNIQUE NOT NULL,
  size         INT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS file_versions (
  version_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
  version_num INT NOT NULL,
  chunk_ids   UUID[] NOT NULL,
  size        BIGINT DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(file_id, version_num)
);


CREATE TABLE IF NOT EXISTS shared_links (
  link_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  permission  VARCHAR(10) NOT NULL CHECK (permission IN ('read', 'write')),
  expires_at  TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_files_user_id         ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_path     ON files(user_id, folder_path);
CREATE INDEX IF NOT EXISTS idx_files_deleted         ON files(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_chunks_hash           ON chunks(hash);
CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id       ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_links_file_id  ON shared_links(file_id);


CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();