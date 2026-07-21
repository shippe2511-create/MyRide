import { createClient } from "@/lib/supabase/client"

type ActionType = 'create' | 'update' | 'delete' | 'view' | 'login' | 'logout'

interface LogActivityParams {
  action: ActionType
  entityType: string
  entityId?: string
  details?: Record<string, unknown>
}

export async function logActivity({ action, entityType, entityId, details }: LogActivityParams) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['super_admin', 'manager', 'operator'].includes(profile.role)) return

  await supabase.from('activity_logs').insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details || {},
    admin_id: user.id,
    admin_name: profile.full_name || user.email || 'Unknown',
  })
}
