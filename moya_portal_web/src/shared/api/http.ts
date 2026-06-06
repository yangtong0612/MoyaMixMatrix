import axios, { AxiosHeaders, type AxiosAdapter, type AxiosRequestConfig, type AxiosResponse } from 'axios';

export const http = axios.create({
  baseURL: resolveApiBaseUrl(),
  adapter: createElectronApiAdapter(),
  timeout: 30000
});

http.interceptors.request.use((config) => {
  const accessToken = readAccessToken();
  if (accessToken) {
    const headers = AxiosHeaders.from(config.headers);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`);
    config.headers = headers;
  }
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
  if (isBackendConnectionFailure(status, error)) {
    return `无法连接后端服务，请先启动 moya_portal_banked，并确认 API 地址为 ${http.defaults.baseURL || '/api'}。`;
  }
  return '';
}

function isBackendConnectionFailure(status?: number, error?: unknown) {
  const message = readErrorText(error).toLowerCase();
  if (
    status === undefined
    && !message.includes('network error')
    && !message.includes('econnrefused')
    && !message.includes('failed to fetch')
    && !message.includes('unsupported protocol')
  ) {
    return false;
  }
  if (
    status !== undefined
    && !message.includes('status code 500')
    && !message.includes('econnrefused')
    && !message.includes('proxy')
  ) {
    return false;
  }
  const config = (error as { config?: { url?: string } } | undefined)?.config;
  return typeof config?.url === 'string' && isLocalBackendApiPath(config.url);
}

function isLocalBackendApiPath(url: string) {
  const path = readApiPath(url).replace(/^\/api\/?/, '').replace(/^\/+/, '');
  return /^(storage|viral|fission|product-video|drive|share|system)\//.test(path);
}

function readApiPath(url: string) {
  try {
    return new URL(url, typeof http.defaults.baseURL === 'string' ? http.defaults.baseURL : 'http://localhost/api').pathname;
  } catch {
    return url;
  }
}

function resolveApiBaseUrl() {
  const bridgeBaseUrl = readBridgeApiBaseUrl();
  if (bridgeBaseUrl && typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return bridgeBaseUrl;
  }
  return '/api';
}

function readBridgeApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  const bridge = (window as Window & { surgicol?: { app?: { apiBaseUrl?: string } } }).surgicol;
  const value = bridge?.app?.apiBaseUrl;
  return typeof value === 'string' ? value.replace(/\/+$/, '') : '';
}

function readAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem('access')?.trim() || '';
  } catch {
    return '';
  }
}

function createElectronApiAdapter(): AxiosAdapter | undefined {
  const requester = readBridgeApiRequester();
  if (!requester || typeof window === 'undefined' || window.location.protocol !== 'file:') return undefined;
  return async (config) => {
    try {
      const bridgeResponse = await requester({
        url: buildRequestUrl(config),
        method: (config.method || 'GET').toUpperCase(),
        headers: normalizeRequestHeaders(config.headers),
        data: config.data,
        timeout: config.timeout
      });
      const response: AxiosResponse = {
        data: bridgeResponse.data,
        status: bridgeResponse.status,
        statusText: bridgeResponse.statusText,
        headers: bridgeResponse.headers,
        config,
        request: null
      };
      const validateStatus = config.validateStatus || ((status: number) => status >= 200 && status < 300);
      if (!validateStatus(response.status)) {
        const error = new Error(`Request failed with status code ${response.status}`) as Error & {
          config?: AxiosRequestConfig;
          response?: AxiosResponse;
        };
        error.config = config;
        error.response = response;
        throw error;
      }
      return response;
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(String(error || '请求失败'));
      (nextError as Error & { config?: AxiosRequestConfig }).config = config;
      throw nextError;
    }
  };
}

function readBridgeApiRequester() {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & {
    surgicol?: { app?: { requestApi?: (request: unknown) => Promise<{
      status: number;
      statusText: string;
      headers: Record<string, string>;
      data: unknown;
    }> } }
  }).surgicol?.app?.requestApi;
}

function buildRequestUrl(config: AxiosRequestConfig) {
  const baseURL = typeof config.baseURL === 'string' ? config.baseURL : '';
  const rawUrl = String(config.url || '');
  const combined = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${baseURL.replace(/\/+$/, '')}/${rawUrl.replace(/^\/+/, '')}`;
  const url = new URL(combined, baseURL || 'http://localhost/api');
  const params = config.params;
  if (params && typeof params === 'object') {
    Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

function normalizeRequestHeaders(headers: unknown) {
  if (!headers || typeof headers !== 'object') return {};
  const headerSource = headers as { toJSON?: () => Record<string, unknown> };
  const rawHeaders = typeof headerSource.toJSON === 'function' ? headerSource.toJSON() : headerSource as Record<string, unknown>;
  return Object.entries(rawHeaders).reduce<Record<string, string>>((nextHeaders, [key, value]) => {
    if (value === undefined || value === null) return nextHeaders;
    nextHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
    return nextHeaders;
  }, {});
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
