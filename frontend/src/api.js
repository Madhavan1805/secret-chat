import axios from 'axios';
import { API_ORIGIN, getToken } from './config';
import { forgetAccount, wipeSession } from './accounts';

const api = axios.create({
    // baseURL: 'http://127.0.0.1:8000/api/',
    baseURL: `${API_ORIGIN}/api/`,
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Token ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (error.response && error.response.status === 401) {
            console.error("Unauthorized! Redirecting to login...");
            forgetAccount(getToken());      // only THIS login is dead; the other accounts on the phone stay
            wipeSession();
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;