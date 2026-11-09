import {
  DriveAuthError, DriveNetworkError, DriveApiError,
  deleteBackup, downloadBackup, listBackups, uploadDailyBackup,
} from '../src/drive/driveClient';

type Call = { url: string; method: string; body?: string; auth?: string };
type Handler = (c: Call) => { status?: number; json?: unknown; text?: string } | undefined;

let calls: Call[];

function mockFetch(handler: Handler) {
  calls = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url: String(input), method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      auth: headers.Authorization,
    };
    calls.push(call);
    const r = handler(call);
    if (!r) throw new Error(`unexpected request ${call.method} ${call.url}`);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => r.json, text: async () => r.text ?? JSON.stringify(r.json ?? ''),
    } as Response;
  }) as unknown as typeof fetch;
}

const decoded = (url: string) => decodeURIComponent(url.replace(/\+/g, ' '));
const isFolderSearch = (c: Call) => c.method === 'GET' && decoded(c.url).includes("name = 'Fino'");
const isFileSearch = (c: Call) => c.method === 'GET' && decoded(c.url).includes("'folder1' in parents");

describe('uploadDailyBackup', () => {
  test('creates folder Fino when absent, then creates the daily file', async () => {
    mockFetch((c) => {
      if (isFolderSearch(c)) return { json: { files: [] } };
      if (c.method === 'POST' && c.url.endsWith('/drive/v3/files')) return { json: { id: 'folder1' } };
      if (isFileSearch(c)) return { json: { files: [] } };
      if (c.method === 'POST' && c.url.includes('/upload/drive/v3/files?uploadType=multipart')) return { json: { id: 'file1' } };
      return undefined;
    });

    await uploadDailyBackup('tok', '2026-11-05', '{"a":1}');

    const folderSearch = calls.find(isFolderSearch)!;
    expect(decoded(folderSearch.url)).toContain('trashed = false');
    expect(decoded(folderSearch.url)).toContain("mimeType = 'application/vnd.google-apps.folder'");
    const folderCreate = calls.find((c) => c.method === 'POST' && c.url.endsWith('/drive/v3/files'))!;
    expect(JSON.parse(folderCreate.body!)).toEqual({ name: 'Fino', mimeType: 'application/vnd.google-apps.folder' });
    const create = calls.find((c) => c.url.includes('/upload/drive/v3/files'))!;
    expect(create.method).toBe('POST');
    expect(create.body).toContain('"name":"fino-2026-11-05.json"');
    expect(create.body).toContain('"parents":["folder1"]');
    expect(create.body).toContain('{"a":1}');
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
  });

  test('reuses an existing folder and file: PATCHes the existing id', async () => {
    mockFetch((c) => {
      if (isFolderSearch(c)) return { json: { files: [{ id: 'folder1' }] } };
      if (isFileSearch(c)) {
        expect(decoded(c.url)).toContain("name = 'fino-2026-11-05.json'");
        expect(decoded(c.url)).toContain('trashed = false');
        return { json: { files: [{ id: 'file9' }] } };
      }
      if (c.method === 'PATCH' && c.url.includes('/upload/drive/v3/files/file9?uploadType=multipart')) return { json: { id: 'file9' } };
      return undefined;
    });

    await uploadDailyBackup('tok', '2026-11-05', '{"b":2}');

    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toContain('{"b":2}');
  });

  test('a 401 raises DriveAuthError', async () => {
    mockFetch(() => ({ status: 401, json: { error: { message: 'Invalid Credentials' } } }));
    await expect(uploadDailyBackup('bad', '2026-11-05', '{}')).rejects.toBeInstanceOf(DriveAuthError);
  });

  test('a fetch rejection raises DriveNetworkError', async () => {
    globalThis.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(uploadDailyBackup('tok', '2026-11-05', '{}')).rejects.toBeInstanceOf(DriveNetworkError);
  });

  test('other HTTP failures raise DriveApiError carrying the status', async () => {
    mockFetch(() => ({ status: 500, json: { error: { message: 'boom' } } }));
    const err = await uploadDailyBackup('tok', '2026-11-05', '{}').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveApiError);
    expect((err as DriveApiError).status).toBe(500);
  });
});

describe('listBackups', () => {
  test('sorts newest first and ignores names not matching fino-YYYY-MM-DD.json', async () => {
    mockFetch((c) => {
      if (isFolderSearch(c)) return { json: { files: [{ id: 'folder1' }] } };
      if (isFileSearch(c)) {
        return {
          json: {
            files: [
              { id: 'a', name: 'fino-2026-11-03.json', modifiedTime: '2026-11-03T10:00:00.000Z' },
              { id: 'b', name: 'notes.txt', modifiedTime: '2026-11-04T10:00:00.000Z' },
              { id: 'c', name: 'fino-2026-11-05.json', modifiedTime: '2026-11-05T10:00:00.000Z' },
              { id: 'd', name: 'fino-2026-11-5.json', modifiedTime: '2026-11-05T11:00:00.000Z' },
              { id: 'e', name: 'fino-2026-11-04.json.bak', modifiedTime: '2026-11-05T12:00:00.000Z' },
            ],
          },
        };
      }
      return undefined;
    });

    const list = await listBackups('tok');

    expect(list.map((f) => f.id)).toEqual(['c', 'a']);
    expect(list[0]).toEqual({ id: 'c', name: 'fino-2026-11-05.json', date: '2026-11-05', modifiedTime: '2026-11-05T10:00:00.000Z' });
  });

  test('returns an empty list, and creates nothing, when the Fino folder does not exist', async () => {
    mockFetch((c) => (isFolderSearch(c) ? { json: { files: [] } } : undefined));
    expect(await listBackups('tok')).toEqual([]);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('downloadBackup / deleteBackup', () => {
  test('downloadBackup returns the file text', async () => {
    mockFetch((c) => (c.method === 'GET' && c.url.includes('/drive/v3/files/f1?alt=media') ? { text: '{"x":1}' } : undefined));
    expect(await downloadBackup('tok', 'f1')).toBe('{"x":1}');
  });

  test('deleteBackup issues DELETE', async () => {
    mockFetch((c) => (c.method === 'DELETE' && c.url.endsWith('/drive/v3/files/f1') ? { status: 204, text: '' } : undefined));
    await deleteBackup('tok', 'f1');
    expect(calls).toHaveLength(1);
  });

  test('downloadBackup 401 raises DriveAuthError', async () => {
    mockFetch(() => ({ status: 401, text: '' }));
    await expect(downloadBackup('tok', 'f1')).rejects.toBeInstanceOf(DriveAuthError);
  });
});
