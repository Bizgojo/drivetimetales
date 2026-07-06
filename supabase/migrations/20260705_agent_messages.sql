CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reply_body TEXT,
  replied_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  mission_ref TEXT,
  requires_action BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS agent_messages_to_status ON agent_messages (to_agent, status);
CREATE INDEX IF NOT EXISTS agent_messages_from_created ON agent_messages (from_agent, created_at DESC);
