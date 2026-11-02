import { Tabs } from 'expo-router';
import { BottomBar, type TabKey } from '../../components/ui';

const ROUTE_FOR: Record<TabKey, string> = { home: 'index', crews: 'crews', deals: 'deals', history: 'history' };
const KEY_FOR: Record<string, TabKey> = { index: 'home', crews: 'crews', deals: 'deals', history: 'history' };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={({ state, navigateToTab }) => (
        <BottomBar
          activeKey={KEY_FOR[state.routes[state.index]?.name ?? 'index'] ?? 'home'}
          onChange={(key) => {
            const route = state.routes.find((r) => r.name === ROUTE_FOR[key]);
            if (route) navigateToTab(route.key);
          }}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="crews" />
      <Tabs.Screen name="deals" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
