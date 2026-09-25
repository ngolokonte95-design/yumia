# Soumission aux boutiques — tout ce qu'il faut remplir

Chaque réponse ci-dessous est tirée du code tel qu'il est aujourd'hui, et indique **où** elle a été
vérifiée. Reprends chaque champ des deux consoles à partir d'ici, sans te fier aux valeurs déjà
saisies : elles datent d'avant la boutique, l'assistant cadeaux, le social et les quatre forfaits.

Les textes marketing (nom, sous-titre, descriptions, mots-clés) sont dans **`FICHES-STORES.md`**,
vérifiés par `node docs/stores/check-lengths.mjs`. Ne les recopie pas d'ailleurs : Apple tronque
sans prévenir.

---

## 0. L'âge minimum — tranché : **16 ans**

Les trois endroits disent la même chose, et l'app le fait respecter :

| Où | Valeur | État |
|---|---|---|
| Conditions d'utilisation (`website/terms.html`) | 16 ans | en ligne |
| Politique de confidentialité (`website/privacy.html`) | 16 ans | en ligne |
| Déclaration aux boutiques | 16 ans | à saisir (§3.3, §4.4) |
| L'app | date de naissance à l'inscription, refus bloquant en dessous | `apps/mobile/lib/age-gate.ts` + `apps/api/src/modules/auth/age.ts` |

**Comment la barrière fonctionne**, si un testeur de boutique pose la question :

- Inscription par email : trois champs jour / mois / année dans le formulaire, aucun pré-rempli.
  Le bouton reste inactif tant que la date est absente, inexistante (31 février) ou sous la limite.
- Inscription par Google ou Apple : le serveur repère qu'aucun compte n'existe, répond
  `AGE_REQUIRED`, et l'app demande la date avant de rejouer l'appel. Une **re**connexion ne
  redemande rien.
- Le serveur refait le calcul (`assertSignupAge`) et refuse **avant** toute écriture en base : un
  client modifié ne contourne rien.
- Seule l'**année** est conservée (`User.birthYear`) — c'est tout ce dont le profil a besoin.

Un utilisateur peut évidemment mentir sur sa date : aucune boutique n'exige davantage sans
vérification d'identité. Ce qui est exigé, c'est que la question soit posée et que la réponse bloque.

---

## 1. Identité de l'app

| Champ | Valeur | Source |
|---|---|---|
| Identifiant iOS | `com.yumia.app` | `app.json` |
| Nom de paquet Android | `com.yumia.app` | `app.json` |
| Version | `0.1.0` | `app.json` |
| Code de version Android | `8` | `app.json` |

---

## 2. Liens obligatoires

