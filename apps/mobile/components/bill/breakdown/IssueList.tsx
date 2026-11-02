import { Text, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import type { Issue } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { formatMoney } from '../../../lib/format-money';
import { Button } from '../../ui';

export type FixTarget = 'items' | 'assign' | 'charges' | 'contributions';

export interface IssueView {
  key: string;
  text: string;
  fix: { label: string; target: FixTarget };
}

/** Maps engine issue codes to plain words and the screen that fixes them. Display only. */
export function describeIssues(errors: readonly Issue[]): IssueView[] {
  const out: IssueView[] = [];
  let itemCount = 0;
  errors.forEach((e, i) => {
    const key = `${e.code}-${i}`;
    switch (e.code) {
      case 'ITEM_UNASSIGNED':
      case 'ITEM_UNDER_ASSIGNED':
      case 'ITEM_OVER_ASSIGNED':
        itemCount += 1;
        return;
      case 'TOTAL_MISMATCH': {
        const d = e.difference ?? 0;
        out.push({
          key,
          text: `The total doesn't match the receipt: off by ${formatMoney(d < 0 ? -d : d)}.`,
          fix: { label: 'Fix', target: 'items' },
        });
        return;
      }
      case 'SUBTOTAL_MISMATCH':
      case 'LINE_ARITHMETIC_MISMATCH':
        out.push({ key, text: "An item's price doesn't add up with the receipt.", fix: { label: 'Fix', target: 'items' } });
        return;
      case 'ADJUSTMENT_INVALID_BASE':
      case 'ADJUSTMENT_PRINTED_MISMATCH':
        out.push({ key, text: 'A tax, discount or charge has a problem.', fix: { label: 'Fix', target: 'charges' } });
        return;
      case 'NEGATIVE_TOTAL':
      case 'NEGATIVE_SHARE':
        out.push({ key, text: 'A discount is bigger than what it applies to.', fix: { label: 'Fix', target: 'charges' } });
        return;
      case 'CONTRIBUTIONS_MISMATCH':
        out.push({
          key,
          text: 'What people paid no longer adds up to the bill total.',
          fix: { label: 'Reset who paid', target: 'contributions' },
        });
        return;
      default:
        out.push({ key, text: "Something in this bill doesn't add up.", fix: { label: 'Fix', target: 'items' } });
    }
  });
  if (itemCount > 0) {
    out.unshift({
      key: 'items-unassigned',
      text: itemCount === 1 ? '1 item still needs someone.' : `${itemCount} items still need someone.`,
      fix: { label: 'Assign', target: 'assign' },
    });
  }
  return out;
}

interface IssueListProps {
  issues: readonly IssueView[];
  onFix: (target: FixTarget) => void;
}

export function IssueList({ issues, onFix }: IssueListProps) {
  const { colors } = useTheme();
  return (
    <View className="gap-3">
      {issues.map((it) => (
        <View key={it.key} className="gap-3 rounded-card border-2 border-ink p-4">
          <View className="flex-row items-start gap-2">
            <AlertCircle size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="flex-1 font-brico-bold text-body text-ink">{it.text}</Text>
          </View>
          <Button
            label={it.fix.label}
            variant="outline"
            accessibilityLabel={`${it.fix.label}: ${it.text}`}
            onPress={() => onFix(it.fix.target)}
          />
        </View>
      ))}
    </View>
  );
}
