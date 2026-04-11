-- Track API usage and costs per user
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  feature TEXT NOT NULL,          -- e.g. 'hairstyle_tryon'
  input_tokens INT,
  output_tokens INT,
  image_count INT DEFAULT 1,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',  -- success | error | blocked
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX idx_api_usage_model ON api_usage_logs(model, created_at DESC);

-- RLS: users can read their own logs, insert their own logs
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON api_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON api_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
