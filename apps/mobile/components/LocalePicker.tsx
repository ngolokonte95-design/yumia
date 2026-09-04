import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, I18nManager } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { SUPPORTED_LOCALES as LOCALES } from '../lib/locales';

interface Props {
  visible: boolean;
  currentLocale: string;
  onSelect: (code: string) => Promise<void>;
  onClose: () => void;
}

export function LocalePicker({ visible, currentLocale, onSelect, onClose }: Props) {
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);

  async function handleSelect(code: string) {
    if (code === currentLocale) { onClose(); return; }
    setPending(code);
    try {
      await onSelect(code);
      const isRtl = LOCALES.find((l) => l.code === code)?.rtl ?? false;
      if (I18nManager.isRTL !== isRtl) {
        I18nManager.forceRTL(isRtl);
      }
      onClose();
    } finally {
      setPending(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('lp_title')}</Text>

        {/* Grille compacte à 3 colonnes : les 13 langues tiennent toutes à
            l'écran sans défilement (~5 lignes), plutôt qu'une longue liste
            verticale qui obligeait à scroller. */}
        <View style={styles.grid}>
          {LOCALES.map((loc) => {
            const active = loc.code === currentLocale;
            const loading = pending === loc.code;
            return (
              <Pressable
                key={loc.code}
                style={[styles.tile, active && styles.tileActive]}
                onPress={() => void handleSelect(loc.code)}
                disabled={!!pending}
              >
                {loading ? (
                  <Text style={styles.check}>…</Text>
                ) : active ? (
                  <Text style={styles.checkCorner}>✓</Text>
                ) : null}
                <Text style={styles.flag}>{loc.flag}</Text>
                <Text
                  style={[styles.tileLabel, active && styles.tileLabelActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {loc.nativeLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>{t('cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const TILE_GAP = spacing.sm;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  // 3 colonnes : largeur = (100% - 2 gaps) / 3.
  tile: {
    width: '31.5%',
    aspectRatio: 1.35,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 2,
  },
  tileActive: { backgroundColor: `${colors.brand}14`, borderColor: colors.brand },
  flag: { fontSize: 26 },
  tileLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '600', textAlign: 'center' },
  tileLabelActive: { color: colors.brand, fontWeight: '700' },
  check: { ...typography.heading, color: colors.brand },
  checkCorner: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 14, fontWeight: '800', color: colors.brand,
  },
  cancelBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: { ...typography.body, color: colors.danger },
});
