// In dev: Vite proxy routes /api → localhost:3001
// In prod: VITE_API_URL points to the Render backend
const BASE = import.meta.env.VITE_API_URL || '';

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}
