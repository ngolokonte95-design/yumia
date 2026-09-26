/**
 * Garde le champ en cours de saisie visible au-dessus du clavier dans une
 * ScrollView.
 *
 * Sur Android (edge-to-edge, par défaut depuis le SDK 54), le clavier ne
 * redimensionne plus la fenêtre : il se pose par-dessus, et une ScrollView ne
 * défile pas d'elle-même vers le champ qui a le focus. On écrivait donc sans
 * voir son texte dès que le champ était dans la moitié basse de l'écran.
 *
 * À l'ouverture du clavier, on ajoute sa hauteur en marge basse (sans quoi il
 * n'y a parfois plus rien à faire défiler), puis on mesure le champ focalisé
 * et on défile juste de ce qui dépasse. Aucun ref par champ : on lit le champ
 * qui a le focus, donc tous les TextInput de l'écran sont couverts.
 *
 * Usage :
 *   const kb = useKeyboardReveal(scrollRef);
 *   <ScrollView ref={scrollRef} onScroll={kb.onScroll} scrollEventThrottle={16}
 *     contentContainerStyle={{ paddingBottom: base + kb.bottomInset }}>
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

/** Espace laissé entre le bas du champ et le haut du clavier. */
const GAP = 16;

export function useKeyboardReveal(scrollRef: RefObject<ScrollView | null>) {
  const scrollY = useRef(0);
  const [bottomInset, setBottomInset] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      setBottomInset(e.endCoordinates.height);
      // Une frame pour que la marge basse soit appliquée avant de défiler :
      // sinon le défilement est borné à l'ancienne hauteur du contenu.
      requestAnimationFrame(() => {
        const input = TextInput.State.currentlyFocusedInput() as
          | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
          | null;
        input?.measureInWindow?.((_x, y, _w, h) => {
          const overflow = y + h + GAP - keyboardTop;
          if (overflow > 0) {
            scrollRef.current?.scrollTo({ y: scrollY.current + overflow, animated: true });
          }
        });
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setBottomInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollRef]);

  return { onScroll, bottomInset };
}
