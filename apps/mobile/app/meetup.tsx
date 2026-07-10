import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface Meetup {
  id: string;
  title: string;
  description?: string;
  city: string;
  date: string;
  maxAttendees?: number;
  attendeesCount: number;
  myStatus?: string | null;
  host: { id: string; displayName: string; photoUrl?: string } | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MeetupScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', city: '', date: '', maxAttendees: '' });

  const load = useCallback(async (cityFilter?: string) => {
    if (!accessToken) return;
    setLoading(true);
    const url = cityFilter ? `${API}/meetups?city=${encodeURIComponent(cityFilter)}` : `${API}/meetups`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setMeetups(await res.json());
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const rsvp = async (meetupId: string, currentStatus: string | null | undefined) => {
    const status = currentStatus === 'going' ? 'cancel' : 'going';
    await fetch(`${API}/meetups/${meetupId}/rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status }),
    });
    setMeetups((prev) => prev.map((m) => m.id === meetupId ? { ...m, myStatus: status === 'cancel' ? null : status, attendeesCount: m.attendeesCount + (status === 'cancel' ? -1 : 1) } : m));
  };

  const createMeetup = async () => {
    if (!form.title.trim() || !form.city.trim() || !form.date.trim()) {
      Alert.alert('Remplis le titre, la ville et la date');
      return;
    }
    setCreating(true);
    const res = await fetch(`${API}/meetups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        city: form.city.trim(),
        date: new Date(form.date).toISOString(),
        maxAttendees: form.maxAttendees ? +form.maxAttendees : undefined,
      }),
    });
    setCreating(false);
    if (res.ok) {
      setShowCreate(false);
      setForm({ title: '', description: '', city: '', date: '', maxAttendees: '' });
      void load();
    } else {
      Alert.alert('Erreur', 'Impossible de créer le meetup');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Meetups</Text>
        <Pressable style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.createBtnText}>+ Créer</Text>
        </Pressable>
      </View>

      {/* City filter */}
      <View style={styles.filterRow}>
        <TextInput
          style={styles.cityInput}
          placeholder="🏙️ Filtrer par ville..."
          placeholderTextColor={colors.textMuted}
          value={city}
          onChangeText={setCity}
          onSubmitEditing={() => void load(city)}
          returnKeyType="search"
        />
        {city ? (
          <Pressable onPress={() => { setCity(''); void load(); }} style={styles.clearBtn}>
            <Text style={{ color: colors.textMuted }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={meetups}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 80 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDate}>📅 {formatDate(item.date)}</Text>
                  <Text style={styles.cardCity}>📍 {item.city}</Text>
                  {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
                </View>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.hostRow}>
                  <Text style={styles.hostText}>par {item.host?.displayName ?? '?'}</Text>
                  <Text style={styles.attendees}>
                    👥 {item.attendeesCount}{item.maxAttendees ? `/${item.maxAttendees}` : ''} participants
                  </Text>
                </View>
                <Pressable
                  style={[styles.rsvpBtn, item.myStatus === 'going' && styles.rsvpBtnActive]}
                  onPress={() => void rsvp(item.id, item.myStatus)}
                >
                  <Text style={[styles.rsvpBtnText, item.myStatus === 'going' && styles.rsvpBtnTextActive]}>
                    {item.myStatus === 'going' ? '✓ Je participe' : 'Je sors ce soir !'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌃</Text>
              <Text style={styles.emptyTitle}>Aucun meetup prévu</Text>
              <Text style={styles.emptyText}>Sois le premier à organiser une sortie !</Text>
            </View>
          }
        />
      )}

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { paddingTop: insets.top || 24 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowCreate(false)}><Text style={styles.cancel}>Annuler</Text></Pressable>
            <Text style={styles.modalTitle}>Nouveau meetup</Text>
            <Pressable onPress={createMeetup} disabled={creating} style={styles.saveBtn}>
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Créer</Text>}
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 12 }}>
            <TextInput style={styles.input} placeholder="Titre *" placeholderTextColor={colors.textMuted} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
            <TextInput style={[styles.input, { minHeight: 80 }]} placeholder="Description" placeholderTextColor={colors.textMuted} value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
            <TextInput style={styles.input} placeholder="Ville * (ex: Paris)" placeholderTextColor={colors.textMuted} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
            <TextInput
              style={styles.input}
              placeholder="Date et heure * (ex: 2026-07-10T20:00)"
              placeholderTextColor={colors.textMuted}
              value={form.date}
              onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
            />
            <TextInput style={styles.input} placeholder="Max participants (optionnel)" placeholderTextColor={colors.textMuted} value={form.maxAttendees} onChangeText={(v) => setForm((f) => ({ ...f, maxAttendees: v }))} keyboardType="numeric" />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  createBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 7 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: spacing.sm },
  cityInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  clearBtn: { padding: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, marginBottom: spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  cardTop: { padding: spacing.md },
  cardInfo: { gap: 4 },
  cardTitle: { ...typography.h3, color: colors.text },
  cardDate: { fontSize: 13, color: colors.textMuted },
  cardCity: { fontSize: 13, color: colors.textMuted },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  cardBottom: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: 10 },
  hostRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hostText: { fontSize: 13, color: colors.textMuted },
  attendees: { fontSize: 13, color: colors.textMuted },
  rsvpBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center' },
  rsvpBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand },
  rsvpBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rsvpBtnTextActive: { color: colors.brand },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancel: { color: colors.textMuted, fontSize: 16 },
  modalTitle: { ...typography.h3, color: colors.text },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 7 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  input: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
});
