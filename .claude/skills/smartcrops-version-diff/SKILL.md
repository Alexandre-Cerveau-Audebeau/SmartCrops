---
name: smartcrops-version-diff
description: Produit un fichier diff narratif de version du projet SmartCrops (SmartCrops_vN_to_vN+1_diff.md) qui capture une période de travail — non seulement CE qui a été fait, mais les décisions prises ET écartées avec leurs raisons, les apprentissages, ce qui a été ajouté au projet et COMMENT, l'état de l'environnement de dev, ce que l'utilisateur a fait/décidé, et les outils choisis/refusés. Use when Alexandre demande "fais-moi un diff", "génère le diff de version", "documente cette session", "diff vN→vN+1", "complète le diff", ou toute demande de capturer une session/période de travail SmartCrops dans le doc projet. Le diff alimente la prochaine version de SmartCrops_v2_Project_Description (fusion via la skill smartcrops-consolidation).
---

# smartcrops-version-diff

Génère un **diff de version** SmartCrops : un document markdown narratif qui documente une période de travail (typiquement une session longue ou plusieurs PRs liées) de façon à ce que, des mois plus tard, on retrouve **pourquoi** on a fait les choses, pas seulement quoi.

Ce n'est PAS un changelog mécanique (`git log`). Un changelog liste des commits ; ce diff capture le **raisonnement** : les arbitrages, les options rejetées et leur motif, les apprentissages empiriques, les patterns établis, l'évolution de la méthode de travail et de l'outillage. C'est la mémoire de conception du projet.

**Les 4 fonctions du diff** (à garder en tête en écrivant) :
1. **Contexte pour le chat courant** (toi, maintenant).
2. **Contexte pour un futur chat qui prendra la relève** — il doit pouvoir reprendre le travail sans rien re-deviner : état du run en cours, secrets/tokens, gotchas d'environnement, décisions verrouillées.
3. **Voir l'évolution du projet** — y compris **ce que l'utilisateur (Alexandre) a fait/décidé lui-même**, pas seulement le code.
4. **Documenter erreurs, trouvailles, réussites, et l'évolution de notre façon de travailler** — y compris **les outils qu'on choisit ou qu'on refuse, et pourquoi**.

## Quand l'utiliser

- Alexandre dit "fais-moi un diff", "documente la session", "diff vN→vN+1", "complète le diff".
- Fin d'une session dense, ou après une grappe de PRs formant un tout cohérent (un scale-up, une feature, une refonte).
- Avant de fusionner le contenu dans `SmartCrops_v2_Project_Description` (le diff ALIMENTE la prochaine version vN+1 du doc projet — la fusion est faite par la skill `smartcrops-consolidation` ; le diff reste un artefact distinct, jamais la description elle-même).

## Étape 0 — déterminer le périmètre (la frontière vN → vN+1)

