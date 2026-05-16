import axios from 'axios';

export const http = axios.create({
  baseURL: '/api',
  timeout: 30000
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error?.response?.data;
    const status = error?.response?.status;
    const message = extractErrorMessage(data) || statusMessage(status) || error.message || '请求失败';
    if ((status === 401 || status === 403) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('moya-auth-expired'));
    }
    return Promise.reject(new Error(message));
  }
);

function extractErrorMessage(data: unknown) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return '';
  const body = data as Record<string, unknown>;
  for (const key of ['message', 'detail', 'error', 'reason', 'title']) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function statusMessage(status?: number) {
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 403) return '登录已过期或没有权限，请重新登录';
  return '';
}
