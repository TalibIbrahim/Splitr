import { AlertCircle, BadgeCheck, Check, CheckCheck, CircleDashed, type LucideIcon } from 'lucide-react-native';
import { Pill } from '../ui';

export type BillStateView = 'needs-review' | 'unassigned' | 'ready' | 'reconciled' | 'settled';

const MAP: Record<BillStateView, { icon: LucideIcon; label: string }> = {
  'needs-review': { icon: AlertCircle, label: 'Needs review' },
  unassigned: { icon: CircleDashed, label: 'Unassigned' },
  ready: { icon: Check, label: 'Ready to split' },
  reconciled: { icon: CheckCheck, label: 'Matches the receipt' },
  settled: { icon: BadgeCheck, label: 'Settled' },
};

interface StatePillProps {
  state: BillStateView;
  /** Appended after the label, e.g. "2 left" or "off by Rs 50". */
  detail?: string;
}

/** Bill state as a grey pill: icon + text, never colour alone. */
export function StatePill({ state, detail }: StatePillProps) {
  const { icon, label } = MAP[state];
  return <Pill tone="status" icon={icon} label={detail ? `${label} · ${detail}` : label} />;
}
