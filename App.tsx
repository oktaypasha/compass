import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { CompassScreen } from './src/screens/compass';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <CompassScreen />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
