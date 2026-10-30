/**
 * Sonnerie d'appel native, app fermée ou téléphone verrouillé (1.0.1+).
 *
 * - iPhone : push VoIP → écran d'appel du système (CallKit). Le décroché
 *   arrive ici ; le refus est envoyé au serveur par le code natif seul.
 * - Android : push de données → notification d'appel plein écran qui sonne
 *   en boucle. « Répondre » ou un appui ouvre l'app sur l'appel ; « Refuser »
 *   est traité en natif.
 *
 * Module natif local : modules/yumia-calls. Absent d'Expo Go et des builds
 * 1.0 : tout devient alors sans effet, l'app garde la notification classique.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { API_BASE_URL } from './config';

/** Appel transmis par la sonnerie native : décroché, ou simplement ouvert (Android). */
export interface NativeCall {
  action: 'answer' | 'open';
  callId: string;
  callType?: string;
  callerId?: string;
  callerName?: string;
  callerPhoto?: string;
  conversationId?: string;
}

interface Subscription { remove(): void }

interface YumiaCallsModule {
  configure(apiBaseUrl: string): Promise<void>;
  getVoipToken(): Promise<string | null>;
  consumePendingAnswer(): Promise<NativeCall | null>;
  endCall(callId: string): Promise<void>;
  dismissIncoming(callId: string): Promise<void>;
  setShowWhenLocked(show: boolean): Promise<void>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
  addListener(event: 'onVoipToken', cb: (e: { token: string }) => void): Subscription;
  addListener(event: 'onCallAction', cb: (e: NativeCall) => void): Subscription;
  addListener(event: 'onEnd', cb: (e: { callId: string }) => void): Subscription;
  addListener(event: 'onMute', cb: (e: { callId: string; muted: boolean }) => void): Subscription;
}

const native = requireOptionalNativeModule<YumiaCallsModule>('YumiaCalls');

// Le refus natif appelle l'API sans passer par le JS : il lui faut l'adresse.
native?.configure(API_BASE_URL).catch(() => undefined);

/**
 * Ce que l'app annonce au serveur avec son jeton push. Android seulement :
 * sur iPhone, c'est la présence du jeton VoIP qui compte — un iPhone sans
 * (Chine continentale, refus) doit garder la notification classique.
 */
export const nativeCallPush = Platform.OS === 'android' && native != null;

export async function getVoipToken(): Promise<string | null> {
  if (!native || Platform.OS !== 'ios') return null;
  return native.getVoipToken().catch(() => null);
}

/** Le jeton PushKit arrive après le lancement : on le renvoie au serveur dès qu'il est là. */
export function onVoipToken(cb: (token: string) => void): () => void {
  if (!native || Platform.OS !== 'ios') return () => undefined;
  const sub = native.addListener('onVoipToken', (e) => cb(e.token));
  return () => sub.remove();
}

export function callPath(call: NativeCall): string {
  const q = (v?: string) => encodeURIComponent(v ?? '');
  return `/call?callId=${q(call.callId)}&convId=${q(call.conversationId)}&partnerId=${q(call.callerId)}`
    + `&partnerName=${q(call.callerName)}&partnerPhoto=${q(call.callerPhoto)}`
    + `&type=${call.callType === 'video' ? 'video' : 'voice'}&incoming=true`
    + (call.action === 'answer' ? '&answered=1' : '');
}

/**
 * Ouvre l'écran d'appel quand la sonnerie native le demande — y compris un
 * décroché fait avant que le JS ne tourne (app lancée par l'appel), récupéré
 * dès que la navigation est prête.
 */
export function useNativeCallActions(ready: boolean, open: (path: string) => void): void {
  useEffect(() => {
    if (!native || !ready) return;
    const take = () => {
      void native.consumePendingAnswer().then((call) => {
        if (call?.callId) open(callPath(call));
      }).catch(() => undefined);
    };
    take();
    const sub = native.addListener('onCallAction', take);
    return () => sub.remove();
  }, [ready, open]);
}

/** Termine l'appel côté système (CallKit), quand l'écran d'appel raccroche. */
export function endNativeCall(callId: string | null | undefined): void {
  if (native && callId) native.endCall(callId).catch(() => undefined);
}

/** Coupe la sonnerie native (Android) : l'écran d'appel prend le relais. */
export function dismissIncomingCall(callId: string | null | undefined): void {
  if (native && callId) native.dismissIncoming(callId).catch(() => undefined);
}

/** Android : l'app passe devant l'écran verrouillé le temps de l'appel, pas plus. */
export function setShowWhenLocked(show: boolean): void {
  if (native && Platform.OS === 'android') native.setShowWhenLocked(show).catch(() => undefined);
}

/** Raccroché ou micro coupé depuis l'écran d'appel du système (iPhone). */
export function onNativeCallEvents(
  callId: string | null,
  handlers: { onEnd: () => void; onMute: (muted: boolean) => void },
): () => void {
  if (!native || !callId) return () => undefined;
  const end = native.addListener('onEnd', (e) => { if (e.callId === callId) handlers.onEnd(); });
  const mute = native.addListener('onMute', (e) => { if (e.callId === callId) handlers.onMute(e.muted); });
  return () => { end.remove(); mute.remove(); };
}
