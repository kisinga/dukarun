import { environment } from '../../environments/environment';

export function appUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(path, `${environment.appPublicUrl.replace(/\/+$/, '')}/`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}
