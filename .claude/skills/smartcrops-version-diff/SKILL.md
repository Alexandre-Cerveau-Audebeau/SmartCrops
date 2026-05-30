---
name: smartcrops-version-diff
description: Produit un fichier diff narratif de version du projet SmartCrops (SmartCrops_vN_to_vN+1_diff.md) qui capture une période de travail — non seulement CE qui a été fait, mais les décisions prises ET écartées avec leurs raisons, les apprentissages, ce qui a été ajouté au projet et COMMENT. Use when Alexandre demande "fais-moi un diff", "génère le diff de version", "documente cette session", "diff vN→vN+1", ou toute demande de capturer une session/période de travail SmartCrops dans le doc projet. Le diff alimente la prochaine version de SmartCrops_v2_Project_Description.
---

# smartcrops-version-diff

Génère un **diff de version** SmartCrops : un document markdown narratif qui documente une période de travail (typiquement une session longue ou plusieurs PRs liées) de façon à ce que, des mois plus tard, on retrouve **pourquoi** on a fait les choses, pas seulement quoi.

Ce n'est PAS un changelog mécanique (`git log`). Un changelog liste des commits ; ce diff capture le **raisonnement** : les arbitrages, les options rejetées et leur motif, les apprentissages empiriques, les patterns établis. C'est la mémoire de conception du projet.

## Quand l'utiliser

- Alexandre dit "fais-moi un diff", "documente la session", "diff vN→vN+1".
- Fin d'une session dense, ou après une grappe de PRs formant un tout cohérent (un scale-up, une feature, une refonte).
- Avant de fusionner le contenu dans `SmartCrops_v2_Project_Description` (le diff devient la prochaine version vN+1).

## Étape 0 — déterminer le périmètre (la frontière vN → vN+1)

