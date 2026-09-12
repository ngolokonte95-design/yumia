# Soumission aux boutiques — à remplir depuis zéro

Ce document ne décrit pas ce qui *avait été prévu* : chaque réponse ci-dessous est tirée du code de
l'app tel qu'il est aujourd'hui, et indique **où** elle a été vérifiée. Reprends chaque champ des
deux consoles à partir d'ici, sans te fier aux valeurs déjà saisies — elles datent d'avant la
boutique, l'assistant cadeaux, le social et les quatre forfaits.

Les textes marketing (nom, sous-titre, descriptions) sont dans `FICHES-STORES.md`, vérifiés par
`node docs/stores/check-lengths.mjs`.

---

## 0. À TRANCHER AVANT DE TOUCHER AUX CONSOLES

### L'âge minimum — trois valeurs contradictoires aujourd'hui

| Où | Valeur actuelle |
|---|---|
| Conditions d'utilisation en ligne (`website/terms.html`) | **13 ans** |
| Ce qui a été déclaré à la boutique | **16 ans** |
| L'app elle-même | **aucun contrôle** — l'année de naissance est déclarative |

Il faut **un seul chiffre**, repris aux trois endroits. Et ce chiffre dépend d'une décision produit :

- **Avec Tind et la carte sociale** (mise en relation entre personnes, partage de position) : les deux
  boutiques classent cela comme de la rencontre. Compte **18 ans**, une déclaration « application de
  rencontre » côté Google, et un contrôle d'âge réel à l'inscription.
- **Sans Tind ni carte sociale** dans la première version : le reste (fil, reels, messagerie) reste du
  réseau social classique. **16 ans** se défend, et la classification descend d'un cran.

Tant que ce choix n'est pas fait, les sections 3 et 4 ne peuvent pas être remplies honnêtement.

---

## 1. Identité de l'app

| Champ | Valeur | Source |
|---|---|---|
| Identifiant iOS | `com.yumia.app` | `app.json` |
| Nom de paquet Android | `com.yumia.app` | `app.json` |
| Version | `0.1.0` | `app.json` |
| Code de version Android | `8` | `app.json` |
| Catégorie principale | Voyages *(ou Style de vie)* | à confirmer |
| Catégorie secondaire | Cuisine et boissons | à confirmer |

---

## 2. Liens obligatoires

| Champ | URL | État |
|---|---|---|
| Politique de confidentialité | https://yumia.eu/privacy | en ligne |
| Conditions d'utilisation | https://yumia.eu/terms | en ligne, **à corriger** (âge) |
| Suppression de compte (exigée par Google **en plus** du parcours dans l'app) | https://yumia.eu/delete-account | en ligne |
| Support | https://yumia.eu/support | en ligne |
| Courriel de support | ngolokonte95@gmail.com | — |

---

## 3. Questionnaire de classification — réponses réelles

Réponds d'après ce que l'app **contient vraiment**, pas d'après ce qu'on aimerait déclarer. Une
réponse minorée se découvre au premier signalement et coûte le retrait.

| Question | Réponse | Pourquoi |
|---|---|---|
| Contenu publié par les utilisateurs | **Oui** | Fil, reels, stories, commentaires, messages |
| Modération et signalement | **Oui** | Filtrage automatique des textes, signalement sur les quatre surfaces, blocage, restriction |
| Messagerie entre utilisateurs | **Oui** | Messages privés, réponses aux stories |
| Partage de position entre utilisateurs | **Oui** | Carte sociale, visibilité activable, signaux |
| Mise en relation / rencontre | **Oui** si Tind reste | Écran de découverte de profils par swipe |
| Alcool, tabac, drogues — références | **Oui** | Rayons Bars, Pubs, Caves à vin, Bars à chicha, Tabac & Presse, Coffee shops |
| Jeux d'argent — références | **Oui** | Rayon Casinos (annuaire de lieux, aucun jeu dans l'app) |
| Armes — références | **Oui** | Rayon « Armureries & Stands de tir » |
| Violence, contenu sexuel, horreur | **Non** | Aucun contenu de ce type produit par l'app |
| Achats intégrés | **Oui** | Trois abonnements |
| Publicité | **Non** | Aucune régie |
| Accès web non restreint | **Non** | Pas de navigateur intégré ; liens partenaires ouverts hors de l'app |

