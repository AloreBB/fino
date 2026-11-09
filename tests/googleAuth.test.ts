import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { DriveAuthError } from '../src/drive/driveClient';
import { getAccessToken, withDriveToken } from '../src/drive/googleAuth';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    getTokens: jest.fn(),
    clearCachedAccessToken: jest.fn(async () => null),
  },
  statusCodes: { SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED' },
  isSuccessResponse: jest.fn(),
}));

const getTokens = GoogleSignin.getTokens as jest.Mock;
const clearCachedAccessToken = GoogleSignin.clearCachedAccessToken as jest.Mock;

beforeEach(() => {
  getTokens.mockReset();
  clearCachedAccessToken.mockClear();
});

test('getAccessToken returns the access token', async () => {
  getTokens.mockResolvedValue({ idToken: 'id', accessToken: 'tok1' });
  await expect(getAccessToken()).resolves.toBe('tok1');
});

test('getAccessToken maps "no signed-in user" to DriveAuthError', async () => {
  getTokens.mockRejectedValue(Object.assign(new Error('getTokens requires a user to be signed in'), { code: 'getTokens' }));
  await expect(getAccessToken()).rejects.toBeInstanceOf(DriveAuthError);
});

test('getAccessToken rethrows unrelated native failures untouched', async () => {
  const boom = new Error('native exploded');
  getTokens.mockRejectedValue(boom);
  await expect(getAccessToken()).rejects.toBe(boom);
});

test('withDriveToken retries once with a fresh token after DriveAuthError, clearing the cached one', async () => {
  getTokens
    .mockResolvedValueOnce({ idToken: 'id', accessToken: 'stale' })
    .mockResolvedValueOnce({ idToken: 'id', accessToken: 'fresh' });
  const fn = jest.fn(async (token: string) => {
    if (token === 'stale') throw new DriveAuthError();
    return `ok:${token}`;
  });

  await expect(withDriveToken(fn)).resolves.toBe('ok:fresh');
  expect(clearCachedAccessToken).toHaveBeenCalledWith('stale');
  expect(fn).toHaveBeenCalledTimes(2);
});

test('withDriveToken gives up after one retry and surfaces DriveAuthError', async () => {
  getTokens.mockResolvedValue({ idToken: 'id', accessToken: 'bad' });
  const fn = jest.fn(async () => { throw new DriveAuthError(); });

  await expect(withDriveToken(fn)).rejects.toBeInstanceOf(DriveAuthError);
  expect(fn).toHaveBeenCalledTimes(2);
});

test('withDriveToken does not retry non-auth errors', async () => {
  getTokens.mockResolvedValue({ idToken: 'id', accessToken: 'tok' });
  const boom = new Error('other');
  const fn = jest.fn(async () => { throw boom; });

  await expect(withDriveToken(fn)).rejects.toBe(boom);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(clearCachedAccessToken).not.toHaveBeenCalled();
});
