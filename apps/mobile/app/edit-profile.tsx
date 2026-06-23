/**
 * ÉDITER LE PROFIL — nom, photo de profil, langue.
 */
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
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
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { uploadAvatarRequest } from '../lib/auth-api';
import { API_BASE_URL } from '../lib/config';

const LOCALES = [
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'it', label: '🇮🇹 Italiano' },
  { code: 'pt', label: '🇵🇹 Português' },
  { code: 'ar', label: '🇸🇦 العربية' },
];

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken, updateProfile } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [locale, setLocale] = useState(user?.locale ?? 'fr');
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    displayName.trim() !== (user?.displayName ?? '') ||
    bio.trim() !== (user?.bio ?? '') ||
    locale !== (user?.locale ?? 'fr') ||
    localAvatarUri !== null;

  const canSave = displayName.trim().length >= 2 && !loading && !uploadingAvatar && dirty;

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Active l\'accès à la galerie dans les réglages.');
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
      setError(err instanceof Error ? err.message : 'Impossible de sauvegarder.');
      setUploadingAvatar(false);
    } finally {
      setLoading(false);
    }
  }

  function handleDiscard() {
    if (!dirty) { router.back(); return; }
    Alert.alert(
      'Annuler les modifications ?',
      'Tes changements seront perdus.',
      [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Annuler', style: 'destructive', onPress: () => router.back() },
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleDiscard} style={styles.navBtn}>
            <Text style={styles.navBtnText}>Annuler</Text>
          </Pressable>
          <Text style={styles.title}>Modifier le profil</Text>
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {loading
              ? <ActivityIndicator color={colors.brand} size="small" />
              : <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>Sauvegarder</Text>
            }
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarRow}>
            <Pressable style={styles.avatarWrap} onPress={handlePickAvatar} disabled={uploadingAvatar}>
              {avatarSource ? (
                <Image source={{ uri: avatarSource }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )}
              {uploadingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : (
                <View style={styles.avatarEditBadge}>
                  <Text style={styles.avatarEditText}>✎</Text>
                </View>
              )}
            </Pressable>
            <Text style={styles.avatarHint}>Appuie pour changer la photo</Text>
          </View>

          {/* Champs */}
          <View style={styles.section}>
            <View style={styles.field}>
              <Text style={styles.label}>Nom affiché</Text>
              <TextInput
                style={styles.input}
                placeholder="Ton prénom ou pseudo"
                placeholderTextColor={colors.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={40}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder="En quelques mots sur toi…"
                placeholderTextColor={colors.textMuted}
                value={bio}
                onChangeText={setBio}
                maxLength={200}
                multiline
                textAlignVertical="top"
                returnKeyType="done"
              />
              <Text style={styles.fieldHint}>{bio.length}/200</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputReadonly}>
                <Text style={styles.inputReadonlyText}>{user?.email}</Text>
              </View>
              <Text style={styles.fieldHint}>L'email ne peut pas être modifié.</Text>
            </View>
          </View>

          {/* Langue */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Langue</Text>
            {LOCALES.map((l) => (
              <Pressable
                key={l.code}
                style={[styles.localeRow, locale === l.code && styles.localeRowActive]}
                onPress={() => setLocale(l.code)}
              >
                <Text style={styles.localeLabel}>{l.label}</Text>
                {locale === l.code ? <Text style={styles.localeCheck}>✓</Text> : null}
              </Pressable>
            ))}
          </View>

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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBtn: { padding: spacing.xs },
  navBtnText: { ...typography.body, color: colors.brandSoft },
  title: { ...typography.heading, color: colors.textPrimary },
  saveBtn: { padding: spacing.xs },
  saveBtnText: { ...typography.body, color: colors.brand, fontWeight: '700' },
  saveBtnDisabled: {},
  saveBtnTextDisabled: { color: colors.textMuted },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatarWrap: { position: 'relative', width: 80, height: 80 },
  avatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.brand },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.brand}33`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.brand,
  },
  avatarText: { ...typography.display, color: colors.brand, fontSize: 28 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarEditText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  avatarHint: { ...typography.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },

  section: { gap: spacing.md },
  sectionTitle: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  bioInput: { minHeight: 80 },
  inputReadonly: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  inputReadonlyText: { ...typography.body, color: colors.textMuted },
  fieldHint: { ...typography.label, color: colors.textMuted },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  localeRowActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}0D` },
  localeLabel: { ...typography.body, color: colors.textPrimary },
  localeCheck: { ...typography.body, color: colors.brand, fontWeight: '700' },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
