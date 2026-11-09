import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

/** Writes the backup JSON to a cache file and opens the share sheet. */
export async function exportToFile(json: string): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new Error('no hay forma de compartir archivos en este teléfono');
  }
  const name = `fino-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File(Paths.cache, name);
  const writer = file.writableStream().getWriter();
  try {
    await writer.write(new TextEncoder().encode(json));
  } finally {
    await writer.close();
  }
  await shareAsync(file.uri);
}

/** Lets the user pick a backup file. Returns null when they cancel. */
export async function importFromFile(): Promise<string | null> {
  const picked = await getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets?.[0]) return null;
  return new File(picked.assets[0].uri).text();
}
