import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { DriveAuthError } from './driveClient';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Android needs no webClientId here: it is only for ID tokens / server auth codes, and we only call
// Drive from the phone. The OAuth client is matched by package name + SHA-1 on the Google side.
let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ scopes: [DRIVE_FILE_SCOPE] });
  configured = true;
}

/** Interactive sign-in. Returns the account email, or null when the user dismisses the dialog. */
export async function signIn(): Promise<string | null> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  return isSuccessResponse(res) ? res.data.user.email : null;
}

export async function signOut(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut();
}

/** Email of the already signed-in account (restored silently after an app restart), or null. */
export async function currentEmail(): Promise<string | null> {
  ensureConfigured();
  const cached = GoogleSignin.getCurrentUser();
  if (cached) return cached.user.email;
  const res = await GoogleSignin.signInSilently();
  // 'noSavedCredentialFound' means nobody has signed in yet (or access was revoked): not an error.
  return res.type === 'success' ? res.data.user.email : null;
}

/** Access token for Drive. Throws DriveAuthError when nobody is signed in. */
export async function getAccessToken(): Promise<string> {
  ensureConfigured();
  try {
    return (await GoogleSignin.getTokens()).accessToken;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'getTokens' || err.code === 'SIGN_IN_REQUIRED') {
      throw new DriveAuthError('No Google account is signed in');
    }
    throw e;
  }
}

/**
 * Runs a Drive call with a token. The Android library caches access tokens, so after ~1 hour Drive
 * answers 401: clear the cached token (per the library docs) and retry exactly once with a fresh one.
 */
export async function withDriveToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken();
  try {
    return await fn(token);
  } catch (e) {
    if (!(e instanceof DriveAuthError)) throw e;
    await GoogleSignin.clearCachedAccessToken(token);
    return fn(await getAccessToken());
  }
}
