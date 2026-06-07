import axios from "axios";

const BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message: string =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    return Promise.reject(new Error(message));
  }
);
