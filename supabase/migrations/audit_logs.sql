-- audit_logs tábla
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,
  entity_id   UUID,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_action  ON audit_logs (action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenant admin csak saját logokat lát
CREATE POLICY "audit_tenant_select" ON audit_logs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Super admin mindent lát
CREATE POLICY "audit_superadmin_select" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- INSERT csak service role-ból (API route-ok supabaseAdmin-nal írnak, RLS-t bypass-olnak)
