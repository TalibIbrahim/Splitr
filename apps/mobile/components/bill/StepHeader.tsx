import { Pressable, Text, View } from 'react-native';
import { sizes } from '@splitr/design-tokens';

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
  return (
    <View accessibilityRole="tablist" className="flex-row">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="tab"
            accessibilityLabel={`Step ${i + 1} of ${STEPS.length}: ${s.label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onStep(s.key)}
            style={{ minHeight: sizes.minTouch }}
            className="flex-1 items-center justify-center gap-1 active:opacity-pressed"
          >
            <Text
              className={`text-body-small ${active ? 'font-brico-extrabold text-ink' : 'font-brico-medium text-muted'}`}
            >
              {s.label}
            </Text>
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
