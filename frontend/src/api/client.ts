import axios from 'axios';

/** All API calls go through /api which Vite proxies to localhost:3000 */
const BASE_URL = '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000, // LLM calls (extraction + formatting) can take 30+ seconds
});

// Attach JWT on every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('semsar_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
apiClient.interceptors.response.use(
  (res) => res,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      localStorage.removeItem('semsar_token');
      localStorage.removeItem('semsar_user');
      window.dispatchEvent(new CustomEvent('semsar:logout'));
    }
    return Promise.reject(error);
  },
);