1. **Trouver la dernière version.** Lister les fichiers projet ET le répertoire de sortie (`/mnt/user-data/outputs/`), repérer le dernier `SmartCrops_vN_to_vN+1_diff.md` (le N+1 le plus élevé) **et tout fichier `_COMPLEMENT`/`_supplement` associé**. Le nouveau diff est `vN+1_to_vN+2`. Si la série de diffs et la version du doc projet divergent, demander à Alexandre quelle est la version courante.
2. **Lire le dernier diff EN ENTIER** — pour deux raisons : (a) reproduire son format exactement, (b) identifier son **point de coupure** (la DERNIÈRE PR/commit qu'il documente, souvent visible dans sa section "Next priorities"). Le nouveau diff commence précisément là. Ne jamais re-couvrir ce que le précédent a déjà documenté.
   - **⚠️ Vérifier la CONTINUITÉ des PRs (garde-fou critique).** Le piège : sauter du point de coupure du dernier diff (ex. PR #84) directement à la première PR fraîche en mémoire (ex. #92), en oubliant le segment intermédiaire (#85→#91). **Lister explicitement TOUTES les PRs mergées entre le point de coupure et la première PR du nouveau diff** (via `gh pr list --state merged --base develop` si Claude Code dispo, ou en demandant à Alexandre, ou en grep des transcrits). Aucun numéro de PR ne doit manquer dans la chaîne. Si une PR du segment n'a pas de détail documentable (mergée dans une session dont on n'a pas le transcript), **le SIGNALER** — soit combler depuis le bon transcript (`journal.txt` liste les transcrits passés), soit ajouter une note explicite dans le diff ("PRs #X-#Y couvertes en session antérieure, non re-documentées"). Ne JAMAIS inventer le contenu d'une PR du trou.
3. **Reconstituer la période** depuis toutes les sources disponibles, par ordre de fiabilité :
   - Le **résumé de compaction** en tête de conversation (si la session a été compactée) — couvre le début.
   - La **conversation visible** — couvre la fin.
   - Le **transcript** sur disque (`/mnt/transcripts/...`) si mentionné — pour les détails fins (SHAs, raisons exactes, options écartées) que la compaction a pu abréger. Le lire de façon **ciblée** (grep des SHAs, tickets, noms de décisions, mots-clés d'environnement comme `pgAdmin`/`5432`/`setx`), PAS ligne par ligne : les transcripts sont massifs et peuvent contenir des blocs de pensée corrompus. Croiser, ne pas se fier à une seule source.
   - Les **récaps de session/délégation** présents au projet (ex. `SmartCrops_Recap_Session_Delegation_*.md`) — trace exhaustive d'un segment mené hors du chat courant : SHAs finaux, counts, ledgers. Source de rang élevé pour ce qu'un kit/une compaction abrège.
   - **Linear — par REQUÊTE LIVE, pas de mémoire** : `list_issues` filtré `updatedAt` sur la période — en PRÉFILTRE seulement : valider chaque ticket par ses champs d'état réels (`createdAt`/`completedAt`/`canceledAt`/`status`), car `updatedAt` bouge à tout événement (commentaire, label) et peut inclure du hors-période comme masquer un changement d'état ancien ; et CONSOMMER TOUTES LES PAGES (`hasNextPage`/cursor) avant de conclure. **C'est cette vérification machine qui attrape ce que les sources narratives ratent** — cas réel (15/07/2026) : SMA-5 auto-fermé au merge #171 parce que Linear a parsé la branche `sma-5-2-garden-plants-truth` comme SMA-5 ; ni le kit ni le récap ne le mentionnaient, seuls les `completedAt` identiques à la milliseconde l'ont révélé. ⚠️ Gotcha gravé : **Linear AUTO-LIE (auto-link) puis AUTO-FERME le ticket SMA-N quand une branche nommée `sma-N-…` est mergée** — vérifier les tickets fermés « en trop » au timestamp de chaque merge.
4. **Dater sans inventer.** Une date de merge absente des sources peut être **bornée par la machine** (bornes valides : borne INFÉRIEURE du merge = un événement qui le précède démontrablement, ex. le `createdAt` d'un ticket cr-* de la PR — le harvest précède le merge, donc merge ≥ ce timestamp ; borne SUPÉRIEURE stricte = un événement démontrablement POSTÉRIEUR au merge, ex. la base du commit/de la branche suivante, le push suivant ; l'auto-close Linear déclenché PAR le merge partage son timestamp = une ÉGALITÉ à epsilon près (utilisable comme « merge ≈ ce timestamp », à étiqueter ainsi), PAS une postériorité stricte. Ne JAMAIS utiliser un timestamp pré-merge comme borne supérieure ; à défaut, date = borne basse unilatérale ou inconnue) — le bornage se **signale comme tel** dans le diff, jamais présenté comme une date directe.

## Étape 1 — collecter le contenu OBLIGATOIRE

Un bon diff répond à TOUTES ces questions (c'est ce qui le distingue d'un changelog). Pour la période :

- **Ce qui a été fait** : PRs mergées (numéro + SHA squash + date + nb de rounds CR **+ run IDs CodeRabbit par round (run ID = le "Run ID" du bloc "Review info" GitHub, un par round ; si non capturé, marqueur explicite "run ID non capturé — voir ledger Linear" ; ne PAS confondre avec `comments[].id` du JSON harvest, qui identifie un commentaire, pas un run)**), features livrées, tickets clos. Données chiffrées (tests avant→après, lignes, volumes DB).
- **Les choix FAITS et POURQUOI** : chaque décision d'architecture/produit non triviale, avec son rationale. Pas "on a choisi X" mais "on a choisi X parce que Y, malgré Z".
- **Les choix NON faits et POURQUOI** : les options explicitement rejetées (souvent le plus précieux — ça évite de re-débattre). Ex. "on n'a PAS porté en cross-platform parce que…", "l'annexe Perenual n'a PAS d'API donc hors scope".
- **Ce qu'on a appris** : apprentissages empiriques, surtout ceux qu'on ne pouvait découvrir qu'en faisant (bugs révélés par le volume, comportements d'outils, quirks d'environnement). Distinguer "confirmé empiriquement" de "supposé".
- **Ce qu'on a ajouté au projet** : nouveaux fichiers, scripts, skills, tickets, conventions, ADRs — et **COMMENT** (l'approche, le workflow suivi, pas juste le résultat).
- **L'état de l'ENVIRONNEMENT / OUTILLAGE** : ce qui a changé ou piégé dans l'environnement de dev — ports/services (ex. Postgres natif Windows qui squatte 5432), conteneurs Docker, gestion des secrets (`setx` scope User, redaction), outils d'inspection (pgAdmin, psql), sessions parallèles, quirks OS (Bash↔backslashes, CRLF/BOM). Un futur chat doit hériter de ces gotchas pour ne pas retomber dedans.
- **Ce que l'UTILISATEUR (Alexandre) a fait/décidé** : actions hors-code qui font avancer le projet — rotations de clé, setup de compte/OAuth/token, décisions stratégiques, changements d'orientation du projet, demandes d'amélioration de méthode, cadence de review. Le diff doit montrer la part d'Alexandre, pas seulement celle de l'IA.
- **Les OUTILS choisis / refusés et POURQUOI** : quels outils on adopte, lesquels on écarte délibérément (ex. navigateur Claude in Chrome refusé car doc→web_fetch / DB→psql / gated→guider l'humain ; Slack non utilisé), et le motif. C'est une trace décisionnelle qui évite de re-tester des outils déjà jugés non pertinents.
- **Les patterns/décisions établis** et **l'évolution de la MÉTHODE de travail** qui valent au-delà de cette session (réutilisables) : ex. pattern d'attente avant harvest, harvest develop post-merge, `/clear` avant un run long, anti-boucle harvest.
- **Les follow-ups** : ce qui reste, par priorité, avec les liens tickets.

## Étape 1.5 — seconde passe d'AUTO-AUDIT (anti-oubli, avant de finaliser)

Après un premier jet, **re-balayer la période** spécifiquement à la recherche de ce que la 1ère passe sous-traite presque toujours (elle se concentre sur les PRs/le code et oublie le reste). Checklist :

- [ ] **Environnement** : un gotcha de port/service/Docker/secret a-t-il été rencontré et résolu ? (grep `pgAdmin`, `5432`, `port`, `setx`, `override`, `docker`).
- [ ] **Actions de l'utilisateur** : Alexandre a-t-il roté une clé, configuré un compte, décidé une orientation, demandé un changement de méthode ? (grep `rot`, `clé`, `OAuth`, `token`, `décision`, `postule`, `portfolio`).
- [ ] **Outils refusés** : ai-je écarté un outil (navigateur, Slack, autre) et pour quelle raison ? (grep `navigateur`, `Chrome`, `Slack`, `mauvais réflexe`).
- [ ] **Évolution de méthode** : un pattern de workflow a-t-il été ajouté/réintégré/abandonné ? (grep `pattern`, `attente`, `harvest develop`, `clear`, `Esc`).
- [ ] **Hygiène/méta** : nettoyage de learnings CR, mémoire pleine/consolidée, conventions changées ? (grep `learning`, `mémoire`, `30 edits`, `hygiène`).
- [ ] **Reprise future** : un futur chat a-t-il tout pour reprendre ? (état d'un run en cours, secrets, action critique en suspens, décisions verrouillées).
- [ ] **Traçabilité de review** : les run IDs CodeRabbit par round sont-ils captés (ou explicitement renvoyés au ledger Linear) ?
- [ ] **Items SANS ticket** : un finding/une décision « parkée au body de la PR » sans ticket Linear existe-t-il ? (cas réel : F5/F8 pin SETUP_CONFIRMED en #171) → le lister comme reste explicite.
- [ ] **Stocks non transités en chat** : du contenu vit-il UNIQUEMENT hors conversation (ex. mémoire de session Claude Code `memory\*.md`) ? → donner le chemin exact et le marquer 🔴 « à extraire ».
- [ ] **Anomalies Linear** : la requête live (Étape 0.3) a-t-elle révélé des fermetures/créations inattendues (auto-close par nom de branche, timestamps groupés) ? → documenter comme fait observé + hypothèse, jamais comme certitude.

Si la 1ère passe a déjà été livrée et qu'on découvre des manques, il est **explicitement permis de produire un diff COMPLÉMENTAIRE** (`SmartCrops_vN_to_vN+1_diff_COMPLEMENT.md`) plutôt que de tout réécrire — un futur chat fusionnera les deux. Le complément doit cross-référencer les §X du diff principal et ne rien contredire.

## Étape 2 — respecter le FORMAT (calé sur les diffs existants)

Structure narrative, en **français** (le workflow d'Alexandre est en français ; le code reste en anglais), dense mais lisible :

```
# SmartCrops v2 — Project Description diff vN → vN+1 (jalon en une ligne)

> Paragraphe d'intro : ce que ce diff finalise, le contexte, la période, ce qu'il
> couvre. Se termine par "À fusionner dans le doc projet en remplaçant la version vN."

---

## 0. Vue d'ensemble
  Bloc ``` ``` ASCII qui schématise le flux global de la période.
  Puis : PRs mergées (SHA + date + rounds CR + run IDs par round ou marqueur d'indisponibilité), tests (avant→après), état data/projet, develop HEAD.

## 1..N. (une section par thème majeur)
  Feature/PR/chantier : metadata (branche, commits, SHA squash, rounds CR, endpoints),
  puis le détail avec sous-sections. Inclure les décisions ET leurs raisons inline.

## (section) Findings / apprentissages
  Ce que seul le réel a révélé. Emojis de sévérité ponctuels (🔴 bloqueur, 🟠 majeur,
  ✅ validé) — avec parcimonie, comme dans les diffs existants.

## (section) Patterns / décisions établis ET évolution de la méthode de travail
  Les règles réutilisables, avec le pourquoi.

## (section) Environnement / outillage
  Gotchas d'environnement, services/ports, secrets, outils d'inspection.

## (section) Ce qu'Alexandre a fait / décidé
  Actions hors-code de l'utilisateur.

## (section) Outils — choisis / refusés et pourquoi
  Tableau ou liste : outil → statut → motif.

## (section) Découvertes workflow
  Quirks d'outils, d'environnement, de process (CR, PowerShell, Docker, etc.).

## (section) CR empirical (mis à jour)
  Comment CodeRabbit s'est comporté ce cycle (rounds, profil, hallucinations).

## (section) Issues / follow-ups
  Ce qui reste, par priorité (🔴 bloquant / plus tard), avec liens tickets SMA-N.

## (section) Next priorities
  Liste ordonnée des prochaines étapes (dont toute action critique en suspens pour une reprise).
```

**Conventions de ton** (observées dans les diffs v12→v20) :
- Dense, factuel, pas de remplissage. Chaque phrase porte de l'info.
- Les décisions s'écrivent avec leur motif : "**Décision : X** (parce que Y ; option Z rejetée car W)".
- Garder les identifiants exacts : numéros de PR, SHAs squash (7 chars), numéros de tickets SMA-N, noms de fichiers/colonnes/endpoints, chiffres.
- Gras pour les termes-clés et décisions ; pas de gras décoratif.
- Emojis de sévérité uniquement (🔴🟠✅), jamais décoratifs.
- Flèches ASCII `→` autorisées dans le markdown (c'est de la prose, pas du `.ps1`).

## Étape 3 — produire le fichier

- Nom : `SmartCrops_vN+1_to_vN+2_diff.md` (suivre la nomenclature exacte de la série) ; ou `..._COMPLEMENT.md` pour un complément à un diff déjà livré.
- Créer dans le répertoire de sortie, puis le présenter à Alexandre (présenter le fichier, pas le coller intégralement dans le chat).
- **Donner les critères machine** avec la livraison : `wc -l`, `md5sum`, première/dernière ligne — pour qu'Alexandre puisse vérifier l'upload (le montage `/mnt/project` peut avoir un tour de latence). Ne JAMAIS annoncer un compte de lignes de tête : re-mesurer après la dernière édition. (commandes exécutées côté chat claude.ai, environnement Linux ; équivalents PowerShell si exécution côté Claude Code : `Get-Content <fichier> | Measure-Object -Line`, et `Get-FileHash <fichier> -Algorithm MD5` ; première/dernière ligne : `Get-Content <fichier> | Select-Object -First 1` (resp. `-Last 1`))
- Si une info manque (un SHA, une date, un motif de décision introuvable dans les sources), le **signaler** plutôt que d'inventer — proposer à Alexandre de combler le trou. Ne jamais fabriquer un SHA ou une attribution. (Une date peut être **bornée machine** — voir Étape 0.4 — à condition d'être présentée comme un bornage.)

## Garde-fous

- **Croiser les sources.** Compaction + conversation + transcript + récaps + Linear (requête live). Une seule source peut être incomplète ou abrégée.
- **Ne pas re-couvrir le diff précédent.** Le point de coupure est strict.
- **Continuité des PRs : aucun trou.** Vérifier qu'aucune PR mergée n'existe entre le point de coupure du dernier diff et la première PR du nouveau (le piège classique : sauter #84 → #92 en oubliant #85-#91). Lister les PRs mergées du segment ; combler depuis le bon transcript ou signaler explicitement le trou.
- **Capturer le POURQUOI, pas seulement le QUOI.** C'est le critère de qualité n°1.
- **Inclure les choix écartés.** Aussi important que les choix faits.
- **Ne pas oublier les 4 dimensions non-code** : environnement/outillage, actions de l'utilisateur, outils refusés+pourquoi, évolution de la méthode. Passer l'auto-audit d'Étape 1.5 avant de finaliser.
- **Penser à la reprise future.** Le diff doit suffire à un nouveau chat pour reprendre : état d'un run en cours, secrets/tokens, gotchas, décisions verrouillées, action critique en suspens.
- **Exactitude des identifiants.** SHAs, tickets, fichiers : vérifiés, jamais approximés.
- **Le diff est une compression : il fuira.** La consolidation (skill `smartcrops-consolidation`) re-balaiera les sources amont — mais moins le diff fuit, moins elle rattrape. Viser l'exhaustivité de fond ici.
