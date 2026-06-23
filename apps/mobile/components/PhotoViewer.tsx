/**
 * PhotoViewer — visionneuse plein écran pour les photos d'un lieu.
 * Swipe horizontal entre les photos, fond noir, bouton fermer.
 */
import { useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  photos: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export function PhotoViewer({ photos, initialIndex = 0, visible, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  function onLayout() {
    if (initialIndex > 0 && listRef.current) {
      listRef.current.scrollToIndex({ index: initialIndex, animated: false });
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {Platform.OS === 'android' ? <StatusBar hidden /> : null}

        {/* Close button */}
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {/* Counter */}
        {photos.length > 1 ? (
          <View style={[styles.counter, { top: insets.top + 12 }]}>
            <Text style={styles.counterText}>1 / {photos.length}</Text>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onLayout={onLayout}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <Image
                source={{ uri: item }}
                style={{ width, height }}
                resizeMode="contain"
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  counter: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
