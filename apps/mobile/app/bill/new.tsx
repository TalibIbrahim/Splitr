import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type TextInputInstance } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, Minus, Plus, ScanLine, UserPlus, X } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { selectBill, selectGroups, selectLatestGroup, selectPeople, splitrStore, useSplitr } from '../../store';
import { isIsoDate, shiftDay, todayIso } from '../../lib/date';
import { Button } from '../../components/ui';
import { Field } from '../../components/bill/flow/Field';
import { FlowScreen } from '../../components/bill/flow/FlowScreen';
import { ToggleChip } from '../../components/bill/flow/ToggleChip';
import { HOME_HREF, billHref } from '../../components/bill/flow/nav';
import { ScanStatus } from '../../components/bill/flow/ScanStatus';
import { useReceiptScan } from '../../components/bill/flow/useReceiptScan';


function SectionTitle({ children }: { children: string }) {
  return <Text className="font-brico-extrabold text-item-name text-ink">{children}</Text>;
}

export default function NewBillScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const latest = useSplitr(selectLatestGroup());

  const people = useSplitr(selectPeople());
  const groups = useSplitr(selectGroups());
  const me = people.find((p) => p.isMe);

  // Initial crew: ?groupId=, else the latest crew, else one-off.
  const initialGroup = useMemo(() => {
    const fromParam = typeof params.groupId === 'string' ? groups.find((g) => g.id === params.groupId) : undefined;
    return fromParam ?? latest ?? null;
  }, []);

  const membersOf = (groupId: string | null): string[] => {
    const g = groups.find((x) => x.id === groupId);
    const ids = g ? g.memberIds.filter((id) => people.some((p) => p.id === id)) : [];
    return me && !ids.includes(me.id) ? [me.id, ...ids] : ids;
  };

  const [groupId, setGroupId] = useState<string | null>(initialGroup?.id ?? null);
  const [picked, setPicked] = useState<string[]>(() => membersOf(initialGroup?.id ?? null));
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => todayIso());
  const [guests, setGuests] = useState<string[]>([]);
  const [guestText, setGuestText] = useState('');
  const guestRef = useRef<TextInputInstance>(null);

  const dateOk = isIsoDate(date);
  const nameOk = name.trim().length > 0;
  const headcount = picked.length + guests.length;
  const canCreate = nameOk && dateOk && headcount > 0;

  const pickCrew = (id: string | null) => {
    setGroupId(id);
    setPicked(membersOf(id));
  };
  const togglePerson = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const addGuest = () => {
    const g = guestText.trim();
    if (!g) return;
    setGuests((cur) => [...cur, g]);
    setGuestText('');
    guestRef.current?.focus();
  };

  const makeBill = () =>
    splitrStore.getState().createBill({
      groupId,
      restaurantName: name.trim(),
      date,
      participantPersonIds: picked,
      guests,
    });

  // A scan creates its bill once a photo exists (so a cancelled capture leaves nothing behind). That bill is
  // reused by every later action here, after catching it up with whatever was edited on this form since.
  const scanBillId = useRef<string | null>(null);
  const handedOff = useRef(false);

  const syncScanBill = () => {
    const bid = scanBillId.current;
    if (!bid) return;
    const act = splitrStore.getState();
    const bill = selectBill(bid)(act);
    if (!bill) return;
    act.updateBillMeta(bid, { restaurantName: name.trim(), date });
    for (const p of bill.participants) {
      const keep = p.personId !== null ? picked.includes(p.personId) : guests.includes(p.displayName);
      if (!keep) act.removeParticipant(bid, p.id);
    }
    for (const pid of picked) {
      if (!bill.participants.some((p) => p.personId === pid)) act.addParticipant(bid, { personId: pid });
    }
    for (const g of guests) {
      if (!bill.participants.some((p) => p.personId === null && p.displayName === g)) {
        act.addParticipant(bid, { guestName: g });
      }
    }
  };
  const syncRef = useRef(syncScanBill);
  syncRef.current = syncScanBill;

  const create = () => {
    if (!canCreate) return;
    let bid = scanBillId.current;
    if (bid) syncScanBill();
    else bid = makeBill();
    handedOff.current = true;
    router.replace(billHref(bid, 'items'));
  };

  // Never leave an orphan: leaving this screen without handing the scan bill on removes it.
  useEffect(
    () => () => {
      const bid = scanBillId.current;
      if (bid && !handedOff.current) splitrStore.getState().deleteBill(bid);
    },
    [],
  );

  const ensureBill = useCallback(() => {
    scanBillId.current ??= makeBill();
    return scanBillId.current;
  }, [groupId, name, date, picked, guests]);
  const onScanned = useCallback(
    (id: string) => {
      syncRef.current();
      handedOff.current = true;
      router.replace(billHref(id, 'review'));
    },
    [router],
  );
  const scan = useReceiptScan({ ensureBill, onDone: onScanned });
  const canScan = dateOk && headcount > 0;
  const typeItInAfterScan = () => {
    scan.reset();
    if (scanBillId.current) {
      syncScanBill();
      handedOff.current = true;
      router.replace(billHref(scanBillId.current, 'items'));
    } else create();
  };

  const scanHint = !dateOk ? 'Use the date format YYYY-MM-DD' : headcount === 0 ? 'Pick at least one person' : null;
  const nextHint = !nameOk
    ? 'Name the restaurant to type the items in'
    : !dateOk
      ? 'Use the date format YYYY-MM-DD'
      : headcount === 0
        ? 'Pick at least one person'
        : null;

  if (scan.state.kind !== 'idle') {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
        <ScanStatus
          state={scan.state}
          onRetry={() => void scan.retry()}
          onStart={(m) => void scan.start(m)}
          onTypeItIn={typeItInAfterScan}
          onBack={scan.reset}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel new bill"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(HOME_HREF))}
          style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
          className="items-center justify-center rounded-pill active:opacity-pressed"
        >
          <X size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </Pressable>
        <Text className="flex-1 font-brico-extrabold text-screen-title text-ink">New bill</Text>
      </View>

      <FlowScreen
        footer={
          <View>
            {scanHint ?? nextHint ? (
              <Text className="px-4 pt-2 text-center font-brico-semibold text-meta text-muted">
                {scanHint ?? nextHint}
              </Text>
            ) : null}
            <View className="gap-2 px-4 pb-2 pt-3">
              <Button
                label="Scan receipt"
                accessibilityLabel="Scan the receipt with the camera"
                icon={ScanLine}
                size="lg"
                fullWidth
                disabled={!canScan}
                onPress={() => void scan.start('scan')}
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Choose photo"
                    accessibilityLabel="Choose a photo of the receipt"
                    icon={ImageIcon}
                    variant="outline"
                    fullWidth
                    disabled={!canScan}
                    onPress={() => void scan.start('library')}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label="Type it in"
                    accessibilityLabel="Type the items in by hand"
                    variant="outline"
                    fullWidth
                    disabled={!canCreate}
                    onPress={create}
                  />
                </View>
              </View>
            </View>
          </View>
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-5 px-4 pb-6 pt-2"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2">
            <SectionTitle>Restaurant</SectionTitle>
            <Field
              accessibilityLabel="Restaurant name"
              placeholder="Where are you eating?"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <View className="gap-2">
            <SectionTitle>Date</SectionTitle>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One day earlier"
                onPress={() => setDate((d) => shiftDay(d, -1))}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className="items-center justify-center rounded-button bg-surface-2 active:opacity-pressed"
              >
                <Minus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
              <Field
                accessibilityLabel="Bill date, year-month-day"
                value={date}
                onChangeText={setDate}
                align="center"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                error={dateOk ? undefined : 'Use the format YYYY-MM-DD'}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One day later"
                onPress={() => setDate((d) => shiftDay(d, 1))}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className="items-center justify-center rounded-button bg-surface-2 active:opacity-pressed"
              >
                <Plus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
            </View>
          </View>

          <View className="gap-2">
            <SectionTitle>Crew</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <ToggleChip
                label="One-off"
                on={groupId === null}
                onPress={() => pickCrew(null)}
                accessibilityLabel="One-off bill, no crew"
              />
              {groups.map((g) => (
                <ToggleChip
                  key={g.id}
                  label={g.name}
                  on={groupId === g.id}
                  onPress={() => pickCrew(g.id)}
                  accessibilityLabel={`Crew ${g.name}`}
                />
              ))}
            </ScrollView>
          </View>

          <View className="gap-2">
            <SectionTitle>Who is at the table?</SectionTitle>
            <View className="flex-row flex-wrap gap-2">
              {people.map((p) => (
                <ToggleChip
                  key={p.id}
                  label={p.isMe ? `${p.displayName} (you)` : p.displayName}
                  on={picked.includes(p.id)}
                  onPress={() => togglePerson(p.id)}
                  accessibilityLabel={`${p.displayName}${p.isMe ? ' (you)' : ''} at the table`}
                />
              ))}
              {guests.map((g, i) => (
                <Pressable
                  key={`${g}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove guest ${g}`}
                  onPress={() => setGuests((cur) => cur.filter((_, j) => j !== i))}
                  style={{ minHeight: sizes.minTouch }}
                  className="flex-row items-center gap-2 rounded-pill bg-ink px-4 active:opacity-pressed"
                >
                  <Text className="font-brico-extrabold text-body text-bg">{g} (guest)</Text>
                  <X size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} />
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <SectionTitle>Add guest</SectionTitle>
            <View className="flex-row items-start gap-2">
              <Field
                inputRef={guestRef}
                accessibilityLabel="Guest name"
                placeholder="Name"
                value={guestText}
                onChangeText={setGuestText}
                autoCapitalize="words"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={addGuest}
              />
              <Button
                label="Add"
                accessibilityLabel="Add guest"
                icon={UserPlus}
                variant="outline"
                onPress={addGuest}
                disabled={guestText.trim().length === 0}
              />
            </View>
          </View>
        </ScrollView>
      </FlowScreen>
    </SafeAreaView>
  );
}
