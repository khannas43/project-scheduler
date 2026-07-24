import { apiRequest } from '../../lib/apiClient.js';
import type { AuthUser } from '../../stores/authStore.js';

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

export function loginRequest(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  });
}

export function refreshRequest(): Promise<RefreshResponse> {
  return apiRequest<RefreshResponse>('/api/auth/refresh', {
    method: 'POST',
    skipAuthRetry: true,
  });
}

export function logoutRequest(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', {
    method: 'POST',
    skipAuthRetry: true,
  });
}
