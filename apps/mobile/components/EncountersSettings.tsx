/**
 * Réglages des Rencontres, directement dans l'onglet Rencontres — sans passer
 * par le profil : activer (avec la demande de localisation), choisir qui peut
 * me voir, désactiver. Mêmes réglages que dans « Modifier le profil ».
 *
 * `compact` : bandeau au-dessus de la liste quand les Rencontres sont déjà
 * activées ; sinon, carte d'explication et d'activation.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { API_BASE_URL } from '../lib/config';
import type { TranslationKey } from '../lib/translations';

type Audience = 'everyone' | 'female' | 'male';

const AUDIENCE_LABEL: Record<Audience, TranslationKey> = {
  everyone: 'esp_audience_everyone',
  female: 'esp_audience_female',
  male: 'esp_audience_male',
};

export function EncountersSettings() {
  const { user, accessToken, reloadUser } = useAuth();
  const { t } = useI18n();
  const enabled = user?.shareEncounters === true;
  const [audience, setAudience] = useState<Audience>(user?.encounterAudience ?? 'everyone');
  const [saving, setSaving] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [editing, setEditing] = useState(false);

  const save = async (patch: { shareEncounters?: boolean; encounterAudience?: Audience }) => {
    if (!accessToken) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/social/profile/privacy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(patch),
      });
      // Le réglage vit sur l'utilisateur : le recharger démarre (ou coupe)
      // l'envoi discret de position, monté dans _layout.
      await reloadUser();
    } catch {
      // Réseau : l'état affiché reste celui du serveur, l'utilisateur réessaie.
    } finally {
      setSaving(false);
    }
  };

  const activate = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setPermDenied(true); return; }
    setPermDenied(false);
    await save({ shareEncounters: true, encounterAudience: audience });
  };

  const pickAudience = (a: Audience) => {
    setAudience(a);
    if (enabled) void save({ encounterAudience: a });
  };

  const chips = (
    <View style={styles.chips}>
      {(['everyone', 'female', 'male'] as const).map((a) => (
        <Pressable key={a} style={[styles.chip, audience === a && styles.chipActive]} onPress={() => pickAudience(a)}>
          <Text style={[styles.chipTxt, audience === a && styles.chipTxtActive]}>{t(AUDIENCE_LABEL[a])}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (enabled) {
    return (
      <View style={styles.banner}>
        <View style={styles.bannerRow}>
          <Text style={styles.bannerTxt} numberOfLines={2}>
            ⚡ {t('enc_active_label')} · {t('wm_visible_to').replace('{who}', t(AUDIENCE_LABEL[audience]))}
          </Text>
          {saving ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8}>
              <Text style={styles.link}>{t('wm_change')}</Text>
            </Pressable>
          )}
        </View>
        {editing && (
          <>
            {chips}
            {audience !== 'everyone' && <Text style={styles.note}>{t('esp_enc_audience_note')}</Text>}
            <Pressable onPress={() => void save({ shareEncounters: false })} hitSlop={8} style={{ marginTop: spacing.sm }}>
              <Text style={styles.off}>{t('enc_turn_off')}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>⚡</Text>
      <Text style={styles.title}>{t('esp_encounters_title')}</Text>
      <Text style={styles.sub}>{t('esp_encounters_sub')}</Text>
      <Text style={styles.label}>{t('esp_enc_audience_title')}</Text>
      {chips}
      {audience !== 'everyone' && <Text style={styles.note}>{t('esp_enc_audience_note')}</Text>}
      <Pressable style={styles.cta} onPress={() => void activate()} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>{t('social_encounters_optin_btn')}</Text>}
      </Pressable>
      {permDenied && <Text style={styles.denied}>{t('enc_perm_denied')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, alignItems: 'center', gap: spacing.xs,
  },
  emoji: { fontSize: 36 },
  title: { ...typography.h3, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 6 },
  chip: {
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surfaceElevated,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}22` },
  chipTxt: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTxtActive: { color: colors.brandSoft },
  note: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  cta: {
    marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, paddingVertical: 12, minWidth: 160, alignItems: 'center',
  },
  ctaTxt: { color: '#fff', fontWeight: '800' },
  denied: { fontSize: 12, color: colors.danger, textAlign: 'center', marginTop: spacing.xs },
  banner: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bannerTxt: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  link: { fontSize: 13, fontWeight: '700', color: colors.brandSoft },
  off: { fontSize: 13, fontWeight: '700', color: colors.danger, textAlign: 'center' },
});
