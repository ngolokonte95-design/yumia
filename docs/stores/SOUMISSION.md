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
| Courriel de support | md.developpeur.paris@gmail.com | affiché publiquement par Google |

---

## 3. App Store Connect, écran par écran

> Les libellés bougent d'une version de console à l'autre. Repère-toi au **sens** de la question,
> pas au mot exact.

### 3.1 Informations sur l'app

| Champ | Valeur |
|---|---|
| Nom | `YUMIA : Sorties, IA & Cadeaux` |
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
| Fonctions de modération | **Oui** | Filtrage automatique des textes, signalement sur les quatre surfaces, blocage, restriction de compte |
| Messagerie sans restriction | **Oui** | Messages privés et réponses aux stories |
| Partage de position entre utilisateurs | **Oui** | Carte sociale, visibilité activable |
| Rencontre / mise en relation | **Oui** | Écran Tind, découverte de profils par swipe |
| Accès web non filtré | **Non** | Pas de navigateur intégré |
| Concours | **Non** | — |

Le questionnaire calcule le palier et **te l'affiche avant de valider**. Objectif : **16+**. S'il
sort 18+, le levier est de retirer des rayons — jamais de minorer les réponses.

Précédent utile si on te le conteste : **Yelp**, annuaire de lieux comparable, porte les mentions
« alcool, tabac, drogues » et « armes » sans être réservé aux adultes.

### 3.4 Confidentialité de l'app

Réponds **non** à « suivi entre applications » : `NSPrivacyTracking` est à faux et aucune régie
publicitaire n'est intégrée. Cela t'évite la fenêtre ATT.

| Donnée collectée | Liée au compte | Suivi publicitaire | Finalité |
|---|---|---|---|
| Adresse e-mail | Oui | Non | Fonctionnement de l'app |
| Nom affiché | Oui | Non | Fonctionnement de l'app |
| Identifiant utilisateur | Oui | Non | Fonctionnement de l'app |
| Position précise | Non | Non | Fonctionnement de l'app |
| Photos et vidéos | Oui | Non | Fonctionnement de l'app |
| Autre contenu utilisateur | Oui | Non | Fonctionnement de l'app |
| Adresse postale | Oui | Non | Livraison des commandes |
| Historique d'achats | Oui | Non | Commandes de la boutique |
| Genre, année de naissance, pays | Oui | Non | Personnalisation, barrière d'âge |
| Identifiant d'appareil | Non | Non | Notifications push |
| Plantages et performance | Non | Non | Diagnostic (Sentry) |

**N'oublie ni l'adresse postale ni l'historique d'achats** : ce sont des catégories à part entière,
et la boutique en collecte depuis qu'elle existe.

Sous-traitants, si le formulaire les demande : Sentry (diagnostic), RevenueCat (abonnements),
Stripe (paiement boutique), Google Places (données de lieux), Resend (courriels), DigitalOcean
(hébergement).

### 3.5 Abonnements

À créer **avant** de soumettre : une app qui propose un achat introuvable côté boutique est refusée.

Un seul groupe — `YUMIA` — pour que passer d'un palier à l'autre soit une simple montée de gamme.
Trois niveaux dans ce groupe, du moins cher au plus cher :

| Produit | Identifiant | Prix / mois | Rang |
|---|---|---|---|
| YUMIA Plus | `yumia_plus_monthly` | 2,99 € | 1 |
| YUMIA Gold | `yumia_gold_monthly` | 5,99 € | 2 |
| YUMIA Diamond | `yumia_diamond_monthly` | 9,99 € | 3 |

Chaque abonnement demande un nom affiché et une description :

- **Plus** — « Deux fois plus de tout : assistant, itinéraires, chargements de lieux, et la carte
  sociale débloquée. »
- **Gold** — « Pour les curieux quotidiens : 40 messages par jour, 20 chargements par univers,
  30 lieux affichés par chargement. »
- **Diamond** — « Le maximum : 60 messages par jour, 30 chargements par univers, 40 lieux affichés,
  et For You sans se rationner. »

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
| Titre | `YUMIA : Sorties, IA & Cadeaux` |
| Description courte | `Sorties, itinéraires, cadeaux : l'IA choisit le lieu parfait autour de toi.` |
| Description complète | `FICHES-STORES.md` |
| Catégorie | Style de vie |
| Courriel | md.developpeur.paris@gmail.com |
| Site | https://yumia.eu |
| Confidentialité | https://yumia.eu/privacy |

Visuels — **tous déjà produits**, sauf les captures :

| Élément | Fichier | État |
|---|---|---|
| Icône 512×512 | `apps/mobile/assets/icon-play-512.png` | prêt |
| Image mise en avant 1024×500 | `apps/mobile/assets/feature-graphic-1024x500.png` | prêt |
| Captures téléphone | `docs/stores/screenshots/` | **à refaire** (§6) |

