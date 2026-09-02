# PROMPT — SYSTÈME DE BADGES YUMIA

> Restrictions/suggestions par niveau : pas encore décidées, à définir à la fin.
> Ce prompt sert de base pour l'implémentation quand on sera prêt.

Ajoute au système actuel de Yumia un système de 4 niveaux d'utilisateur, **sans modifier l'architecture existante**.

━━━━━━━━━━━━━━━━━━━━
1. FORMULES
━━━━━━━━━━━━━━━━━━━━

🆓 GRATUIT — 0 €/mois
- Fonctionnalités de base uniquement.
- Certaines fonctionnalités avancées sont verrouillées.
- Limites d'utilisation sur les fonctionnalités IA/recherches.
- Aucun badge.

🥈 YUMIA PLUS — 2,99 €/mois
- Badge Argent.
- Accès à toutes les fonctionnalités.
- Limites d'utilisation modérées.

🥇 YUMIA GOLD — 5,99 €/mois
- Badge Or.
- Accès à toutes les fonctionnalités.
- Limites beaucoup plus élevées.
- Afficher « Plus populaire ».

💎 YUMIA DIAMOND — 9,99 €/mois
- Badge Diamant.
- Accès à toutes les fonctionnalités.
- Utilisation illimitée des fonctionnalités concernées.

━━━━━━━━━━━━━━━━━━━━
2. POSITION DU BADGE
━━━━━━━━━━━━━━━━━━━━

Le badge doit être intégré directement à l'identité de l'utilisateur.

EMPLACEMENT PRINCIPAL :
- Sur la photo de profil/avatar.
- Position : petit badge circulaire placé en bas à droite de l'avatar.
- Il doit légèrement chevaucher l'avatar.
- Taille suffisamment petite pour rester élégant mais suffisamment grande pour être immédiatement identifiable.
- Le badge doit conserver ses détails, son effet lumineux et son rendu premium.

EMPLACEMENTS SECONDAIRES :
- À côté du nom d'utilisateur sur le profil.
- À côté du nom dans les commentaires/avis.
- Dans les résultats de recherche d'utilisateurs lorsque le profil est affiché.
- Dans les messages/conversations lorsque le nom et l'avatar sont affichés.
- Sur la page de profil publique.
- Dans les éventuelles interactions sociales de Yumia où l'identité de l'utilisateur est affichée.

IMPORTANT :
Le badge ne doit PAS apparaître partout de manière excessive.
Il doit fonctionner comme une petite marque de statut premium.

━━━━━━━━━━━━━━━━━━━━
3. DESIGN DES BADGES
━━━━━━━━━━━━━━━━━━━━

Utiliser les badges Yumia fournis dans le projet.
**Assets exportés en fond TRANSPARENT — uniquement le cercle dégradé + l'étoile, sans le carré noir qui les entoure dans les fichiers sources.**

Même forme générale pour les 3 badges premium afin de créer une véritable identité visuelle :

🥈 Argent → étoile argent brillante
🥇 Gold → étoile or brillante
💎 Diamond → étoile diamant/cristal

Conserver :
- le cercle avec le dégradé Yumia violet → rose → orange
- l'étoile centrale
- les effets de lumière
- le rendu premium 3D
- les reflets
- le sparkle/lens flare sur l'étoile

Le badge doit être parfaitement net sur mobile, desktop et dans les petites tailles.

━━━━━━━━━━━━━━━━━━━━
4. LOGIQUE TECHNIQUE
━━━━━━━━━━━━━━━━━━━━

Le niveau de l'utilisateur doit être déterminé automatiquement selon son abonnement actif.

**Ne pas créer un nouveau système d'abonnement — étendre l'existant :**
- Mobile : `react-native-purchases` (RevenueCat) est déjà intégré (`apps/mobile/lib/purchases.ts`) — c'est le moyen de paiement obligatoire sur iOS pour du contenu numérique in-app (Apple interdit tout autre circuit de paiement). Ajouter les 3 offres Plus/Gold/Diamond dans RevenueCat, pas un nouveau provider.
- Backend : le champ `plan` existe déjà sur l'utilisateur (`'free' | 'plus'`, `apps/api/src/modules/auth/auth.service.ts`) et `isPremium` (booléen). Étendre l'enum à `'free' | 'plus' | 'gold' | 'diamond'` plutôt que d'ajouter un champ parallèle.
- Les webhooks RevenueCat existent déjà (`apps/api/src/modules/webhooks/`) — les étendre pour distinguer les 3 offres au lieu d'un seul niveau premium.
- `usePlanLimits.ts` (mobile) dérive déjà `isPremium` du plan de l'utilisateur — à généraliser en un niveau (`free`/`plus`/`gold`/`diamond`) au lieu d'un booléen.

Créer une logique claire de type :

FREE
PLUS
GOLD
DIAMOND

Le backend doit être la source de vérité pour :
- le statut de l'abonnement
- les fonctionnalités accessibles
- les limites d'utilisation
- le badge affiché

Ne jamais faire confiance uniquement au frontend pour déterminer les droits.

**Migration** : les utilisateurs actuellement `isPremium: true` / `plan: 'plus'` doivent être automatiquement rattachés au niveau PLUS lors du déploiement (pas de perte d'accès).

Prévoir une architecture facilement configurable afin de pouvoir modifier ultérieurement :
- les prix
- les limites
- les fonctionnalités
- les badges
- ajouter de nouveaux niveaux

━━━━━━━━━━━━━━━━━━━━
5. EXPÉRIENCE UTILISATEUR
━━━━━━━━━━━━━━━━━━━━

Lorsqu'un utilisateur passe à une formule supérieure :
- son badge doit être automatiquement mis à jour ;
- aucun redémarrage de l'application ne doit être nécessaire ;
- le nouveau badge doit apparaître dès que le backend a traité le webhook RevenueCat et que l'app a rafraîchi le profil (quelques secondes, pas instantané à la milliseconde — délai normal de validation du reçu d'achat).

Lorsqu'un abonnement expire :
- retirer automatiquement le badge premium ;
- revenir au niveau FREE ;
- appliquer les limites correspondantes.

Ne casse aucune fonctionnalité existante de Yumia.

Avant toute modification importante, analyse l'architecture actuelle (RevenueCat, `plan`/`isPremium`, `usePlanLimits.ts`, webhooks) et intègre cette fonctionnalité dans le système existant plutôt que de recréer une nouvelle architecture.
