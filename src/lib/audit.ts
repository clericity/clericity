import { supabaseAdmin } from './supabaseServer'

export type AuditAction =
  | 'booking.create'
  | 'booking.delete'
  | 'booking.cancel'
  | 'booking.reschedule'
  | 'staff.create'
  | 'staff.delete'
  | 'account.delete'
  | 'plan.change'

export async function writeAuditLog(params: {
  tenantId: string | null
  userId?: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    tenant_id: params.tenantId,
    user_id: params.userId ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    metadata: params.metadata ?? {},
  })
  if (error) {
    console.error('[audit] write failed:', error.message)
  }
}
