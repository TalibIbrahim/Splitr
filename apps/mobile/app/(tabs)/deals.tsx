import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tag } from 'lucide-react-native';
import { EmptyState } from '../../components/bill';

export default function Deals() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="flex-1 justify-center">
        <EmptyState icon={Tag} title="Deals" body="Card offers are coming soon." />
      </View>
    </SafeAreaView>
  );
}
