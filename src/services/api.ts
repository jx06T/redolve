import { Item, DashboardData, ApiKeyItem, User, TaxonomyNode } from '../types';

const isLocalDomain = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.local') ||
  /^127\./.test(window.location.hostname) ||
  /^192\.168\./.test(window.location.hostname) ||
  /^10\./.test(window.location.hostname) ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname)
);

const isProductionDomain = typeof window !== 'undefined' && !isLocalDomain && (
  window.location.hostname.includes('pages.dev') ||
  window.location.hostname.includes('jx06t.com')
);

export const API_BASE = (import.meta as any).env?.VITE_API_URL || (
  isProductionDomain
    ? 'https://redolve-api.50313tjx06.workers.dev/api'
    : '/api'
);

export const WORKER_BASE = (import.meta as any).env?.VITE_WORKER_URL || (
  isProductionDomain
    ? 'https://redolve-api.50313tjx06.workers.dev'
    : ''
);

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  let token = localStorage.getItem('redolve_auth_token');
  if (token === 'dev_user_default') {
    localStorage.removeItem('redolve_auth_token');
    token = null;
  }
  return token;
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('redolve_auth_token', token);
  } else {
    localStorage.removeItem('redolve_auth_token');
  }
}

function getAuthHeaders(includeContentType = true): HeadersInit {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// User Authentication Endpoints
export async function fetchCurrentUser(): Promise<{ user: User | null; isGuest: boolean }> {
  const token = getAuthToken();
  if (!token) {
    return { user: null, isGuest: true };
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(false),
    });
    if (!res.ok) {
      setAuthToken(null);
      return { user: null, isGuest: true };
    }
    const data = (await res.json()) as { user?: User; isGuest?: boolean };
    return { user: data.user || null, isGuest: !data.user || !!data.isGuest };
  } catch {
    return { user: null, isGuest: true };
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } finally {
    setAuthToken(null);
  }
}

export async function getGoogleAuthUrl(): Promise<{ configured: boolean; url?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/google/url`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to get Google Auth URL');
  return res.json();
}

export async function loginWithGoogleCredential(credential: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/google/credential`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error('Google authentication failed');
  const data = (await res.json()) as { token: string; user: User };
  setAuthToken(data.token);
  return data;
}

// Taxonomy Sync Endpoints
export async function fetchTaxonomyTree(): Promise<{
  tree: TaxonomyNode[];
  customNodes: TaxonomyNode[];
  counts?: Record<string, number>;
}> {
  const res = await fetch(`${API_BASE}/taxonomy`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch taxonomy tree');
  return res.json();
}

export async function createCustomTaxonomy(data: { label: string; parent_id?: string | null; is_official?: boolean }): Promise<{ node: TaxonomyNode }> {
  const res = await fetch(`${API_BASE}/taxonomy`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create custom taxonomy');
  return res.json();
}

export async function updateCustomTaxonomy(id: string, label: string): Promise<{ node: TaxonomyNode }> {
  const res = await fetch(`${API_BASE}/taxonomy/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ label }),
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || '更新自訂項目名稱失敗');
  }
  return res.json();
}

export async function deleteCustomTaxonomy(id: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/taxonomy/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to delete custom taxonomy');
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/dashboard`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch dashboard data');
  return res.json();
}

export async function fetchProblems(params?: {
  subject_id?: string;
  topic_id?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: Item[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  if (params?.subject_id) query.append('subject_id', params.subject_id);
  if (params?.topic_id) query.append('topic_id', params.topic_id);
  if (params?.status) query.append('status', params.status);
  if (params?.cursor) query.append('cursor', params.cursor);
  if (params?.limit) query.append('limit', params.limit.toString());

  const res = await fetch(`${API_BASE}/problems?${query.toString()}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch problems');
  return res.json();
}

export async function fetchProblemById(id: string): Promise<Item> {
  const res = await fetch(`${API_BASE}/problems/${id}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Problem not found');
  return res.json();
}

export function getProblemImageUrl(id: string): string {
  const token = getAuthToken();
  return token ? `${API_BASE}/problems/${id}/image?auth=${encodeURIComponent(token)}` : `${API_BASE}/problems/${id}/image`;
}

export async function analyzeGuestProblem(file: File): Promise<{ status: string; tagResult: { topic_id: string; keywords: string[]; ocr_text?: string } }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/analyze-guest`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData: any = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `訪客 AI 分析失敗 (HTTP ${res.status})`);
  }
  return res.json();
}

export async function uploadProblem(
  file: File, 
  source?: string, 
  topicId?: string,
  tagResult?: any
): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (source) formData.append('source', source);
  if (topicId) formData.append('topic_id', topicId);
  if (tagResult) formData.append('tag_result', JSON.stringify(tagResult));

  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/problems`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) throw new Error('Failed to upload problem');
  return res.json();
}

export async function analyzeProblem(id: string): Promise<{ status: string; tagResult: any; item: Item }> {
  const res = await fetch(`${API_BASE}/problems/${id}/analyze`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const errorData: any = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `AI 分析失敗 (HTTP ${res.status})`);
  }

  return res.json();
}

export async function updateProblemDrawData(
  id: string,
  drawData: any,
  seq: number
): Promise<{ status: string; current?: any }> {
  const clientId = localStorage.getItem('rdv_client_id') || crypto.randomUUID();
  localStorage.setItem('rdv_client_id', clientId);

  const res = await fetch(`${API_BASE}/problems/${id}/draw`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      draw_data: drawData,
      vector_clock: { clientId, seq },
    }),
  });

  if (!res.ok && res.status !== 409) throw new Error('Failed to save draw data');
  return res.json();
}

