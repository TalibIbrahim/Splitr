import { Text, View } from 'react-native';
import { Check, Info } from 'lucide-react-native';
import { toPaisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { moneyA11yLabel } from '../../../lib/format-money';
import { useTheme } from '../../../theme';
import { Money } from '../../ui';

interface CheckPillProps {
  ok: boolean;
  okText: string;
  /** "Items are" . amount . "the subtotal", where the middle word is more/less. */
  prefix: string;
  suffix: string;
  /** actual − expected */
  difference: number;
}

/** A receipt check as a grey pill: icon + words (never colour alone). Mismatches name the amount via <Money>. */
export function CheckPill({ ok, okText, prefix, suffix, difference }: CheckPillProps) {
  const { colors } = useTheme();
  const Icon = ok ? Check : Info;
  const more = difference > 0;
  const abs = toPaisa(Math.abs(difference));
  const label = ok ? okText : `${prefix} ${moneyA11yLabel(abs)} ${more ? 'more' : 'less'} ${suffix}`;
  return (
    <View
      accessible
      accessibilityLabel={label}
      className="flex-row flex-wrap items-center gap-1 self-start rounded-button bg-chip px-3 py-2"
    >
      <Icon size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      {ok ? (
        <Text className="font-brico-bold text-body-small text-ink">{okText}</Text>
      ) : (
        <>
          <Text className="font-brico-bold text-body-small text-ink">{prefix}</Text>
          <Money amount={abs} variant="body" />
          <Text className="font-brico-bold text-body-small text-ink">{`${more ? 'more' : 'less'} ${suffix}`}</Text>
        </>
      )}
    </View>
  );
}
