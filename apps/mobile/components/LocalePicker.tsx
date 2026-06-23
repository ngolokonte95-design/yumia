import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, I18nManager } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Locale {
  code: string;
  label: string;
  nativeLabel: string;
  rtl?: boolean;
}

const LOCALES: Locale[] = [
  { code: 'fr', label: 'Français', nativeLabel: 'Français' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Español', nativeLabel: 'Español' },
  { code: 'pt', label: 'Português', nativeLabel: 'Português' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', rtl: true },
];

interface Props {
  visible: boolean;
  currentLocale: string;
  onSelect: (code: string) => Promise<void>;
  onClose: () => void;
}

export function LocalePicker({ visible, currentLocale, onSelect, onClose }: Props) {
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
        <Text style={styles.title}>Langue & région</Text>
        {LOCALES.map((loc) => {
          const active = loc.code === currentLocale;
          const loading = pending === loc.code;
          return (
            <Pressable
              key={loc.code}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => void handleSelect(loc.code)}
              disabled={!!pending}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                  {loc.nativeLabel}
                </Text>
                {loc.label !== loc.nativeLabel ? (
                  <Text style={styles.rowSub}>{loc.label}</Text>
                ) : null}
              </View>
              {loading ? (
                <Text style={styles.check}>…</Text>
              ) : active ? (
                <Text style={styles.check}>✓</Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowActive: { backgroundColor: `${colors.brand}10` },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowLabelActive: { color: colors.brand, fontWeight: '700' },
  rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  check: { ...typography.heading, color: colors.brand },
  cancelBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: { ...typography.body, color: colors.danger },
});
