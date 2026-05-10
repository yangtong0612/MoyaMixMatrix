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
    const message = error?.response?.data?.message || error.message || '请求失败';
    return Promise.reject(new Error(message));
  }
);
