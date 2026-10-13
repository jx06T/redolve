export type ProgressPlan = { id: string; name: string; unit: string; target_count: number; completed_count: number; created_at: number; updated_at: number; row_version: number };
export type ProgressMetadata = Pick<ProgressPlan, 'name' | 'unit' | 'target_count'>;
export type ProgressPreferences = { visible: boolean; order: string[]; row_version: number };
export type ProgressData = { plans: ProgressPlan[]; preferences: ProgressPreferences };
export const defaultProgressPreferences: ProgressPreferences = { visible: true, order: [], row_version: 0 };
export const validProgressId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id);
export const validProgressOrder = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 100 && ids.every(validProgressId) && new Set(ids).size === ids.length;
export const validProgressMetadata = (m: Partial<ProgressMetadata>) => typeof m.name === 'string' && !!m.name.trim() && m.name.length <= 100 && typeof m.unit === 'string' && !!m.unit.trim() && m.unit.length <= 12 && Number.isSafeInteger(m.target_count) && m.target_count! >= 1 && m.target_count! <= 1000000;
export const applyProgressStep = (p: ProgressPlan, delta: 1 | -1) => delta === 1 ? p.completed_count < p.target_count ? p.completed_count + 1 : p.completed_count : Math.max(0, p.completed_count - 1);
export function orderedProgressPlans(plans: ProgressPlan[], ids: string[] = []) {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...plans].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.created_at - b.created_at || a.id.localeCompare(b.id));
}
