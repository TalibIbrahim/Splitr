import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import type { Bill } from '@splitr/shared-types';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { selectPeople, splitrStore, useSplitr } from '../../../store';
import { announce } from '../../../lib/a11y';
import { Button } from '../../ui';
import { Field } from './Field';
import { ToggleChip } from './ToggleChip';

/** Quick "Who's at the table?" row so people can be fixed before the scanned items are applied. */
export function TableChips({ bill }: { bill: Bill }) {
  const people = useSplitr(selectPeople());
  const { colors } = useTheme();
  const [guestText, setGuestText] = useState('');
  const [adding, setAdding] = useState(false);

  const guests = bill.participants.filter((p) => p.personId === null);

  const removeOrWarn = (participantId: string, name: string) => {
    if (bill.participants.length <= 1) {
      announce('Keep at least one person at the table');
      return;
    }
    splitrStore.getState().removeParticipant(bill.id, participantId);
    announce(`${name} removed from the table`);
  };

  const toggle = (personId: string, name: string) => {
    const existing = bill.participants.find((p) => p.personId === personId);
    if (existing) {
      removeOrWarn(existing.id, name);
    } else {
      splitrStore.getState().addParticipant(bill.id, { personId });
      announce(`${name} added to the table`);
    }
  };

  const addGuest = () => {
    const g = guestText.trim();
    if (!g) return;
    splitrStore.getState().addParticipant(bill.id, { guestName: g });
    announce(`${g} added as a guest`);
    setGuestText('');
    setAdding(false);
  };

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
        Who's at the table?
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {people.map((p) => (
          <ToggleChip
            key={p.id}
            label={p.isMe ? `${p.displayName} (you)` : p.displayName}
            on={bill.participants.some((x) => x.personId === p.id)}
            onPress={() => toggle(p.id, p.displayName)}
            accessibilityLabel={`${p.displayName}${p.isMe ? ' (you)' : ''} at the table`}
          />
        ))}
        {guests.map((g) => (
          <ToggleChip
            key={g.id}
            label={`${g.displayName} (guest)`}
            on
            onPress={() => removeOrWarn(g.id, g.displayName)}
            accessibilityLabel={`Guest ${g.displayName} at the table. Tap to remove`}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add guest"
          accessibilityState={{ expanded: adding }}
          onPress={() => setAdding((a) => !a)}
          style={{ minHeight: sizes.minTouch }}
          className="flex-row items-center gap-2 rounded-pill border border-chip px-4 active:opacity-pressed"
        >
          <UserPlus size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="font-brico-semibold text-body text-ink">Add guest</Text>
        </Pressable>
      </View>
      {adding ? (
        <View className="flex-row items-start gap-2">
          <Field
            accessibilityLabel="Guest name"
            placeholder="Name"
            value={guestText}
            onChangeText={setGuestText}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={addGuest}
          />
          <Button
            label="Add"
            accessibilityLabel="Add this guest to the table"
            variant="outline"
            onPress={addGuest}
            disabled={guestText.trim().length === 0}
          />
        </View>
      ) : null}
    </View>
  );
}
