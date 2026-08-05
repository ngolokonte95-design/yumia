import { useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

/**
 * Lecteur vidéo inline pour le feed. Son activé par défaut (contrôlé par le
 * volume du téléphone), boucle, autoplay sans bouton play visible (façon
 * Instagram). Tap au centre = pause/lecture, avec icône qui flashe brièvement.
 * `uri` doit être une URL http(s) accessible.
 */
export function PostVideo({ uri, style, active = true, onExpand }: { uri: string; style?: ViewStyle; active?: boolean; onExpand?: (currentTime: number) => void }) {
  const [playing, setPlaying] = useState(true);
  const [showIcon, setShowIcon] = useState(false);
  const iconOpacity = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.audioMixingMode = 'doNotMix';
    if (active) p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  const flashIcon = () => {
    setShowIcon(true);
    iconOpacity.stopAnimation();
    iconOpacity.setValue(1);
    Animated.timing(iconOpacity, {
      toValue: 0, duration: 450, delay: 350, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setShowIcon(false); });
  };

  const toggle = () => {
    if (player.playing) player.pause(); else player.play();
    flashIcon();
  };

  return (
    <View style={style}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      {onExpand && (
        <Pressable style={styles.expandBtn} onPress={() => onExpand(player.currentTime ?? 0)} hitSlop={10}>
          <Text style={styles.expandIcon}>⤢</Text>
        </Pressable>
      )}
      {showIcon && (
        <Animated.View style={[styles.iconWrap, { opacity: iconOpacity }]} pointerEvents="none">
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>{playing ? '⏸' : '▶'}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 26, color: '#fff' },
  expandBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  expandIcon: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
