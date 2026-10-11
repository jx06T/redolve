import { Item, DashboardData, ApiKeyItem, User, TaxonomyNode } from '../types';
import { createClientId } from '../utils/clientId';
import type { SearchPage } from '../types/search';
import { questionListCache } from './listCache';

export const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';
export const WORKER_BASE = (import.meta as any).env?.VITE_WORKER_URL || '';

async function requestApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await globalThis.fetch(input, { credentials: 'include', cache: 'no-store', ...init });
  const method = (init?.method || 'GET').toUpperCase();
  if (response.status === 401 || response.ok && !['GET', 'HEAD'].includes(method)) questionListCache.invalidate();
  return response;
}

function getAuthHeaders(includeContentType = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

// User Authentication Endpoints
export async function fetchCurrentUser(): Promise<{ user: User | null; isGuest: boolean }> {
  try {
    const res = await requestApi(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(false),
    });
    if (!res.ok) return { user: null, isGuest: true };
    const data = (await res.json()) as { user?: User; isGuest?: boolean };
    return { user: data.user || null, isGuest: !data.user || !!data.isGuest };
  } catch {
    return { user: null, isGuest: true };
  }
}

export async function logoutUser(): Promise<void> {
  const res = await requestApi(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('登出失敗，請確認網路連線後重試');
}

export async function getGoogleAuthUrl(returnTo?: string): Promise<{ configured: boolean; url?: string; message?: string }> {
  const res = await requestApi(`${API_BASE}/auth/google/url${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to get Google Auth URL');
  return res.json();
}

// Taxonomy Sync Endpoints
export async function fetchTaxonomyTree(): Promise<{
  tree: TaxonomyNode[];
  customNodes: TaxonomyNode[];
  counts?: Record<string, number>;
}> {
  const res = await requestApi(`${API_BASE}/taxonomy`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch taxonomy tree');
  return res.json();
}

export async function createCustomTaxonomy(data: { label: string; parent_id?: string | null; is_official?: boolean }): Promise<{ node: TaxonomyNode }> {
  const res = await requestApi(`${API_BASE}/taxonomy`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create custom taxonomy');
  return res.json();
}

export async function updateCustomTaxonomy(id: string, label: string): Promise<{ node: TaxonomyNode }> {
  const res = await requestApi(`${API_BASE}/taxonomy/${encodeURIComponent(id)}`, {
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
  const res = await requestApi(`${API_BASE}/taxonomy/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to delete custom taxonomy');
  return res.json();
}

export async function fetchHealth() {
  const res = await requestApi(`${API_BASE}/health`);
  return res.json();
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await requestApi(`${API_BASE}/dashboard`, {
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
  collection_id?: string;
}): Promise<{ items: Item[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  if (params?.subject_id) query.append('subject_id', params.subject_id);
  if (params?.topic_id) query.append('topic_id', params.topic_id);
  if (params?.status) query.append('status', params.status);
  if (params?.cursor) query.append('cursor', params.cursor);
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.collection_id) query.append('collection_id',params.collection_id);

  const res = await requestApi(`${API_BASE}/problems?${query.toString()}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch problems');
  return res.json();
}

export async function fetchProblemById(id: string): Promise<Item> {
  const res = await requestApi(`${API_BASE}/problems/${id}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Problem not found');
  const data = await res.json() as { item: Item };
  return data.item;
}

export async function fetchProblemText(id: string): Promise<{ text: string }> {
  const res = await requestApi(`${API_BASE}/problems/${id}/text`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch problem text');
  return res.json();
}

export function getProblemImageUrl(id: string): string {
  return `${API_BASE}/problems/${encodeURIComponent(id)}/image`;
}

export async function analyzeGuestProblem(file: File): Promise<{ status: string; tagResult: { topic_id: string; keywords: string[]; ocr_text?: string } }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await requestApi(`${API_BASE}/problems/analyze-guest`, {
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
  tagResult?: any,
  collectionId?: string | null,
): Promise<{ id: string; destination?: {collection_id:string|null;join:{error?:string;status?:string}|null} }> {
  const formData = new FormData();
  formData.append('file', file);
  if (source) formData.append('source', source);
  if (topicId) formData.append('topic_id', topicId);
  if (tagResult) formData.append('tag_result', JSON.stringify(tagResult));
  if (collectionId !== undefined) formData.append('collection_id', collectionId || 'private');

  const res = await requestApi(`${API_BASE}/problems`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
    throw new Error(errorData?.error?.message || errorData?.message || `上傳失敗 (HTTP ${res.status})`);
  }
  return res.json();
}

export async function analyzeProblem(id: string): Promise<{ status: string; tagResult: any; item: Item }> {
  const res = await requestApi(`${API_BASE}/problems/${id}/analyze`, {
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
): Promise<{ status: string; seq: number; current?: any }> {
  let clientId = createClientId();
  try {
    clientId = localStorage.getItem('rdv_client_id') || clientId;
    localStorage.setItem('rdv_client_id', clientId);
  } catch { /* Storage restrictions must not block a drawing update. */ }

  const res = await requestApi(`${API_BASE}/problems/${id}/draw`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      draw_data: drawData,
      vector_clock: { clientId, seq },
    }),
  });

  if (res.status === 409) throw new Error('CONFLICT: 筆跡已由其他裝置更新');
  if (!res.ok) throw new Error('Failed to save draw data');
  return res.json();
}

export async function updateProblemStatus(id: string, status: 'unsolved' | 'resolved' | 'archived') {
  const res = await requestApi(`${API_BASE}/problems/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

export async function updateProblemMetadata(
  id: string,
  data: { topic_id?: string | null; keywords?: string[]; source?: string; typed_notes?: string;
    expected_notes_seq?: number; expected_content_seq?: number }
) {
  const res = await requestApi(`${API_BASE}/problems/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (res.status === 409) throw new Error('CONFLICT: 題目已由其他裝置更新');
  if (!res.ok) throw new Error('Failed to update metadata');
  return res.json() as Promise<{ status:string; content_seq?:number; notes_seq?:number }>;
}

export async function mutateProblemTag(id:string,op:'add'|'remove',tag:string) {
  const res=await requestApi(`${API_BASE}/problems/${id}/tags`,{
    method:'PATCH',headers:getAuthHeaders(),body:JSON.stringify({op,tag}),
  });
  if(!res.ok) throw new Error(res.status===409?'CONFLICT: 標籤已變動':'標籤更新失敗');
  return res.json() as Promise<{keywords:string[];content_seq:number}>;
}

export async function deleteProblem(id: string) {
  const res = await requestApi(`${API_BASE}/problems/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to delete problem');
  return res.json();
}

export async function searchProblems(query: string, options: URLSearchParams = new URLSearchParams(),
  signal?: AbortSignal): Promise<SearchPage> {
  const params = new URLSearchParams(options);
  params.set('q', query.trim()); params.sort();
  const validatedShared = params.get('scope') === 'shared' && params.get('contributing') === 'yes' && !!params.get('collection_id') && !params.get('subscribed');
  const load = async (requestSignal?: AbortSignal, cached?: SearchPage): Promise<SearchPage> => {
    const headers = new Headers(getAuthHeaders(false));
    if (validatedShared && cached?.cache_validator) headers.set('If-None-Match', cached.cache_validator);
    const res = await requestApi(`${API_BASE}/search?${params}`, { headers, signal: requestSignal });
    if (res.status === 304 && cached?.cache_validator) return cached;
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as {error?: {message?: string}};
      throw new Error(data.error?.message || (res.status === 401 ? '登入已失效，請重新登入。' : '搜尋暫時無法使用，請稍後重試。'));
    }
    const page: SearchPage = await res.json();
    return validatedShared ? { ...page, cache_validator: res.headers.get('ETag') || undefined,
      cache_version: res.headers.get('X-Redolve-Collection-Version') || undefined } : page;
  };
  // Shared lists always reach the server: a 304 follows current contributor authorization.
  if (validatedShared) return questionListCache.readValidated(`${API_BASE}/search?${params}`, load, signal);
  return params.get('scope') === 'mine' && ['owned', 'saved'].includes(params.get('origin') || '')
    ? questionListCache.read(`${API_BASE}/search?${params}`, load, signal) : load(signal);
}

export async function fetchApiKeys(): Promise<{ keys: ApiKeyItem[] }> {
  const res = await requestApi(`${API_BASE}/keys`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch API keys');
  return res.json();
}

export async function createApiKey(description?: string): Promise<{ key: string; key_prefix: string }> {
  const res = await requestApi(`${API_BASE}/keys`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error('Failed to create API key');
  return res.json();
}

export async function deleteApiKey(keyPrefix: string) {
  const res = await requestApi(`${API_BASE}/keys/${encodeURIComponent(keyPrefix)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to revoke API key');
  return res.json();
}

export async function createShareLink(
  id: string,
  allowInk = true,
  allowNotes = true,
  expiresAt: string | null = null
): Promise<{ token: string }> {
  const res = await requestApi(`${API_BASE}/problems/${id}/share`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      allow_ink: allowInk,
      allow_notes: allowNotes,
      expires_at: expiresAt,
    }),
  });
  if (!res.ok) throw new Error('產生分享連結失敗');
  return res.json();
}

export interface ShareLink {
  token: string;
  allow_ink: number;
  allow_notes: number;
  expires_at: string | null;
  created_at: string;
}

export async function listShareLinks(problemId: string): Promise<{ shares: ShareLink[] }> {
  const res = await requestApi(`${API_BASE}/problems/${encodeURIComponent(problemId)}/shares`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('無法載入現有分享連結');
  return res.json();
}

export async function revokeShareLink(problemId: string, token: string): Promise<{ status: string }> {
  const res = await requestApi(`${API_BASE}/problems/${problemId}/share/${token}`, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to revoke share link');
  return res.json();
}

export type SharedProblemData = {
 item: Partial<Item> & {topic_label?:string|null};
 share: {token:string;allow_ink:boolean;allow_notes?:boolean;fixed_version?:boolean};
 origin?: {kind:'personal'|'collection';provider_name?:string|null;can_visit?:boolean;title?:string;url?:string;visibility?:string;access_hint?:'login'|'switch_account'|'source_unavailable'};
};
export async function fetchSharedProblem(token: string, signal?:AbortSignal): Promise<SharedProblemData> {
 const base=WORKER_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
 const res=await requestApi(`${base}/share/${encodeURIComponent(token)}`,{signal});
 const data=await res.json() as SharedProblemData & {error?:{message?:string}};
 if(!res.ok)throw new Error(data.error?.message || '無法載入分享連結');
 return data;
}

export function getSharedImageUrl(token: string): string {
  const base = WORKER_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/share/${token}/image`;
}

export async function seedAdminTaxonomy(): Promise<{ status: string; count: number }> {
  const res = await requestApi(`${API_BASE}/admin/taxonomy/seed`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return res.json();
}

export async function syncSeedTaxonomiesApi(): Promise<{ status: string; message: string; count: number }> {
  const res = await requestApi(`${API_BASE}/taxonomy/sync-seed`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchAdminMe(): Promise<{ isAdmin: boolean }> {
  try {
    const res = await requestApi(`${API_BASE}/admin/me`, {
      headers: getAuthHeaders(false),
      credentials: 'include',
    });
    if (!res.ok) return { isAdmin: false };
    return res.json();
  } catch {
    return { isAdmin: false };
  }
}
