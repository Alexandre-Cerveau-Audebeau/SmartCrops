# SmartCrops — Trame de contenu légal (FR)
## Mentions légales · Politique de confidentialité (RGPD) · CGU · Bannière cookies

> **Note d'usage.** Trame de travail rédigée pour SmartCrops v2 (projet personnel/portfolio, service gratuit, hébergé en France). Elle est ancrée dans le fonctionnement **réel** de l'application (données effectivement collectées, cookie d'auth HttpOnly, sources botaniques tierces). Ce n'est **pas un avis juridique** : avant mise en production publique, une relecture par un professionnel du droit est recommandée.
>
> **Légende des balises** :
> - `[À REMPLIR : …]` — information personnelle/factuelle à fournir par Alexandre.
> - `[À CONFIRMER : …]` — valeur probable mais à vérifier à la source.
> - `[OPTION]` — clause facultative, à garder ou retirer.
> - `[À ACTIVER quand …]` — section à publier seulement quand la fonctionnalité existera.
>
> **Langues** : pages légales rédigées en **français** (versions EN = traductions de courtoisie ; prévoir la mention « la version française fait foi »).

---

## 0. Checklist — décisions & infos à fournir (résumé)

1. **Identité de l'éditeur** : nom complet + adresse de contact (voir §1, choix A/B sur l'anonymat).
2. **Email de contact** dédié (ex. `contact@…` / `privacy@…`) — utilisé dans les 3 pages.
3. **Entité d'hébergement exacte** : OVH (vérifier la dénomination/adresse sur ovhcloud.com).
4. **Licence du repo GitHub** (le code est public — quelle licence ?).
5. **Durées de conservation** à trancher (§2.6 — des valeurs par défaut raisonnables sont proposées).
6. **Présence d'analytics** : aujourd'hui aucun connu → variante cookies A. Si ajout futur (ex. mesure d'audience), basculer en variante B + mettre à jour §2 et §4.
7. **Date de mise à jour** à afficher en tête de chaque page légale.

---

# 1. MENTIONS LÉGALES

*(Obligation : loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique — LCEN.)*

## 1.1 Éditeur du site

> **Choix à faire — deux options légales :**
>
> **Option A — Identité publiée (recommandée ici).** Le site est édité à titre non professionnel par :
> **[À REMPLIR : Prénom NOM]** — particulier
> Contact : **[À REMPLIR : email de contact]**
> *(L'adresse postale d'un particulier n'a pas à être publiée si un moyen de contact effectif est fourni ; elle doit en revanche être connue de l'hébergeur.)*
>
> **Option B — Éditeur non professionnel anonyme (art. 6-III-2 LCEN).** Un particulier éditant un site à titre non professionnel peut ne pas publier son identité, à condition d'avoir communiqué ses coordonnées complètes à l'hébergeur. La page indique alors seulement : « Le site est édité à titre non professionnel. Conformément à l'article 6-III-2 de la LCEN, l'éditeur a transmis ses éléments d'identification personnelle à l'hébergeur ci-dessous. »
>
> **Recommandation** : Option A — le dépôt GitHub du projet est public et déjà au nom de son auteur ; l'anonymat n'apporterait rien et l'identité affichée sert l'objectif portfolio.

## 1.2 Directeur de la publication

**[À REMPLIR : Prénom NOM]** (l'éditeur).

## 1.3 Hébergement

Le site est hébergé par :
**OVH** `[À CONFIRMER : dénomination exacte — OVH SAS / OVHcloud — et adresse du siège (Roubaix, France) sur https://www.ovhcloud.com]`
`[OPTION : numéro de téléphone public de l'hébergeur]`

## 1.4 Propriété intellectuelle

- La structure du site, ses textes originaux, son logo et sa charte graphique sont la propriété de l'éditeur, sauf mention contraire. Le code source du projet est publié sur GitHub sous licence `[À CONFIRMER : licence du dépôt]`.
- **Données et médias botaniques** : les fiches de plantes agrègent des données et images issues de sources tierces, utilisées conformément à leurs conditions et licences respectives :
  - **GBIF** (Global Biodiversity Information Facility) — taxonomie ;
  - **Trefle** — données botaniques et photographies (la licence propre à chaque image est affichée avec celle-ci) ;
  - **Perenual** — données de culture et d'entretien ;
  - **Unsplash** — photographies d'illustration (crédit photographe affiché).
- Ces contenus tiers restent la propriété de leurs auteurs/éditeurs respectifs. Toute réutilisation doit respecter la licence indiquée à la source.

## 1.5 Contact

Pour toute question relative au site : **[À REMPLIR : email de contact]** *(ou via la page Contact).*

---

# 2. POLITIQUE DE CONFIDENTIALITÉ

*Dernière mise à jour : `[À REMPLIR : date]`*

## 2.1 Qui est responsable du traitement ?

Le responsable du traitement des données personnelles collectées sur SmartCrops est l'éditeur du site : **[À REMPLIR : Prénom NOM]**, joignable à **[À REMPLIR : email]**. SmartCrops est un projet personnel, gratuit et sans finalité commerciale.

## 2.2 Quelles données sont collectées, et pourquoi ?

| Traitement | Données | Finalité | Base légale (RGPD art. 6) |
|---|---|---|---|
| **Compte utilisateur** | Email, mot de passe (stocké **haché**, jamais en clair) | Création et gestion du compte, authentification | Exécution du contrat (CGU) |
| **Connexion Google** (optionnelle) | Identifiant de compte Google, email, nom transmis par Google lors de l'authentification OAuth | Authentification sans mot de passe | Exécution du contrat |
| **Profil** (facultatif) | Nom d'affichage, prénom, nom, ville | Personnalisation du compte | Exécution du contrat |
| **Contenus créés** | Jardins (nom, description, plan, plantes placées), notes, suggestions de plantes | Fourniture du service (sauvegarde et affichage de vos jardins) | Exécution du contrat |
| **Cookies de session** | Cookie d'authentification (technique, **HttpOnly**) | Maintien de la session connectée | Intérêt légitime (fonctionnement du service) — cookie strictement nécessaire |
| **Préférence de langue** | Choix FR/EN `[À CONFIRMER : stocké en localStorage du navigateur]` | Affichage dans votre langue | Intérêt légitime |
| **Journaux techniques** | Adresse IP, user-agent, horodatage des requêtes | Sécurité, prévention des abus, diagnostic | Intérêt légitime |
| **Formulaire de contact** `[À ACTIVER quand le backend contact sera livré]` | Nom, email, sujet, message | Répondre à votre demande | Intérêt légitime / consentement |
| **Newsletter** `[À ACTIVER quand le backend newsletter sera livré]` | Email | Envoi d'astuces et d'actualités du projet | **Consentement** (désinscription possible à tout moment via le lien de chaque email) |

SmartCrops **ne collecte pas** de données dites « sensibles », **ne vend pas** vos données, et **n'affiche pas** de publicité.

> `[OPTION — à publier quand le profil enrichi existera]` : si le profil est étendu (zone climatique, coordonnées GPS, type de jardin…), compléter ce tableau — finalité : recommandations personnalisées ; base légale : exécution du contrat et/ou consentement pour la géolocalisation.

## 2.3 Qui a accès à vos données ?

- **L'éditeur** du site, seul administrateur.
- **Sous-traitants techniques** :
  - **OVH** (hébergement du serveur et de la base de données, en France/UE) ;
  - **Google** (uniquement si vous choisissez la connexion Google : Google traite alors vos données d'authentification selon sa propre politique de confidentialité).
- Aucune transmission à des tiers à des fins commerciales ou publicitaires.

## 2.4 Vos données quittent-elles l'Union européenne ?

Les données du service sont hébergées **en France (OVH)**. Si vous utilisez la connexion Google, l'authentification implique Google LLC, susceptible de traiter des données hors UE dans le cadre des mécanismes de transfert reconnus `[À CONFIRMER : encadrement actuel des transferts Google (clauses contractuelles types / cadre UE–États-Unis)]`.

## 2.5 Combien de temps vos données sont-elles conservées ?

| Données | Durée proposée *(à trancher)* |
|---|---|
| Compte et contenus associés | Durée de vie du compte ; suppression effective dans un délai de `[À REMPLIR : ex. 30 jours]` après suppression du compte |
| Journaux techniques | `[À REMPLIR : ex. 12 mois maximum]` |
| Messages de contact | `[À REMPLIR : ex. 12 mois après le dernier échange]` |
| Email newsletter | Jusqu'à désinscription |

## 2.6 Comment vos données sont-elles protégées ?

Mesures en place : mots de passe stockés sous forme hachée ; cookie de session **HttpOnly** (inaccessible aux scripts) ; chiffrement des échanges via HTTPS `[À CONFIRMER : en production]` ; accès administrateur restreint ; secrets de configuration tenus hors du dépôt public.

## 2.7 Quels sont vos droits ?

Conformément au RGPD et à la loi Informatique et Libertés, vous disposez des droits suivants sur vos données : **accès**, **rectification**, **effacement**, **limitation du traitement**, **opposition**, **portabilité**, ainsi que du droit de définir des directives post-mortem.

**Pour exercer ces droits** : écrivez à **[À REMPLIR : email]** depuis l'adresse associée à votre compte (une vérification d'identité pourra être demandée). Réponse sous un mois. Vous pouvez aussi supprimer vous-même vos contenus (jardins) depuis l'application `[À CONFIRMER : et le compte lui-même, selon les fonctionnalités disponibles]`.

Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la **CNIL** (www.cnil.fr).

## 2.8 Mineurs `[OPTION]`

Le service ne s'adresse pas aux enfants de moins de 15 ans sans l'accord du titulaire de l'autorité parentale (article 45 de la loi Informatique et Libertés).

## 2.9 Évolution de cette politique

Cette politique peut évoluer avec le service (nouvelles fonctionnalités, nouveaux traitements). La date de dernière mise à jour figure en tête de page ; en cas de changement substantiel, une information sera affichée sur le site.

---

# 3. CONDITIONS GÉNÉRALES D'UTILISATION (CGU)

*Dernière mise à jour : `[À REMPLIR : date]`*

## 3.1 Objet

Les présentes CGU encadrent l'utilisation de **SmartCrops** (le « Service »), application web de gestion de jardins virtuels : bibliothèque de plantes, planification de jardin et fonctionnalités associées. L'utilisation du Service vaut acceptation des présentes CGU.

## 3.2 Accès au Service

- Le Service est **gratuit**. La consultation de la bibliothèque est libre ; certaines fonctionnalités (création de jardins, profil, suggestions) nécessitent un compte.
- Le Service est un **projet personnel en développement actif** : il est fourni « en l'état », sans engagement de disponibilité, de pérennité ni de niveau de service. Des fonctionnalités peuvent évoluer, être ajoutées ou retirées.

## 3.3 Compte utilisateur

- Vous vous engagez à fournir des informations exactes et à maintenir la confidentialité de vos identifiants. Toute activité réalisée via votre compte est réputée effectuée par vous.
- L'inscription peut s'effectuer par email/mot de passe ou via Google. Vous pouvez demander la suppression de votre compte à tout moment (voir Politique de confidentialité).

## 3.4 Contenus utilisateur

- Les contenus que vous créez (jardins, notes, suggestions de plantes) **restent les vôtres**. Vous concédez à l'éditeur la licence technique strictement nécessaire pour les héberger, les sauvegarder et vous les afficher.
- Vous vous interdisez de publier des contenus illicites, offensants ou portant atteinte aux droits de tiers. Les **suggestions de plantes** sont soumises à modération et peuvent être acceptées, modifiées ou refusées sans justification.
- L'éditeur peut retirer tout contenu manifestement contraire aux présentes CGU.

## 3.5 Données botaniques — information, pas prescription ⚠️

- Les informations botaniques (dont comestibilité, toxicité, usages dits médicinaux, périodes de culture) sont **agrégées automatiquement depuis des sources tierces** (GBIF, Trefle, Perenual) et fournies **à titre purement informatif et indicatif**. Malgré le soin apporté, elles peuvent être **incomplètes, obsolètes ou erronées**.
- **Elles ne constituent en aucun cas un avis médical, vétérinaire, alimentaire ou professionnel.** Ne consommez jamais une plante et n'en faites aucun usage thérapeutique sur la seule foi des informations du Service ; vérifiez systématiquement auprès de sources qualifiées. L'éditeur décline toute responsabilité quant aux décisions prises sur la base de ces informations.

## 3.6 Propriété intellectuelle

Voir les Mentions légales (§1.4) : éléments propres au Service d'une part, données et médias tiers sous leurs licences respectives d'autre part. L'utilisation du Service ne confère aucun droit sur ces éléments au-delà de la consultation personnelle.

## 3.7 Responsabilité

- L'éditeur s'efforce d'assurer le bon fonctionnement du Service mais ne garantit ni l'absence d'erreurs, ni la disponibilité continue, ni la conservation des données : pensez à conserver une copie de ce qui vous est précieux (`[OPTION : jusqu'à la disponibilité d'une fonction d'export]`).
- Le Service peut contenir des liens vers des sites tiers, dont l'éditeur ne contrôle pas le contenu.
- La responsabilité de l'éditeur ne saurait être engagée qu'en cas de faute prouvée, et dans les limites permises par la loi pour un service gratuit.

## 3.8 Suspension et résiliation

L'éditeur peut suspendre ou supprimer un compte en cas de violation des présentes CGU (notamment §3.4), après avertissement sauf urgence. Vous pouvez cesser d'utiliser le Service et demander la suppression de votre compte à tout moment.

## 3.9 Modification des CGU

Les CGU peuvent être modifiées pour suivre l'évolution du Service. La version applicable est celle en ligne, datée en tête de page. En cas de modification substantielle, une information sera affichée ; la poursuite de l'utilisation vaut acceptation.

## 3.10 Droit applicable

Les présentes CGU sont régies par le **droit français**. Tout litige relatif à leur exécution relève des juridictions françaises compétentes, après recherche d'une solution amiable.

---

# 4. COOKIES — TEXTES & DISPOSITIF

## 4.0 Point de conformité (à comprendre avant d'intégrer)

État **actuel** de SmartCrops : un **cookie d'authentification HttpOnly** (strictement nécessaire) + une préférence de langue `[À CONFIRMER : localStorage]`. **Aucun cookie publicitaire ni de mesure d'audience.**

→ Conséquence CNIL : les traceurs **strictement nécessaires sont exemptés de consentement**. Tant que c'est le cas, **aucune bannière de consentement bloquante n'est requise** — une **information claire** suffit (bandeau informatif + section Cookies dans la politique de confidentialité). La bannière « Accepter/Refuser/Personnaliser » du brief design devient nécessaire **le jour où** des traceurs non essentiels (analytics, etc.) sont ajoutés.

**Recommandation** : intégrer la **variante A** maintenant (légère, honnête, RGPD-clean), et garder la **variante B** maquettée/prête pour l'avenir.

## 4.1 Variante A — bandeau d'information (état actuel : cookies essentiels uniquement)

**FR** :
> 🍪 SmartCrops utilise uniquement des cookies **strictement nécessaires** au fonctionnement du site (connexion à votre compte) et mémorise votre langue. Aucun cookie publicitaire ou de suivi. [En savoir plus](lien Politique de confidentialité) — **[OK]**

**EN** :
> 🍪 SmartCrops only uses cookies that are **strictly necessary** to run the site (keeping you signed in) and remembers your language. No advertising or tracking cookies. [Learn more](link) — **[OK]**

*(Bouton unique « OK » qui masque le bandeau ; le choix est mémorisé localement.)*

## 4.2 Variante B — bannière de consentement `[À ACTIVER si traceurs non essentiels]`

**Bandeau FR** :
> 🍪 **Vos choix concernant les cookies.** Nous utilisons des cookies nécessaires au fonctionnement du site et, avec votre accord, des cookies de mesure d'audience pour améliorer SmartCrops. Vous pouvez accepter, refuser ou personnaliser. [Politique de confidentialité](lien)
> **[Tout accepter] [Tout refuser] [Personnaliser]**

**Bandeau EN** :
> 🍪 **Your cookie choices.** We use cookies required to run the site and, with your consent, audience-measurement cookies to improve SmartCrops. You can accept, decline, or customize. [Privacy policy](link)
> **[Accept all] [Decline all] [Customize]**

**Panneau « Personnaliser »** — catégories :
- **Nécessaires** — *toujours actifs* : authentification, sécurité, préférence de langue.
- **Mesure d'audience** — *toggle, désactivé par défaut* : statistiques anonymisées de fréquentation `[À REMPLIR : outil utilisé]`.
- `[OPTION : autres catégories futures]`

**Règles de comportement** (déjà alignées avec le brief design) : aucun traceur non essentiel déposé avant consentement ; « Refuser » aussi accessible qu'« Accepter » ; choix mémorisé `[À REMPLIR : ex. 6 mois]` et modifiable à tout moment via un lien « Gérer les cookies » en footer.

## 4.3 Tableau des cookies (à publier dans la Politique de confidentialité)

| Nom | Type | Finalité | Durée |
|---|---|---|---|
| `[À CONFIRMER : nom du cookie d'auth]` | Strictement nécessaire (HttpOnly) | Maintien de la session connectée | `[À CONFIRMER : durée du jeton/session]` |
| Préférence de langue | Stockage local | Mémoriser FR/EN | Persistant (jusqu'à effacement par l'utilisateur) |
| Choix cookies | Stockage local | Mémoriser votre choix sur le bandeau | `[À REMPLIR : ex. 6 mois]` |

---

# 5. Notes d'intégration (pour la phase implémentation)

1. **i18n** : clés de traduction par page (`legal.mentions.*`, `legal.privacy.*`, `legal.terms.*`, `cookies.*`) dans `fr.json`/`en.json`, comme le reste de l'app. Inclure la mention « En cas de divergence, la version française fait foi » sur les versions EN.
2. **Footer** : relier les liens morts (About Us · Contact · Privacy) + ajouter Mentions légales · CGU `[OPTION : + « Gérer les cookies » si variante B]`.
3. **Date de mise à jour** affichée en tête de Privacy et CGU (constante ou clé i18n, mise à jour à chaque changement de contenu).
4. **Newsletter (footer)** : le champ « Subscribe » existe déjà dans l'UI mais sans backend — tant que l'envoi n'est pas câblé, soit le désactiver, soit afficher un message honnête ; dès activation, exiger le consentement (case non pré-cochée si formulaire séparé) et activer la section §2.2 correspondante.
5. **Cohérence inter-pages** : §1.4 (mentions) ↔ §3.6 (CGU) ↔ crédits sources affichés sur les fiches plantes — une seule formulation des crédits GBIF/Trefle/Perenual/Unsplash, réutilisée.
