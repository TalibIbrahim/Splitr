import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { Button, ModalSheet, TextField } from '../ui';

interface MyCardsSheetProps {
  visible: boolean;
  onClose: () => void;
  cards: readonly { id: string; label: string }[];
  /** Distinct card products from the offers directory. */
  suggestions: readonly string[];
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
}

export function MyCardsSheet({ visible, onClose, cards, suggestions, onAdd, onRemove }: MyCardsSheetProps) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const have = new Set(cards.map((c) => c.label.trim().toLowerCase()));
  const open = suggestions.filter((s) => !have.has(s.trim().toLowerCase()));

  const add = (label: string) => {
    const t = label.trim();
    if (t === '' || have.has(t.toLowerCase())) return;
    onAdd(t);
    setText('');
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="My cards" closeLabel="Close my cards" className="gap-3">
      <Text className="font-brico-medium text-body-small text-muted">
        We only store a name for your card — never its number.
      </Text>

      {cards.length === 0 ? (
        <Text className="font-brico-medium text-body text-ink">No cards yet. Add one below.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {cards.map((c) => (
            <View key={c.id} className="flex-row items-center rounded-pill bg-chip pl-4">
              <Text className="font-brico-bold text-body-small text-ink">{c.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.label}`}
                onPress={() => onRemove(c.id)}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className="items-center justify-center active:opacity-pressed"
              >
                <X size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <TextField
        value={text}
        onChangeText={setText}
        placeholder="Card name, e.g. Platinum Debit"
        accessibilityLabel="Card name"
        returnKeyType="done"
        onSubmitEditing={() => add(text)}
        maxLength={60}
      />
      <Button
        label="Add card"
        accessibilityLabel="Add card"
        icon={Plus}
        disabled={text.trim() === ''}
        onPress={() => add(text)}
      />

      {open.length > 0 ? (
        <View className="gap-2">
          <Text className="font-brico-extrabold text-item-name text-ink">Cards in the directory</Text>
          <View className="flex-row flex-wrap gap-2">
            {open.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`Add ${s}`}
                onPress={() => add(s)}
                style={{ minHeight: sizes.minTouch }}
                className="flex-row items-center gap-1 rounded-pill bg-chip px-4 active:opacity-pressed"
              >
                <Plus size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                <Text className="font-brico-semibold text-body-small text-ink">{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ModalSheet>
  );
}
