// Plain-fetch Google Drive v3 client. Scope needed: drive.file (the app only sees files it created).

export interface DriveBackup { id: string; name: string; date: string; modifiedTime: string }

/** The access token was rejected (401). The caller should refresh it or ask the user to sign in again. */
export class DriveAuthError extends Error {
  constructor(message = 'Drive rejected the access token') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

/** The request never reached Drive (offline, DNS, timeout). */
export class DriveNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DriveNetworkError';
  }
}

/** Drive answered with an unexpected HTTP error. */
export class DriveApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'DriveApiError';
  }
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Fino';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const BACKUP_NAME = /^fino-(\d{4}-\d{2}-\d{2})\.json$/;

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
  } catch (cause) {
    throw new DriveNetworkError(`Could not reach Google Drive: ${init.method ?? 'GET'} ${url}`, { cause });
  }
  if (res.status === 401) throw new DriveAuthError();
  if (!res.ok) {
    throw new DriveApiError(res.status, `Drive request failed with HTTP ${res.status}: ${init.method ?? 'GET'} ${url}`);
  }
  return res;
}

async function searchFiles(token: string, q: string, fields: string): Promise<Record<string, string>[]> {
  const params = new URLSearchParams({ q, fields: `files(${fields})`, spaces: 'drive', pageSize: '1000' });
  const res = await driveFetch(token, `${API}/files?${params.toString()}`);
  const body = (await res.json()) as { files?: Record<string, string>[] };
  return body.files ?? [];
}

async function findFolderId(token: string): Promise<string | null> {
  const files = await searchFiles(token, `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`, 'id');
  return files[0]?.id ?? null;
}

async function findOrCreateFolderId(token: string): Promise<string> {
  const existing = await findFolderId(token);
  if (existing) return existing;
  const res = await driveFetch(token, `${API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  return ((await res.json()) as { id: string }).id;
}

function multipartBody(boundary: string, metadata: object, content: string): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');
}

/** Creates `fino-<date>.json` in the Fino folder, or overwrites it when it already exists. */
export async function uploadDailyBackup(token: string, date: string, json: string): Promise<void> {
  const folderId = await findOrCreateFolderId(token);
  const name = `fino-${date}.json`;
  const existing = await searchFiles(token, `name = '${name}' and '${folderId}' in parents and trashed = false`, 'id');
  const boundary = `fino-${Date.now().toString(36)}`;
  const headers = { 'Content-Type': `multipart/related; boundary=${boundary}` };
  const existingId = existing[0]?.id;
  if (existingId) {
    await driveFetch(token, `${UPLOAD}/files/${existingId}?uploadType=multipart`, {
      method: 'PATCH', headers, body: multipartBody(boundary, { name }, json),
    });
  } else {
    await driveFetch(token, `${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST', headers, body: multipartBody(boundary, { name, parents: [folderId] }, json),
    });
  }
}

/** Backups in the Fino folder, newest first. Files not named fino-YYYY-MM-DD.json are ignored. */
export async function listBackups(token: string): Promise<DriveBackup[]> {
  const folderId = await findFolderId(token);
  if (!folderId) return [];
  const files = await searchFiles(token, `'${folderId}' in parents and trashed = false`, 'id,name,modifiedTime');
  const backups: DriveBackup[] = [];
  for (const f of files) {
    const match = BACKUP_NAME.exec(f.name ?? '');
    if (match) backups.push({ id: f.id, name: f.name, date: match[1], modifiedTime: f.modifiedTime });
  }
  return backups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function downloadBackup(token: string, id: string): Promise<string> {
  const res = await driveFetch(token, `${API}/files/${id}?alt=media`);
  return res.text();
}

export async function deleteBackup(token: string, id: string): Promise<void> {
  await driveFetch(token, `${API}/files/${id}`, { method: 'DELETE' });
}