### 4.2 Accès à l'app

Coche « certaines fonctionnalités sont restreintes » et donne **les mêmes identifiants Diamond**
qu'à Apple, avec la même explication. Google refuse aussi les apps qu'il ne peut pas ouvrir.

### 4.3 Sécurité des données

Mêmes données qu'en §3.4. Deux réponses transversales :

- Données **chiffrées en transit** : oui, HTTPS partout.
- L'utilisateur peut **demander la suppression** : oui — dans l'app, et par
  https://yumia.eu/delete-account (Google exige l'URL **en plus** du parcours in-app).

### 4.4 Classification du contenu (IARC)

Mêmes réponses qu'en §3.3 : contenu utilisateur oui, messagerie oui, partage de position oui,
rencontre oui, références à l'alcool et au tabac oui, jeux d'argent et armes en référence
seulement, aucune violence, aucun contenu sexuel.

### 4.5 Public cible

Tranches d'âge : **16-17 ans** et **18 ans et plus**. Ne coche aucune tranche en dessous : l'app
basculerait sous le programme *Families*, dont les règles sont bien plus strictes, et contredirait
ta propre barrière.

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
| Statut de professionnel (DSA) | Même mur qu'en §3.2 : dépend de l'immatriculation |

---

## 5. Permissions Android — la vraie liste

Celle d'`app.json` n'en est qu'une partie : les plugins en ajoutent. La liste qui fait foi est
celle que produit la configuration :

```bash
cd apps/mobile && npx expo config --type introspect | sed -n '/permissions:/,/]/p'
```

Au 13 septembre 2026, dix-neuf permissions, dont aucune classée sensible par Google : localisation
approximative et précise, micro, caméra, réseau, Bluetooth, réveil, service au premier plan,
fenêtre système, et les accès média (images, vidéo, audio, sélection partielle).

✅ **Pas de localisation en arrière-plan**, pas d'identifiant publicitaire :

```bash
cd apps/mobile && npx expo config --type introspect | grep -iE "BACKGROUND_LOCATION|AD_ID|NSLocationAlways"
```

Aucune sortie attendue. La diffusion de position sur la carte sociale ne fonctionne plus que
l'écran ouvert, et le serveur oublie la position au bout de 10 minutes.

---

## 6. Captures d'écran

Les cinq images de `docs/stores/screenshots/` sont des maquettes dessinées, antérieures à la
boutique, à l'assistant cadeaux et aux itinéraires de séjour. **À refaire.**

Formats : 1290×2796 (iPhone 6,7″) et 1284×2778 (6,5″) — les mêmes conviennent à Google.

Cinq écrans, dans cet ordre : **Top 3 du jour**, **itinéraire d'une journée**, **assistant
cadeaux**, **boutique**, **carte des lieux**.

Deux façons de les produire :

1. **De vraies captures depuis le development build** — c'est ce qu'il faut viser, et ce qui donne
   les meilleures fiches. Bloqué sur le build (§8).
2. **Régénérer les maquettes** : `node docs/stores/build-screenshots.mjs`. Un pis-aller acceptable
   pour une première soumission, à condition de mettre le script à jour pour les écrans actuels.

---

## 7. Avant de cliquer sur « Envoyer »

- [ ] Le compte de démonstration existe, est en Diamond, et tu viens de t'y connecter
- [ ] `node docs/stores/check-lengths.mjs` → 13 conformes
- [ ] Les trois abonnements sont créés **et** approuvés dans les deux consoles
- [ ] Les captures montrent la version actuelle de l'app
- [ ] https://yumia.eu/privacy, /terms et /delete-account répondent
- [ ] La classification affichée est bien 16+ des deux côtés
- [ ] Le build soumis contient la barrière d'âge

---

## 8. Ce qui bloque encore

1. **Le statut de professionnel (DSA)** — les deux boutiques exigent de déclarer si tu vends en
   tant que professionnel, et vérifient les informations fournies. C'est ce qui conditionne la
   distribution dans l'Union européenne, et c'est la seule question qui reste ouverte.

   **Stripe n'est pas concerné** : un compte de particulier suffit en France, et l'éditeur encaisse
   déjà des paiements Stripe sur d'autres boutiques sans numéro d'immatriculation. Ne redis pas le
   contraire — c'était une supposition, démentie par l'usage.
2. **Le development build** — il valide d'un coup les cartes Android, le crash carte iOS et la
   barrière d'âge. Rien ne se teste en vrai avant lui, et les captures en dépendent.
3. **Les captures** — §6.
4. **Les abonnements** — à créer dans les deux consoles.
5. **Le compte de démonstration** — à créer sur la prod, en Diamond (§3.6).

Réglés : l'âge (16 ans partout, barrière côté serveur) et la localisation en arrière-plan
(retirée de la première soumission).