export async function updateProblemStatus(id: string, status: 'unsolved' | 'resolved' | 'archived') {
  const res = await fetch(`${API_BASE}/problems/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

export async function updateProblemMetadata(
  id: string,
  data: { topic_id?: string | null; keywords?: string[]; source?: string; typed_notes?: string }
) {
  const res = await fetch(`${API_BASE}/problems/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update metadata');
  return res.json();
}

export async function deleteProblem(id: string) {
  const res = await fetch(`${API_BASE}/problems/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to delete problem');
  return res.json();
}

export async function searchProblems(query: string): Promise<{ items: Item[] }> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function fetchApiKeys(): Promise<{ keys: ApiKeyItem[] }> {
  const res = await fetch(`${API_BASE}/keys`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch API keys');
  return res.json();
}

export async function createApiKey(description?: string): Promise<{ key: string; key_prefix: string }> {
  const res = await fetch(`${API_BASE}/keys`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error('Failed to create API key');
  return res.json();
}

export async function deleteApiKey(keyPrefix: string) {
  const res = await fetch(`${API_BASE}/keys/${encodeURIComponent(keyPrefix)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to revoke API key');
  return res.json();
}

export async function createShareLink(
  id: string,
  allowInk = true,
  allowNotes = true
): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/problems/${id}/share`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      allow_ink: allowInk,
      allow_notes: allowNotes,
    }),
  });
  if (!res.ok) throw new Error('產生分享連結失敗');
  return res.json();
}

export async function revokeShareLink(problemId: string, token: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/problems/${problemId}/share/${token}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to revoke share link');
  return res.json();
}

export async function fetchSharedProblem(token: string): Promise<{ item: Partial<Item>; share: { token: string; allow_ink: boolean } }> {
  const base = WORKER_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
  const res = await fetch(`${base}/share/${token}`);
  if (!res.ok) throw new Error('Shared link expired or invalid');
  return res.json();
}

export function getSharedImageUrl(token: string): string {
  const base = WORKER_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/share/${token}/image`;
}

export async function seedAdminTaxonomy(): Promise<{ status: string; count: number }> {
  const res = await fetch(`${API_BASE}/admin/taxonomy/seed`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return res.json();
}

export async function syncSeedTaxonomiesApi(): Promise<{ status: string; message: string; count: number }> {
  const res = await fetch(`${API_BASE}/taxonomy/sync-seed`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchAdminMe(): Promise<{ isAdmin: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/admin/me`, {
      headers: getAuthHeaders(false),
      credentials: 'include',
    });
    if (!res.ok) return { isAdmin: false };
    return res.json();
  } catch {
    return { isAdmin: false };
  }
}


