// Centralized API configuration
// Update these values for your environment

const DEV_HOST = 'localhost'; // Use 10.0.2.2 for Android emulator
const DEV_PORT = 4000;

export const API_BASE_URL = `http://${DEV_HOST}:${DEV_PORT}`;
export const SOCKET_URL = `http://${DEV_HOST}:${DEV_PORT}`;
export const API_V1 = `${API_BASE_URL}/api/v1`;

// Supabase config (must match backend/lib/supabase.ts)
export const SUPABASE_URL = 'https://hbqmapyxlbturegnpvge.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicW1hcHl4bGJ0dXJlZ25wdmdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTAzNzMsImV4cCI6MjA4ODc4NjM3M30.IqIqhWOHFSAGMDPX8EDErnUtpjRjLOLmTGyqwFMnDDU';