1. **Trouver la dernière version.** Lister les fichiers projet, repérer le dernier `SmartCrops_vN_to_vN+1_diff.md` (le N+1 le plus élevé). Le nouveau diff est `vN+1_to_vN+2`. Si la série de diffs et la version du doc projet divergent, demander à Alexandre quelle est la version courante.
2. **Lire le dernier diff EN ENTIER** — pour deux raisons : (a) reproduire son format exactement, (b) identifier son **point de coupure** (la DERNIÈRE PR/commit qu'il documente, souvent visible dans sa section "Next priorities"). Le nouveau diff commence précisément là. Ne jamais re-couvrir ce que le précédent a déjà documenté.
   - **⚠️ Vérifier la CONTINUITÉ des PRs (garde-fou critique).** Le piège : sauter du point de coupure du dernier diff (ex. PR #84) directement à la première PR fraîche en mémoire (ex. #92), en oubliant le segment intermédiaire (#85→#91). **Lister explicitement TOUTES les PRs mergées entre le point de coupure et la première PR du nouveau diff** (via `gh pr list --state merged --base develop` si Claude Code dispo, ou en demandant à Alexandre). Aucun numéro de PR ne doit manquer dans la chaîne. Si une PR du segment n'a pas de détail documentable (mergée dans une session dont on n'a pas le transcript), **le SIGNALER** — soit combler depuis le bon transcript (`journal.txt` liste les transcrits passés), soit ajouter une note explicite dans le diff ("PRs #X-#Y couvertes en session antérieure, non re-documentées"). Ne JAMAIS inventer le contenu d'une PR du trou.
3. **Reconstituer la période** depuis toutes les sources disponibles, par ordre de fiabilité :
   - Le **résumé de compaction** en tête de conversation (si la session a été compactée) — couvre le début.
   - La **conversation visible** — couvre la fin.
   - Le **transcript** sur disque (`/mnt/transcripts/...`) si mentionné — pour les détails fins (SHAs, raisons exactes, options écartées) que la compaction a pu abréger. Le lire de façon **ciblée** (grep des SHAs, tickets, noms de décisions), PAS ligne par ligne : les transcripts sont massifs et peuvent contenir des blocs de pensée corrompus. Croiser, ne pas se fier à une seule source.
   - **Linear** (si MCP connecté) pour l'état exact des tickets créés/clos pendant la période.

## Étape 1 — collecter le contenu OBLIGATOIRE

Un bon diff répond à TOUTES ces questions (c'est ce qui le distingue d'un changelog). Pour la période :

- **Ce qui a été fait** : PRs mergées (numéro + SHA squash + date + nb de rounds CR), features livrées, tickets clos. Données chiffrées (tests, lignes, volumes DB).
- **Les choix FAITS et POURQUOI** : chaque décision d'architecture/produit non triviale, avec son rationale. Pas "on a choisi X" mais "on a choisi X parce que Y, malgré Z".
- **Les choix NON faits et POURQUOI** : les options explicitement rejetées (c'est souvent le plus précieux — ça évite de re-débattre plus tard). Ex. "on n'a PAS porté en cross-platform parce que…", "on n'a PAS dédupliqué cross-surface parce que…".
- **Ce qu'on a appris** : apprentissages empiriques, surtout ceux qu'on ne pouvait découvrir qu'en faisant (bugs révélés par le volume, comportements d'outils, quirks d'environnement). Distinguer "confirmé empiriquement" de "supposé".
- **Ce qu'on a ajouté au projet** : nouveaux fichiers, scripts, skills, tickets, conventions, ADRs — et **COMMENT** (l'approche, le workflow suivi, pas juste le résultat).
- **Les patterns/décisions établis** qui valent au-delà de cette session (réutilisables).
- **Les follow-ups** : ce qui reste, par priorité, avec les liens tickets.

## Étape 2 — respecter le FORMAT (calé sur les diffs existants)

Structure narrative, en **français** (le workflow d'Alexandre est en français ; le code reste en anglais), dense mais lisible :

```
# SmartCrops v2 — Project Description diff vN → vN+1 (jalon en une ligne)

> Paragraphe d'intro : ce que ce diff finalise, le contexte, la période, ce qu'il
> couvre. Se termine par "À fusionner dans le doc projet en remplaçant la version vN."

---

## 0. Vue d'ensemble
  Bloc ``` ``` ASCII qui schématise le flux global de la période.
  Puis : PRs mergées (SHA + date + rounds CR), tests (avant→après), état data/projet.

## 1..N. (une section par thème majeur)
  Feature/PR/chantier : metadata (branche, commits, SHA squash, rounds CR, endpoints),
  puis le détail avec sous-sections. Inclure les décisions ET leurs raisons inline.

## (section) Findings / apprentissages
  Ce que seul le réel a révélé. Emojis de sévérité ponctuels (🔴 bloqueur, 🟠 majeur,
  ✅ validé) — avec parcimonie, comme dans les diffs existants.

## (section) Patterns / décisions établis
  Les règles réutilisables, avec le pourquoi.

## (section) Découvertes workflow
  Quirks d'outils, d'environnement, de process (CR, PowerShell, Docker, etc.).

## (section) CR empirical (mis à jour)
  Comment CodeRabbit s'est comporté ce cycle (rounds, profil, hallucinations).

## (section) Issues / follow-ups
  Ce qui reste, par priorité (🔴 bloquant / plus tard), avec liens tickets SMA-N.

## (section) Next priorities
  Liste ordonnée des prochaines étapes.
```

**Conventions de ton** (observées dans les diffs v12→v19) :
- Dense, factuel, pas de remplissage. Chaque phrase porte de l'info.
- Les décisions s'écrivent avec leur motif : "**Décision : X** (parce que Y ; option Z rejetée car W)".
- Garder les identifiants exacts : numéros de PR, SHAs squash (7 chars), numéros de tickets SMA-N, noms de fichiers/colonnes/endpoints, chiffres.
- Gras pour les termes-clés et décisions ; pas de gras décoratif.
- Emojis de sévérité uniquement (🔴🟠✅), jamais décoratifs.
- Flèches ASCII `→` autorisées dans le markdown (c'est de la prose, pas du `.ps1`).

## Étape 3 — produire le fichier

- Nom : `SmartCrops_vN+1_to_vN+2_diff.md` (suivre la nomenclature exacte de la série).
- Créer dans le répertoire de sortie, puis le présenter à Alexandre (présenter le fichier, pas le coller intégralement dans le chat).
- Si une info manque (un SHA, une date, un motif de décision introuvable dans les sources), le **signaler** plutôt que d'inventer — proposer à Alexandre de combler le trou. Ne jamais fabriquer un SHA ou une attribution.

## Garde-fous

- **Croiser les sources.** Compaction + conversation + transcript + Linear. Une seule source peut être incomplète ou abrégée.
- **Ne pas re-couvrir le diff précédent.** Le point de coupure est strict.
- **Continuité des PRs : aucun trou.** Vérifier qu'aucune PR mergée n'existe entre le point de coupure du dernier diff et la première PR du nouveau (le piège classique : sauter #84 → #92 en oubliant #85-#91). Lister les PRs mergées du segment ; combler depuis le bon transcript ou signaler explicitement le trou.
- **Capturer le POURQUOI, pas seulement le QUOI.** C'est le critère de qualité n°1. Un diff qui liste des PRs sans expliquer les arbitrages a raté sa cible.
- **Inclure les choix écartés.** Aussi important que les choix faits.
- **Exactitude des identifiants.** SHAs, tickets, fichiers : vérifiés, jamais approximés.
