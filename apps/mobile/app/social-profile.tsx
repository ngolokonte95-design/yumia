import { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

const GENDERS = [
  { value: 'male', label: '👨 Homme' },
  { value: 'female', label: '👩 Femme' },
  { value: 'other', label: '🧑 Autre' },
];

const INTERESTED_IN = [
  { value: 'everyone', label: '💑 Tout le monde' },
  { value: 'female', label: '👩 Femmes' },
  { value: 'male', label: '👨 Hommes' },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function SocialProfileScreen() {
  const { user, accessToken, updateProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [gender, setGender] = useState<string>(user?.gender ?? '');
  const [birthYear, setBirthYear] = useState<string>(user?.birthYear ? String(user.birthYear) : '');
  const [interestedIn, setInterestedIn] = useState<string>(user?.interestedIn ?? 'everyone');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const age = birthYear && !isNaN(+birthYear) ? CURRENT_YEAR - +birthYear : null;

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const form = new FormData();
      form.append('file', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any);
      const res = await fetch(`${API}/auth/me/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json() as { photoUrl: string };
        await updateProfile({ photoUrl: data.photoUrl });
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        gender: gender || undefined,
        birthYear: birthYear && !isNaN(+birthYear) ? +birthYear : undefined,
        interestedIn,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const photoUrl = user?.photoUrl
    ? user.photoUrl.startsWith('http') ? user.photoUrl : `${API.replace('/api', '')}${user.photoUrl}`
    : null;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Profil social</Text>
        <Pressable onPress={save} disabled={saving} style={styles.saveBtn}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveTxt}>Sauvegarder</Text>}
        </Pressable>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <Pressable onPress={pickPhoto} style={styles.avatarWrap}>
          {uploadingPhoto ? (
            <ActivityIndicator color={colors.brand} />
          ) : photoUrl ? (
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            <View style={styles.avatar}><Text style={styles.avatarInitial}>{user?.displayName[0]}</Text></View>
          ) : (
            <View style={styles.avatar}><Text style={styles.avatarInitial}>{user?.displayName[0]}</Text></View>
          )}
          <View style={styles.cameraIcon}><Text style={{ fontSize: 16 }}>📷</Text></View>
        </Pressable>
        <Text style={styles.avatarHint}>Appuie pour changer ta photo</Text>
      </View>

      {/* Nom */}
      <View style={styles.section}>
        <Text style={styles.label}>Nom affiché</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          placeholder="Ton prénom ou pseudo"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={bio}
          onChangeText={setBio}
          maxLength={200}
          multiline
          numberOfLines={3}
          placeholder="Parle de toi en quelques mots..."
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.counter}>{bio.length}/200</Text>
      </View>

      {/* Sexe */}
      <View style={styles.section}>
        <Text style={styles.label}>Je suis</Text>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <Pressable
              key={g.value}
              style={[styles.chip, gender === g.value && styles.chipActive]}
              onPress={() => setGender(g.value)}
            >
              <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>{g.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Âge */}
      <View style={styles.section}>
        <Text style={styles.label}>Année de naissance {age ? `→ ${age} ans` : ''}</Text>
        <TextInput
          style={styles.input}
          value={birthYear}
          onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="numeric"
          maxLength={4}
          placeholder="ex: 1995"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Intéressé par */}
      <View style={styles.section}>
        <Text style={styles.label}>Je souhaite rencontrer</Text>
        <View style={styles.chips}>
          {INTERESTED_IN.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, interestedIn === opt.value && styles.chipActive]}
              onPress={() => setInterestedIn(opt.value)}
            >
              <Text style={[styles.chipText, interestedIn === opt.value && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Seules les personnes correspondant à ta préférence te seront proposées.</Text>
      </View>

      <View style={{ height: insets.bottom + 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand, marginRight: spacing.sm },
  title: { ...typography.h2, color: colors.text, flex: 1 },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.lg },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.brand + '44',
  },
  avatarInitial: { fontSize: 36, color: '#fff', fontWeight: '700' },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: colors.surface, borderRadius: 14,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border,
  },
  avatarHint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 14, color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  counter: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand + '22', borderColor: colors.brand },
  chipText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: colors.brand },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 17 },
});
