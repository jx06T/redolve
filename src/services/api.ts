import { Item, DashboardData, ApiKeyItem, User, TaxonomyNode } from '../types';

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('redolve_auth_token');
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
export async function fetchCurrentUser(): Promise<{ user: User; isDevFallback: boolean }> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch current user');
  return res.json();
}

export async function loginUser(payload: { email?: string; name?: string; userId?: string }): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = (await res.json()) as { token: string; user: User };
  setAuthToken(data.token);
  return data;
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

export async function fetchAuthUsers(): Promise<{ users: User[] }> {
  const res = await fetch(`${API_BASE}/auth/users`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

// Taxonomy Sync Endpoints
export async function fetchTaxonomyTree(): Promise<{ tree: TaxonomyNode[]; customNodes: TaxonomyNode[] }> {
  const res = await fetch(`${API_BASE}/taxonomy`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch taxonomy tree');
  return res.json();
}

export async function createCustomTaxonomy(data: { label: string; parent_id?: string | null }): Promise<{ node: TaxonomyNode }> {
  const res = await fetch(`${API_BASE}/taxonomy`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create custom taxonomy');
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
  topic_id?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: Item[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
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

export async function uploadProblem(file: File, source?: string, topicId?: string): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (source) formData.append('source', source);
  if (topicId) formData.append('topic_id', topicId);

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

export async function updateProblemStatus(id: string, status: 'unsolved' | 'resolved') {
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
  data: { topic_id?: string; keywords?: string[]; source?: string; typed_notes?: string }
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

export async function deleteApiKey(keyHash: string) {
  const res = await fetch(`${API_BASE}/keys/${encodeURIComponent(keyHash)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to revoke API key');
  return res.json();
}

export async function createShareLink(id: string, allowInk = true): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/problems/${id}/share`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ allow_ink: allowInk }),
  });
  if (!res.ok) throw new Error('Failed to create share link');
  return res.json();
}

export async function fetchSharedProblem(token: string): Promise<{ item: Partial<Item>; share: { token: string; allow_ink: boolean } }> {
  const res = await fetch(`/share/${token}`);
  if (!res.ok) throw new Error('Shared link expired or invalid');
  return res.json();
}

export function getSharedImageUrl(token: string): string {
  return `/share/${token}/image`;
}
