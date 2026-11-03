import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Check, ChevronLeft, Download, Info, Lock, Upload } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { exportData, parseBackup, splitrStore, useSplitr } from '../store';
import { useTheme } from '../theme';
import { announce } from '../lib/a11y';
import { deleteCacheFile } from '../lib/receipt-files';
import { formatBillDate } from '../lib/format-date';
import { Button, ModalSheet, TextField } from '../components/ui';
import { ScanHelpSection } from '../components/settings/ScanHelpSection';
import { UpdatesSection } from '../components/settings/UpdatesSection';

type Status = { kind: 'ok' | 'error'; text: string } | null;
type Mode = 'merge' | 'replace';
type PendingRestore = Extract<ReturnType<typeof parseBackup>, { ok: true }>['root'];

const FAIL_TEXT = {
  'not-json': "That file isn't a backup. It couldn't be read as data.",
  'not-a-backup': "That file isn't a Splitr backup.",
  'newer-version': 'That backup is from a newer version of Splitr. Update the app, then try again.',
  invalid: 'That backup looks damaged, so nothing was changed.',
} as const;

const pad = (n: number): string => String(n).padStart(2, '0');

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateWithYear(iso: string): string {
  return `${formatBillDate(iso)} ${iso.slice(0, 4)}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const myName = useSplitr((s) => s.root.me?.displayName ?? '');
  const lastBackupAt = useSplitr((s) => s.root.meta?.lastBackupAt);
  const [name, setName] = useState(myName);
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => {
    if (status) announce(status.text);
  }, [status]);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const trimmed = name.trim();
  const canSaveName = trimmed.length > 0 && trimmed !== myName;

  const saveName = (): void => {
    if (!canSaveName) return;
    splitrStore.getState().onboard(trimmed);
    setStatus({ kind: 'ok', text: 'Name saved.' });
  };

  const backUp = async (): Promise<void> => {
    setBusy('backup');
    setStatus(null);
    try {
      const text = exportData(splitrStore.getState().root);
      const file = new File(Paths.cache, `splitr-backup-${today()}.json`);
      file.create({ overwrite: true });
      await file.write(text);
      if (!(await Sharing.isAvailableAsync())) {
        deleteCacheFile(file.uri);
        setStatus({ kind: 'error', text: "Sharing isn't available on this device, so the backup wasn't sent anywhere." });
        return;
      }
      try {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: 'Save your Splitr backup',
        });
      } finally {
        deleteCacheFile(file.uri); // D33: don't leave a copy of all data in the cache
      }
      splitrStore.getState().setLastBackupAt(new Date().toISOString());
      setStatus({ kind: 'ok', text: 'Backup ready. Keep the file somewhere safe.' });
    } catch {
      setStatus({ kind: 'error', text: "Couldn't create the backup. Nothing was changed. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const pickBackup = async (): Promise<void> => {
    setBusy('restore');
    setStatus(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = picked.canceled ? undefined : picked.assets[0];
      if (!asset) return;
      const text = await new File(asset.uri).text();
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        setStatus({ kind: 'error', text: FAIL_TEXT[parsed.reason] });
        return;
      }
      setPending(parsed.root);
    } catch {
      setStatus({ kind: 'error', text: "Couldn't open that file. Nothing was changed." });
    } finally {
      setBusy(null);
    }
  };

  const closeRestore = (): void => {
    setPending(null);
    setConfirmReplace(false);
  };

  const restore = (mode: Mode): void => {
    if (!pending) return;
    try {
      splitrStore.getState().restoreBackup(pending, mode);
      setStatus({
        kind: 'ok',
        text: mode === 'merge' ? 'Backup merged into your data.' : 'Your data was replaced with the backup.',
      });
    } catch {
      setStatus({ kind: 'error', text: "Couldn't restore that backup. Nothing was changed." });
    }
    closeRestore();
  };

  const version = Constants.expoConfig?.version ?? 'unknown';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center gap-1 px-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
            className="items-center justify-center active:opacity-pressed"
          >
            <ChevronLeft size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          </Pressable>
          <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
            Settings
          </Text>
        </View>

        <ScrollView contentContainerClassName="gap-5 px-4 pb-8 pt-2" keyboardShouldPersistTaps="handled">
          {status ? (
            <View
              accessibilityLiveRegion="polite"
              className={`flex-row items-center gap-2 rounded-button bg-chip p-3 ${
                status.kind === 'error' ? 'border-2 border-ink' : ''
              }`}
            >
              {status.kind === 'ok' ? (
                <Check size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              ) : (
                <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              )}
              <Text
                className={`flex-1 text-body-small text-ink ${
                  status.kind === 'error' ? 'font-brico-extrabold' : 'font-brico-bold'
                }`}
              >
                {status.text}
              </Text>
            </View>
          ) : null}

          <View className="gap-2">
            <Text className="font-brico-extrabold text-item-name text-ink">Your name</Text>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              accessibilityLabel="Your name"
              returnKeyType="done"
              onSubmitEditing={saveName}
              maxLength={40}
            />
            <Button
              label="Save name"
              accessibilityLabel="Save your name"
              disabled={!canSaveName}
              onPress={saveName}
            />
          </View>

          <View className="gap-2 rounded-card bg-surface-2 p-4">
            <Text className="font-brico-extrabold text-item-name text-ink">Your data</Text>
            <Text className="font-brico-medium text-body-small text-muted">
              {lastBackupAt ? `Last backup: ${dateWithYear(lastBackupAt)}` : 'Never backed up.'}
            </Text>
            <Text className="font-brico-medium text-body-small text-muted">
              Receipt photos stay on this phone and aren't part of a backup.
            </Text>
            <View className="gap-2 pt-1">
              <Button
                label="Back up data"
                icon={Download}
                fullWidth
                loading={busy === 'backup'}
                disabled={busy !== null}
                accessibilityLabel="Back up your data to a file"
                onPress={() => void backUp()}
              />
              <Button
                label="Restore from backup"
                icon={Upload}
                variant="outline"
                fullWidth
                loading={busy === 'restore'}
                disabled={busy !== null}
                accessibilityLabel="Restore your data from a backup file"
                onPress={() => void pickBackup()}
              />
            </View>
          </View>

          <UpdatesSection />

          <ScanHelpSection />

          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              <Lock size={sizes.icon.sm} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
              <Text className="flex-1 font-brico-semibold text-meta text-muted">
                Splitr works entirely on your phone. Your bills, friends' names and card labels (never card numbers) are stored only on this device, and receipts are read by on-device text recognition. No accounts, no analytics, no ads, no tracking — the app has no servers. Nothing leaves your phone unless you share a bill or a backup yourself. Splitr checks GitHub for new versions at most once a day; nothing about you is sent. You can turn this off. Deleting the app erases everything; keep a backup if you want to move phones.
              </Text>
            </View>
            <Text accessibilityLabel={`Version ${version}`} className="font-brico-semibold text-meta text-muted">
              Version {version}
            </Text>
          </View>

          {__DEV__ ? (
            <Button
              label="Component gallery (dev)"
              accessibilityLabel="Open the component gallery, development builds only"
              variant="outline"
              onPress={() => router.push('/dev/components')}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ModalSheet
        visible={pending !== null}
        onClose={closeRestore}
        title={confirmReplace ? 'Replace everything?' : 'Restore this backup'}
        closeLabel="Close restore options"
        className="gap-3"
      >
        {confirmReplace ? (
          <>
            <Text className="font-brico-medium text-body text-ink">
              This swaps all bills, people and crews on this phone for the ones in the backup. It can't be undone.
            </Text>
            <Button
              label="Replace my data"
              variant="destructive"
              size="lg"
              fullWidth
              accessibilityLabel="Replace all my data with the backup"
              onPress={() => restore('replace')}
            />
            <Button
              label="Back"
              variant="outline"
              size="lg"
              fullWidth
              accessibilityLabel="Go back to restore options"
              onPress={() => setConfirmReplace(false)}
            />
          </>
        ) : (
          <>
            <Text className="font-brico-medium text-body text-muted">
              Merge keeps what is here and adds what is new or newer in the backup. Replace swaps everything for the
              backup.
            </Text>
            <Button
              label="Merge"
              size="lg"
              fullWidth
              accessibilityLabel="Merge the backup into my data"
              onPress={() => restore('merge')}
            />
            <Button
              label="Replace…"
              variant="outline"
              size="lg"
              fullWidth
              accessibilityLabel="Replace my data with the backup"
              onPress={() => setConfirmReplace(true)}
            />
          </>
        )}
      </ModalSheet>
    </SafeAreaView>
  );
}
