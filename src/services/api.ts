import { Item, DashboardData, ApiKeyItem } from '../types';

const API_BASE = '/api';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/dashboard`);
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

  const res = await fetch(`${API_BASE}/problems?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch problems');
  return res.json();
}

export async function fetchProblemById(id: string): Promise<Item> {
  const res = await fetch(`${API_BASE}/problems/${id}`);
  if (!res.ok) throw new Error('Problem not found');
  return res.json();
}

export function getProblemImageUrl(id: string): string {
  return `${API_BASE}/problems/${id}/image`;
}

export async function uploadProblem(file: File, source?: string, topicId?: string): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (source) formData.append('source', source);
  if (topicId) formData.append('topic_id', topicId);

  const res = await fetch(`${API_BASE}/problems`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Failed to upload problem');
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

export async function updateProblemMetadata(id: string, data: { topic_id?: string; keywords?: string[] }) {
  const res = await fetch(`${API_BASE}/problems/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update metadata');
  return res.json();
}

export async function deleteProblem(id: string) {
  const res = await fetch(`${API_BASE}/problems/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete problem');
  return res.json();
}

export async function searchProblems(query: string): Promise<{ items: Item[] }> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function fetchApiKeys(): Promise<{ keys: ApiKeyItem[] }> {
  const res = await fetch(`${API_BASE}/keys`);
  if (!res.ok) throw new Error('Failed to fetch API keys');
  return res.json();
}

export async function createApiKey(description?: string): Promise<{ key: string; key_prefix: string }> {
  const res = await fetch(`${API_BASE}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error('Failed to create API key');
  return res.json();
}

export async function deleteApiKey(keyHash: string) {
  const res = await fetch(`${API_BASE}/keys/${encodeURIComponent(keyHash)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to revoke API key');
  return res.json();
}

export async function createShareLink(id: string, allowInk = true): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/problems/${id}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
