import axios from 'axios';

export const http = axios.create({
  baseURL: '/api',
  timeout: 30000
});

http.interceptors.request.use((config) => {
  return config;
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error?.response?.data;
    const status = error?.response?.status;
    const message = extractErrorMessage(data) || statusMessage(status, error) || error.message || '请求失败';
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

function statusMessage(status?: number, error?: unknown) {
  if (status === 401) return '网盘服务未能进入免登录模式，请确认后端服务和数据库已启动';
  if (status === 403) return '当前网盘操作没有权限或空间受限';
  if (isApiProxyFailure(status, error)) {
    return '无法连接后端服务，请先启动 moya_portal_banked，并确认前端代理目标为 http://127.0.0.1:8081。';
  }
  return '';
}

function isApiProxyFailure(status?: number, error?: unknown) {
  const message = readErrorText(error).toLowerCase();
  if (!message.includes('status code 500') && !message.includes('econnrefused') && !message.includes('proxy')) return false;
  const config = (error as { config?: { url?: string } } | undefined)?.config;
  return status === 500 && typeof config?.url === 'string' && config.url.startsWith('/product-video/');
}

function readErrorText(error: unknown) {
  if (!error || typeof error !== 'object') return String(error || '');
  const body = error as Record<string, unknown>;
  return [
    body.message,
    (body.cause as Record<string, unknown> | undefined)?.message,
    (body.response as Record<string, unknown> | undefined)?.data
  ].filter((item) => typeof item === 'string').join(' ');
}
