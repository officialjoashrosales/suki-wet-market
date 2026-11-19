import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { exportAll, importAll } from '@/db/repo';

const MARKER = 'suki-autobackup.txt';
const AUTO_DATA = 'suki-autobackup.json';

export async function exportToShare(): Promise<string> {
  const payload = await exportAll();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new File(Paths.cache, `suki-backup-${stamp}.json`);
  if (file.exists) file.delete();
  await file.write(JSON.stringify(payload, null, 2));

  // Phones do not always have an app that accepts a JSON share. Let the user
  // pick a real folder (Downloads, Drive, SD card) instead.
  if (Platform.OS === 'android') {
    let folder: Directory | null = null;
    try {
      folder = await Directory.pickDirectoryAsync();
    } catch {
      return 'Export cancelled';
    }
    if (!folder) return 'Export cancelled';
    const target = new File(folder, file.name);
    if (target.exists) target.delete();
    await file.copy(target);
    return `Saved ${file.name}`;
  }

  if (!(await Sharing.isAvailableAsync())) {
    return `Saved to ${file.uri}`;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Suki backup',
    UTI: 'public.json',
  });
  return 'Backup shared';
}

export async function pickAndImport(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const file = new File(result.assets[0].uri);
  const raw = await file.text();
  const parsed = JSON.parse(raw);
  const { imported } = await importAll(parsed);
  return `Imported ${imported} records`;
}

/** Keeps one rolling local backup, refreshed at most once a week. */
export async function maybeAutoBackup(): Promise<void> {
  try {
    const marker = new File(Paths.document, MARKER);
    if (marker.exists) {
      const last = new Date((await marker.text()).trim()).getTime();
      if (Number.isFinite(last) && Date.now() - last < 7 * 86400000) return;
    }
    const payload = await exportAll();
    const data = new File(Paths.document, AUTO_DATA);
    if (data.exists) data.delete();
    await data.write(JSON.stringify(payload));
    await marker.write(new Date().toISOString());
  } catch {
    // Backup failures must never block the app.
  }
}