| Champ | URL | État |
|---|---|---|
| Politique de confidentialité | https://yumia.eu/privacy | en ligne |
| Conditions d'utilisation | https://yumia.eu/terms | en ligne |
| Suppression de compte (exigée par Google **en plus** du parcours dans l'app) | https://yumia.eu/delete-account | en ligne |
| Support | https://yumia.eu/support | en ligne |
| Courriel de support | contact@yumia.eu | affiché publiquement par Google |

---

## 3. App Store Connect, écran par écran

> Les libellés bougent d'une version de console à l'autre. Repère-toi au **sens** de la question,
> pas au mot exact.

### 3.1 Informations sur l'app

| Champ | Valeur |
|---|---|
| Nom | `YUMIA : Sorties, IA & Vacances` |
| Sous-titre | `Sorties, voyages et cadeaux` |
| Catégorie principale | Voyages |
| Catégorie secondaire | Cuisine et boissons |
| Droits d'auteur | `2026 Ngolo Konte` |
| Politique de confidentialité | https://yumia.eu/privacy |

### 3.2 Statut de professionnel (DSA) — obligatoire pour vendre dans l'UE

Apple exige désormais de déclarer si tu es **professionnel**, avec raison sociale, adresse,
téléphone et numéro d'immatriculation, puis vérifie ces informations. Sans cela, l'app n'est pas
distribuée dans l'Union européenne.

Si tu déclares vendre en tant que professionnel, un numéro d'immatriculation t'est demandé. C'est
la seule pièce qui manque encore, et elle bloque à elle seule la distribution en Europe — voir §8.

À ne pas confondre avec Stripe, qui fonctionne en compte de particulier sans immatriculation.

### 3.3 Classification par âge

Apple pose chaque question par **fréquence** : aucune / rare / fréquente. Réponds d'après ce que
l'app contient vraiment : une réponse minorée se découvre au premier signalement et coûte le
retrait.

| Question | Réponse | Pourquoi |
|---|---|---|
| Alcool, tabac ou drogues — références | **Fréquentes** | Bars, Pubs, Caves à vin, Night-clubs, Bars à chicha, Tabac & Presse, Coffee shops : des rayons entiers |
| Jeux d'argent — références | **Rares** | Rayon Casinos : un annuaire d'adresses, aucun jeu dans l'app |
| Armes — références | **Rares** | Rayon « Armureries & Stands de tir », idem |
| Violence (réaliste, fantastique, sang) | **Aucune** | — |
| Contenu sexuel ou nudité | **Aucun** | — |
| Horreur, thèmes effrayants | **Aucun** | — |
| Contenu médical ou traitement | **Aucun** | Pharmacies et vétérinaires sont des adresses, pas des conseils |
| Jeux d'argent réels | **Non** | Aucune mise, aucun jeu |
| Contenu créé par les utilisateurs | **Oui** | Fil, reels, stories, commentaires, messages |
| Fonctions de modération | **Oui** | Filtrage automatique des textes ; signalement des publications, commentaires, stories, messages, sorties et comptes ; blocage appliqué par le serveur ; suspension |
| Messagerie sans restriction | **Oui** | Messages privés et réponses aux stories |
| Partage de position entre utilisateurs | **Oui** | Carte sociale, visibilité activable |
| Rencontre / mise en relation | **Oui** | Tind (swipe) et Rencontres — **réservés aux 18 ans et plus**, refus côté serveur, message dans l'app |
| Accès web non filtré | **Non** | Pas de navigateur intégré |
| Concours | **Non** | — |

Le questionnaire calcule le palier et **te l'affiche avant de valider**. Objectif : **16+**. S'il
sort 18+, le levier est de retirer des rayons — jamais de minorer les réponses.

Précédent utile si on te le conteste : **Yelp**, annuaire de lieux comparable, porte les mentions
« alcool, tabac, drogues » et « armes » sans être réservé aux adultes.

### 3.4 Confidentialité de l'app

Réponds **non** à « suivi entre applications » : `NSPrivacyTracking` est à faux et aucune régie
publicitaire n'est intégrée. Cela t'évite la fenêtre ATT.

✅ **Publiée le 24/09/2026** dans App Store Connect, après audit du code. 18 types, **tous liés au
compte**, aucun suivi publicitaire. À reprendre à l'identique dans la « Sécurité des données » de
Google (§4.3) :

| Donnée collectée | Liée au compte | Suivi | Finalité |
|---|---|---|---|
| Nom, e-mail, téléphone, adresse postale | Oui | Non | Compte, livraison des commandes |
| Position précise **et** approximative | Oui | Non | Lieux autour de soi ; carte des membres et Rencontres si activées |
| Informations sensibles (« intéressé par » : hommes / femmes / tous) | Oui | Non | Tind et Rencontres |
| Messages, photos et vidéos, données audio (vocaux), autre contenu (bio, avis, assistant) | Oui | Non | Fonctionnement de l'app |
| Identifiant utilisateur, identifiant d'appareil | Oui | Non | Compte, notifications |
| Historique d'achats | Oui | Non | Abonnements, boutique |
| Interactions avec le produit | Oui | Non | Fonctionnement + analyses |
| Plantages, performance | Oui | Non | Diagnostic (Sentry, rattaché à l'identifiant) |
| Autres données (genre, année de naissance) | Oui | Non | Profil, barrière d'âge |

Sous-traitants, si le formulaire les demande : Sentry (diagnostic), RevenueCat (abonnements),
Stripe (paiement boutique), Google Places (données de lieux), Resend (courriels), DigitalOcean
(hébergement).

### 3.5 Abonnements

À créer **avant** de soumettre : une app qui propose un achat introuvable côté boutique est refusée.

Un seul groupe — `YUMIA` — pour que passer d'un palier à l'autre soit une simple montée de gamme.
**Deux** niveaux (Plus n'est plus vendu), du plus cher au moins cher — c'est l'ordre qu'Apple
demande, et il est déjà en place dans le groupe « YUMIA Premium » :

| Produit | Identifiant | Prix / mois | Rang |
|---|---|---|---|
| YUMIA Diamond | `yumia_diamond_monthly` | 9,99 € | 1 |
| YUMIA Gold | `yumia_gold_monthly` | 4,99 € | 2 |

✅ **App Store Connect : créés, complets, « Prêt à soumettre »** (25/09/2026). Ils partent avec la
version 1.0 : cocher les deux dans la section « Achats intégrés et abonnements » de la version.

Nom affiché et description (les chiffres viennent de `packages/shared/src/plan-quotas.ts`) :

- **YUMIA Gold** — « 30 messages IA, 10 itinéraires et 20 envies par jour. »
- **YUMIA Diamond** — « 50 messages IA, 15 itinéraires et 40 envies par jour. »

⬜ **Play Console : à créer** (Monétiser → Produits → Abonnements), mêmes identifiants, mêmes prix,
mêmes textes, puis rattacher dans RevenueCat (app « YUMIA (Play Store) »).

Les prix viennent de `packages/shared/src/gamification.ts`. S'ils changent là-bas, ils ne changent
pas tout seuls dans les consoles : à reporter à la main.

**La boutique ne passe pas par l'achat intégré.** Biens physiques livrés à domicile, payés par
Stripe : les deux boutiques l'exigent, et c'est ce qui est implémenté.

### 3.6 Informations pour la revue

Le contenu est derrière une inscription : **sans compte de démonstration, l'app est refusée sans
même être testée.**

| Champ | Quoi mettre |
|---|---|
| Identifiant / mot de passe | Un compte réel créé sur la prod, **au palier Diamond** |
| Notes | Le texte ci-dessous |
| Contact | Nom, téléphone, ngolokonte95@gmail.com — privé, sert à Apple pour te joindre |

Pourquoi Diamond : la **carte sociale est réservée aux abonnés**. Avec un compte gratuit,
l'examinateur tombe sur un écran verrouillé, ne peut pas vérifier ce que tu déclares sur le partage
de position, et te le reproche.

Notes de revue à coller :

```
L'app nécessite un compte. Le compte de test fourni est actif au palier Diamond pour que toutes les
fonctionnalités soient visibles, y compris la carte sociale (réservée aux abonnés).

Âge minimum 16 ans, vérifié à l'inscription : une date de naissance est demandée, et une inscription
en dessous est refusée côté serveur.

L'app référence des lieux publics réservés aux adultes (bars, caves à vin, casinos, armureries).
Ce sont des adresses et des horaires issus de Google Places : l'app ne vend pas ces produits, ne
propose aucun jeu d'argent et aucune arme.

La boutique vend des biens physiques livrés à domicile, payés par Stripe hors achat intégré.
Les trois abonnements passent par l'achat intégré.
```

### 3.7 Le reste des cases

| Question | Réponse |
|---|---|
| Chiffrement (export) | Oui, mais **exempté** : uniquement HTTPS/TLS standard |
| Droits sur le contenu | Aucun contenu de tiers nécessitant une autorisation |
| Identifiant publicitaire (IDFA) | Non |
| Mise en vente | Manuelle, après validation |

> Sign in with Apple est déjà implémenté — obligatoire dès lors que l'app propose Google. Ne le
> retire pas : c'est un motif de refus immédiat.

---

## 4. Play Console, écran par écran

### 4.1 Fiche du store

| Champ | Valeur |
|---|---|
| Titre | `YUMIA : Sorties, IA & Vacances` |
| Description courte | `Sorties, itinéraires, cadeaux : l'IA choisit le lieu parfait autour de toi.` |
| Description complète | `FICHES-STORES.md` |
| Catégorie | Style de vie |
| Courriel | contact@yumia.eu |
| Site | https://yumia.eu |
| Confidentialité | https://yumia.eu/privacy |

Visuels — **tous déjà produits**, sauf les captures :

| Élément | Fichier | État |
|---|---|---|
| Icône 512×512 | `apps/mobile/assets/icon-play-512-black-v2.png` | prêt |
| Image mise en avant 1024×500 | `apps/mobile/assets/feature-graphic-1024x500-v2.png` | prêt |
| Captures téléphone 1080×1920 | `C:\Users\DELL\Downloads\captures-google` (10 fichiers) | **prêtes** (§6) |

### 4.2 Accès à l'app

Coche « certaines fonctionnalités sont restreintes » et donne **les mêmes identifiants Diamond**
qu'à Apple, avec la même explication. Google refuse aussi les apps qu'il ne peut pas ouvrir.

### 4.3 Sécurité des données

Mêmes données qu'en §3.4 (la déclaration Apple publiée le 24/09/2026 fait foi). Réponses
transversales :

- Données **chiffrées en transit** : oui, HTTPS partout.
- L'utilisateur peut **demander la suppression** : oui — dans l'app (Réglages → Supprimer mon
  compte, suppression immédiate et complète, fichiers compris) et par
  https://yumia.eu/delete-account (Google exige l'URL **en plus** du parcours in-app).
- Aucune donnée n'est **partagée** avec des tiers à des fins publicitaires. Les sous-traitants
  (Anthropic pour l'IA, Sentry, RevenueCat, Resend, Google Places, DigitalOcean) sont des
  prestataires, pas des destinataires au sens de Google : répondre « collectées », pas « partagées »,
  sauf pour Anthropic (le texte des demandes) qu'il est plus sûr de déclarer partagé, finalité
  « fonctionnalités de l'app », avec consentement (demandé dans l'app avant le premier usage).

### 4.4 Classification du contenu (IARC)

Mêmes réponses qu'en §3.3 : contenu utilisateur oui, messagerie oui, partage de position oui,
rencontre oui, références à l'alcool et au tabac oui, jeux d'argent et armes en référence
seulement, aucune violence, aucun contenu sexuel.

### 4.5 Public cible

Tranches d'âge : **16-17 ans** et **18 ans et plus**. Ne coche aucune tranche en dessous : l'app
basculerait sous le programme *Families*, dont les règles sont bien plus strictes, et contredirait
ta propre barrière. Précise dans le questionnaire que **Tind et les Rencontres sont réservés aux
18 ans et plus** (refus côté serveur, écran d'explication pour les 16-17 ans) : Google vérifie
qu'une app accessible aux mineurs ne les met pas en relation avec des adultes.

### 4.6 Déclarations

| Question | Réponse |
|---|---|
| Publicités | Non |
| Application d'actualités | Non |
| COVID-19 / traçage | Non |
| Fonctionnalités financières | Non — la boutique vend des biens physiques |
| Santé | Non |
| Application publique / gouvernementale | Non |
| Identifiant publicitaire | Non |
| **Localisation en arrière-plan** | **Non** — retirée (§5), donc ni formulaire ni vidéo |
| **Normes de sécurité des enfants (CSAE)** | **Obligatoire** pour une app sociale : cocher la déclaration et donner l'URL d'une page publique décrivant les normes, le signalement dans l'app et le point de contact (page à publier sur yumia.eu, à rédiger) |
| Statut de professionnel (DSA) | Même mur qu'en §3.2 : dépend de l'immatriculation |

---

## 5. Permissions Android — la vraie liste

Celle d'`app.json` n'en est qu'une partie : les plugins en ajoutent. La liste qui fait foi est
celle que produit la configuration :

```bash
cd apps/mobile && npx expo config --type introspect | sed -n '/permissions:/,/]/p'
```

Au 25 septembre 2026 (après nettoyage) : INTERNET, ACCESS_NETWORK_STATE, ACCESS_COARSE_LOCATION,
ACCESS_FINE_LOCATION, CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, VIBRATE, WAKE_LOCK, BLUETOOTH,
SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE (limitées à Android 12 et moins, `maxSdkVersion=32`).
**Retirées** : READ_MEDIA_IMAGES / VIDEO / AUDIO / VISUAL_USER_SELECTED et ACCESS_MEDIA_LOCATION
(l'app n'écrit dans la galerie que pour enregistrer, elle ne la lit pas — la règle Play « photos et
vidéos » ne s'applique donc plus), FOREGROUND_SERVICE_MEDIA_PLAYBACK (plus de lecture audio en
arrière-plan), localisation en arrière-plan, AD_ID.

✅ **Pas de localisation en arrière-plan**, pas d'identifiant publicitaire :

```bash
cd apps/mobile && npx expo config --type introspect | grep -iE "BACKGROUND_LOCATION|AD_ID|NSLocationAlways"
```

Aucune sortie attendue. La diffusion de position sur la carte sociale ne fonctionne plus que
l'écran ouvert, et le serveur oublie la position au bout de 10 minutes.

---

## 6. Captures d'écran

✅ **App Store : faites** (15 septembre 2026), remplacées dans App Store Connect par de vraies
captures de l'app.

✅ **Play Store : faites** (25/09/2026) — `C:\Users\DELL\Downloads\captures-google`, 10 captures
1080×1920. Les images d'Apple ne conviennent PAS telles quelles : Google refuse un ratio supérieur à
2:1, or 1284×2778 fait 2,16. La capture entière (barre d'onglets comprise) est réduite et centrée
sur un fond sombre, coins arrondis.

Les cinq maquettes dessinées de `docs/stores/screenshots/` sont donc périmées : elles datent d'avant
la boutique, l'assistant cadeaux et les itinéraires de séjour. Ne les réutilise pas.

Formats : 1284×2778 (iPhone 6,5″) pour Apple ; 1080×1920 pour Google.

Dix écrans, dans cet ordre (les trois premiers apparaissent dans les résultats de recherche) :
**accueil**, **carte**, **assistant**, **itinéraire (mode date)**, **social**, **explorer**,
**fiche d'un lieu**, **univers**, **desserts**, **mode voyage**.

Deux façons de les produire :

1. **De vraies captures depuis le development build** — c'est ce qu'il faut viser, et ce qui donne
   les meilleures fiches. Bloqué sur le build (§8).
2. **Régénérer les maquettes** : `node docs/stores/build-screenshots.mjs`. Un pis-aller acceptable
   pour une première soumission, à condition de mettre le script à jour pour les écrans actuels.

---

## 7. Avant de cliquer sur « Envoyer »

- [ ] Le compte de démonstration existe, est en Diamond, et tu viens de t'y connecter
- [ ] `node docs/stores/check-lengths.mjs` → 13 conformes
- [ ] Les deux abonnements (Gold, Diamond) sont créés dans les deux consoles et rattachés à la version
- [ ] La déclaration « Normes de sécurité des enfants » est remplie côté Google, avec sa page en ligne
- [ ] Le test fermé Google a tourné 14 jours avec 12 testeurs (compte développeur individuel)
- [ ] Les captures montrent la version actuelle de l'app
- [ ] https://yumia.eu/privacy, /terms et /delete-account répondent
- [ ] La classification affichée est bien 16+ des deux côtés, Tind et Rencontres 18+ dans l'app
- [ ] Le build soumis est celui d'après l'audit (25/09/2026) : iPhone seul, permissions nettoyées,
      texte de position à jour, consentement IA

---

## 8. Ce qui bloque encore

1. **Le statut de professionnel (DSA)** — les deux boutiques exigent de déclarer si tu vends en
   tant que professionnel, et vérifient les informations fournies. C'est ce qui conditionne la
   distribution dans l'Union européenne, et c'est la seule question qui reste ouverte.

   **Stripe n'est pas concerné** : un compte de particulier suffit en France, et l'éditeur encaisse
   déjà des paiements Stripe sur d'autres boutiques sans numéro d'immatriculation. Ne redis pas le
   contraire — c'était une supposition, démentie par l'usage.
2. **La build EAS de production** (iPhone seul + Android `.aab`) — décision de l'éditeur : lancée
   seulement quand toutes les fiches sont remplies. Côté Google, elle sert d'abord au **test fermé
   obligatoire : 12 testeurs pendant 14 jours** avant de pouvoir demander la production.
3. **Les abonnements côté Play Console** (Apple : faits) — puis rattachement RevenueCat.
4. **La page « Normes de sécurité des enfants »** sur yumia.eu, exigée par Google pour une app
   sociale (§4.6).
5. **La connexion Google** — clients OAuth iOS et Android à créer dans Google Cloud ; tant qu'ils
   manquent, le bouton est masqué dans l'app (acceptable pour une première version).

Réglés : l'âge (16 ans partout, Tind et Rencontres 18+), la localisation en arrière-plan, les
captures des deux boutiques, la déclaration de confidentialité Apple, le compte de démonstration.

Réglés : l'âge (16 ans partout, barrière côté serveur) et la localisation en arrière-plan
(retirée de la première soumission).
