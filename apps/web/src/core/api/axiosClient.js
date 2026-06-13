import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenManager';

export const axiosClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for sending/receiving HttpOnly cookies
});

// Flag to prevent multiple refresh calls simultaneously
let isRefreshing = false;
// Queue for pending requests while refreshing
let pendingRequests = [];

const processQueue = (error, token = null) => {
  pendingRequests.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  pendingRequests = [];
};

// Request Interceptor
axiosClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor
axiosClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (
      error.response?.status === 401 &&
      originalRequest.url !== '/auth/refresh' &&
      originalRequest.url !== '/auth/login' &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        // If already refreshing, queue the request
        return new Promise(function (resolve, reject) {
          pendingRequests.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest._retry = true; // Prevent queued request from triggering another refresh
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Call the refresh endpoint
        // It relies on HttpOnly cookie being sent automatically
        const { data } = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true
        });

        const newToken = data.data.accessToken;
        setAccessToken(newToken);
        
        processQueue(null, newToken);
        
        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosClient(originalRequest);
      } catch (err) {
        processQueue(err, null);
        clearAccessToken();
        
        // Optionally redirect to login or trigger an event to log out the user in AuthContext
        window.dispatchEvent(new Event('auth:logout'));
        
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