> Ces réponses mènent à un classement élevé — **17+ chez Apple**, adolescents ou adultes chez Google.
> C'est la conséquence directe des rayons Casinos, Armureries, Coffee shops et de la mise en relation.
> Si tu vises plus bas, il faut **retirer des rayons**, pas minorer les réponses.

---

## 4. Confidentialité — données réellement collectées

Déclaré dans le manifeste iOS (`app.json`) et vérifié contre le modèle `User` de la base.

| Donnée | Liée au compte | Utilisée pour le suivi publicitaire | Finalité |
|---|---|---|---|
| Adresse e-mail | Oui | Non | Compte |
| Nom affiché | Oui | Non | Compte |
| Identifiant utilisateur | Oui | Non | Compte |
| Position précise | Non | Non | Recommandations autour de soi |
| Photos et vidéos | Oui | Non | Publications, profil |
| Autre contenu utilisateur | Oui | Non | Publications, commentaires, messages |
| Identifiant d'appareil | Non | Non | Notifications |
| Données de plantage | Non | Non | Diagnostic (Sentry) |
| Données de performance | Non | Non | Diagnostic (Sentry) |

Également stockés côté serveur, à déclarer s'ils ne le sont pas déjà : **genre**, **année de
naissance**, **pays**, **adresses de livraison** et **commandes** (boutique). Les adresses postales
sont une catégorie à part entière dans les deux formulaires — ne les oublie pas.

**Aucun suivi publicitaire** : `NSPrivacyTracking` est à faux et aucune régie n'est intégrée. Tu peux
donc répondre non à la question sur le suivi entre applications, ce qui t'évite la fenêtre ATT.

**Sous-traitants à mentionner** : Sentry (diagnostic), RevenueCat (abonnements), Stripe (paiement de
la boutique), Google Places (données de lieux), Resend (courriels), et l'hébergement DigitalOcean.

### Permissions Android déclarées

`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, `CAMERA`, `INTERNET`,
`ACCESS_NETWORK_STATE`, `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK`, `BLUETOOTH`.

⚠️ La **localisation en arrière-plan** est activée dans la configuration (`isIosBackgroundLocationEnabled`
et `isAndroidBackgroundLocationEnabled`). Google exige pour cela un formulaire de déclaration **et une
vidéo de démonstration** montrant la fonctionnalité qui la justifie. Chez nous, c'est la carte sociale
— réservée aux abonnés. Deux options : monter le dossier, ou désactiver ces deux options pour la
première soumission.

---

## 5. Achats intégrés

À créer dans les deux consoles **avant** la soumission : une app proposant un achat introuvable côté
boutique est refusée.

| Produit | Prix mensuel | Identifiant suggéré |
|---|---|---|
| YUMIA Plus | 2,99 € | `yumia_plus_monthly` |
| YUMIA Gold | 5,99 € | `yumia_gold_monthly` |
| YUMIA Diamond | 9,99 € | `yumia_diamond_monthly` |

Les prix viennent de `packages/shared/src/gamification.ts` — s'ils changent là-bas, ils changent dans
l'app **et** dans la page d'abonnement, mais pas dans les consoles : à reporter à la main.

**Les produits de la boutique ne passent pas par l'achat intégré.** Ce sont des biens physiques livrés
à domicile, payés par Stripe : les deux boutiques l'exigent, et c'est ce qui est implémenté.

---

## 6. Captures d'écran

Les cinq images de `docs/stores/screenshots/` sont des maquettes dessinées, antérieures à la boutique,
aux cadeaux et aux itinéraires de séjour. **À refaire**, idéalement depuis le *development build*, en
couvrant : Top 3, itinéraire d'une journée, assistant cadeaux, boutique, carte.

Formats : 1290×2796 (iPhone 6,7″) et 1242×2688 (6,5″) pour Apple ; les mêmes conviennent à Google.

---

## 7. Ce qui bloque encore la soumission

1. **Immatriculation** — sans elle, pas de compte développeur vendeur, et Stripe reste en test.
2. **L'âge** — trois valeurs contradictoires, à unifier (section 0).
3. **La localisation en arrière-plan** — dossier Google à monter, ou permission à retirer.
4. **Les captures** — à refaire.
5. **Les abonnements** — à créer dans les deux consoles.
