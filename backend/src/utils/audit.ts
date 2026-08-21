import { supabaseAdmin } from '../config/supabase.js';

/** Insert-only audit trail (docs/03 §13, docs/04 §3) — the service role is the only writer. */
export async function logAudit(params: {
  businessId: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    business_id: params.businessId,
    user_id: params.userId,
    user_email: params.userEmail,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    entity_label: params.entityLabel ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    // Audit failures must never block the primary operation — log and move on.
    // eslint-disable-next-line no-console
    console.error('audit log insert failed', error.message);
  }
}
