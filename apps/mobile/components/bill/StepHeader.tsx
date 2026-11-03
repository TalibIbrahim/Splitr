import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';

export type BillStep = 'items' | 'assign' | 'charges' | 'split';

const STEPS: readonly { key: BillStep; label: string }[] = [
  { key: 'items', label: 'Items' },
  { key: 'assign', label: 'Assign' },
  { key: 'charges', label: 'Charges' },
  { key: 'split', label: 'Split' },
];

interface StepHeaderProps {
  current: BillStep;
  onStep: (step: BillStep) => void;
}

/** Items · Assign · Charges · Split. Current step: heavier weight + ink bar (not colour alone). */
export function StepHeader({ current, onStep }: StepHeaderProps) {
  const { colors } = useTheme();
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <View accessibilityRole="tablist" className="flex-row">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const done = i < currentIndex;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="tab"
            accessibilityLabel={`Step ${i + 1} of ${STEPS.length}: ${s.label}${done ? ', done' : ''}`}
            accessibilityState={{ selected: active }}
            onPress={() => onStep(s.key)}
            style={{ minHeight: sizes.minTouch }}
            className="flex-1 items-center justify-center gap-1 active:opacity-pressed"
          >
            <View className="flex-row items-center gap-1">
              {done ? <Check size={sizes.icon.sm} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} /> : null}
              <Text
                className={`text-body-small ${active ? 'font-brico-extrabold text-ink' : 'font-brico-medium text-muted'}`}
              >
                {s.label}
              </Text>
            </View>
            <View
              style={{ width: sizes.tabIndicator.width, height: sizes.tabIndicator.height }}
              className={`rounded-pill ${active ? 'bg-ink' : 'bg-chip'}`}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
