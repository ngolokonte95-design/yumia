/**
 * ÉDITER LE PROFIL — nom, photo de profil, langue.
 *
 * Mise en scène (17/11/2026) : grand avatar à anneau dégradé avec pastille
 * « modifier », champs vitrés (liseré de marque au focus), langues en
 * groupe vitré avec coche dégradée, bouton Enregistrer en pastille
 * dégradée. Logique inchangée.
 */
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { PressableScale, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import {
  BrandDot, GLASS, GlassGroup, GradientRing, SectionLabel,
} from '../components/profile/ProfileChrome';
import { useAuth } from '../lib/auth-context';
import { uploadAvatarRequest } from '../lib/auth-api';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { SUPPORTED_LOCALES } from '../lib/locales';

const AVATAR = 132;

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken, updateProfile } = useAuth();
  const { t } = useI18n();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [locale, setLocale] = useState(user?.locale ?? 'fr');
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Champ qui a le focus : liseré de marque (purement visuel). */
  const [focused, setFocused] = useState<'name' | 'bio' | null>(null);

  const dirty =
    displayName.trim() !== (user?.displayName ?? '') ||
    bio.trim() !== (user?.bio ?? '') ||
    locale !== (user?.locale ?? 'fr') ||
    localAvatarUri !== null;

  const canSave = displayName.trim().length >= 2 && !loading && !uploadingAvatar && dirty;

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('ep_perm_denied_title'), t('ep_perm_denied_body'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setLocalAvatarUri(result.assets[0].uri);
  }

  async function handleSave() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      if (localAvatarUri) {
        setUploadingAvatar(true);
        await uploadAvatarRequest(accessToken, localAvatarUri);
        setUploadingAvatar(false);
      }
      await updateProfile({ displayName: displayName.trim(), bio: bio.trim() || undefined, locale });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ep_save_error'));
      setUploadingAvatar(false);
    } finally {
      setLoading(false);
    }
  }

  function handleDiscard() {
    if (!dirty) { router.back(); return; }
    Alert.alert(
      t('ep_discard_title'),
      t('ep_discard_body'),
      [
        { text: t('ep_continue'), style: 'cancel' },
        { text: t('ep_discard_confirm'), style: 'destructive', onPress: () => router.back() },
      ],
    );
  }

  const initial = (user?.displayName ?? 'Y').charAt(0).toUpperCase();
  const remotePhotoUrl = user?.photoUrl
    ? user.photoUrl.startsWith('http')
      ? user.photoUrl
      : `${API_BASE_URL}${user.photoUrl}`
    : null;
  const avatarSource = localAvatarUri ?? remotePhotoUrl;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* En-tête : annuler, titre, enregistrer (pastille au dégradé) */}
        <View style={styles.header}>
          <PressableScale onPress={handleDiscard} style={styles.navBtn} scaleTo={0.94}>
            <Text style={styles.navBtnText}>{t('ep_cancel')}</Text>
          </PressableScale>
          <Text style={styles.title} numberOfLines={1}>{t('ep_title')}</Text>
          <PressableScale
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={() => { haptics.select(); void handleSave(); }}
            disabled={!canSave}
            scaleTo={0.94}
          >
            {canSave ? (
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            ) : null}
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>{t('ep_save')}</Text>
            }
          </PressableScale>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar mis en valeur */}
          <Reveal index={0} style={styles.avatarBlock}>
            <PressableScale onPress={handlePickAvatar} disabled={uploadingAvatar} scaleTo={0.95}>
              <GradientRing size={AVATAR} thickness={3}>
                {avatarSource ? (
                  <Image source={{ uri: avatarSource }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
                {uploadingAvatar ? (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </GradientRing>
              {uploadingAvatar ? null : (
                <View style={styles.avatarEditBadge}>
                  <BrandDot label="✎" size={36} />
                </View>
              )}
            </PressableScale>
            <Text style={styles.avatarHint}>{t('ep_avatar_hint')}</Text>
          </Reveal>

          {/* Champs */}
          <Reveal index={1} style={styles.section}>
            <View style={styles.field}>
              <SectionLabel label={t('ep_display_name')} style={styles.fieldLabel} />
              <TextInput
                style={[styles.input, GLASS, focused === 'name' && styles.inputFocused]}
                placeholder={t('ep_name_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                maxLength={40}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <SectionLabel label={t('ep_bio')} style={styles.fieldLabel} />
              <TextInput
                style={[styles.input, styles.bioInput, GLASS, focused === 'bio' && styles.inputFocused]}
                placeholder={t('ep_bio_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={bio}
                onChangeText={setBio}
                onFocus={() => setFocused('bio')}
                onBlur={() => setFocused(null)}
                maxLength={200}
                multiline
                textAlignVertical="top"
                returnKeyType="done"
              />
              <Text style={styles.counter}>{bio.length}/200</Text>
            </View>

            <View style={styles.field}>
              <SectionLabel label={t('ep_email')} style={styles.fieldLabel} />
              <View style={styles.inputReadonly}>
                <Text style={styles.inputReadonlyText}>🔒  {user?.email}</Text>
              </View>
              <Text style={styles.fieldHint}>{t('ep_email_hint')}</Text>
            </View>
          </Reveal>

          {/* Langue */}
          <Reveal index={2} style={styles.section}>
            <SectionLabel label={t('ep_language')} style={styles.fieldLabel} />
            <GlassGroup>
              {SUPPORTED_LOCALES.map((l) => {
                const active = locale === l.code;
                return (
                  <PressableScale
                    key={l.code}
                    style={styles.localeRow}
                    scaleTo={0.98}
                    onPress={() => { haptics.select(); setLocale(l.code); }}
                  >
                    <Text style={styles.localeFlag}>{l.flag}</Text>
                    <Text style={[styles.localeLabel, active && styles.localeLabelActive]}>{l.nativeLabel}</Text>
                    {active ? <BrandDot label="✓" size={26} /> : <View style={styles.localeEmpty} />}
                  </PressableScale>
                );
              })}
            </GlassGroup>
          </Reveal>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  navBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  navBtnText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  title: { flex: 1, textAlign: 'center', color: colors.textPrimary, fontSize: 18, fontWeight: '900' },
  saveBtn: {
    minWidth: 92, height: 38, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md,
  },
  saveBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  saveBtnTextDisabled: { color: colors.textMuted },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },

  avatarBlock: { alignItems: 'center', gap: spacing.md },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { ...typography.display, color: colors.textPrimary, fontSize: 48 },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: { position: 'absolute', bottom: 2, right: 2 },
  avatarHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 280 },

  section: { gap: spacing.md },
  fieldLabel: { marginTop: 0, marginBottom: 2 },
  field: { gap: spacing.xs },
  input: {
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputFocused: { borderColor: colors.brand, borderWidth: 1 },
  bioInput: { minHeight: 96 },
  counter: { ...typography.label, color: colors.textMuted, alignSelf: 'flex-end' },
  inputReadonly: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  inputReadonlyText: { ...typography.body, color: colors.textMuted },
  fieldHint: { ...typography.label, color: colors.textMuted },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
  },
  localeFlag: { fontSize: 22 },
  localeLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  localeLabelActive: { fontWeight: '800' },
  localeEmpty: { width: 26, height: 26 },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
