# Garden Planner — Design tokens (Phase 5 : planner · exposition · config)

> **Source de vérité** : composant React embarqué dans la maquette Claude Design
> `SmartCrops_-_Garden_Planner_-_États.html` (planche É1–É7), **byte-identique** au composant
> de `Garden_Artboard-Planner_Night_En_showFooter.html` déjà dans le projet (diff = 0).
> Toutes les valeurs ci-dessous sont **transcrites verbatim** du composant (md5 du composant
> extrait : `9757affbb17b813e3f7374e91584f797`). Les PDF d'artboards servent au cadrage ;
> **ce fichier + le HTML priment pour les valeurs exactes**.
>
> Convention : chaque token existe en **jour** et **nuit** (SMA-209 pour la grille nuit).
> Breakpoints maquette : desktop **1460 px** · mobile **390 px**.

---

## 1. Palette globale — Jour

> **Déviation contraste SmartCrops v2 (16/07/2026)** — valeurs jour assombries vs maquette
> (polices ET bordures) pour la lisibilité ; la maquette reste la référence de STRUCTURE,
> ces valeurs priment pour les COULEURS jour. Tokens déviés (valeur maquette d'origine) :
> polices `--t-meta` (`#3C4A42`), `--muted` (`#7A8781`), `--t-sci` (`#75827A`),
> `--obtn-tx` (`#3C4A42`) ; bordures `--card-bd` (`#F0F4EE`), `--divider` (`#EDF2EC`),
> `--input-bd` (`#D8E0D8`), `--obtn-bd` (`#D8E0D8`), `--cell-on-bd` (`#DEE9DA`),
> `--cell-off-bd` (`#E3E6E1`). La nuit (§2) est inchangée.

```css
--page-bg: #FAFDF7;          --nav-bg: #1B5E3A;
--card: #FFFFFF;             --card-bd: #CBD5CA;
--shadow: 0 2px 10px rgba(27,94,58,0.07);
--t-title: #22302A;          --t-sci: #5E6B64;
--t-meta: #2F3B34;           --muted: #4F5A54;
--prim: #2E8B57;             --h1: #2E8B57;
--divider: #CBD5CA;          --input-bd: #B4C1B4;
--search-bg: #FBFDFA;        --placeholder: #9AA69E;
--track: #E2EADF;
--seg-bg: #EFF3EE;           --seg-on-bg: #FFFFFF;        --seg-on-tx: #1B5E3A;
--obtn-bd: #B4C1B4;          --obtn-tx: #2F3B34;          /* boutons outlined */
--banner-bg: #EFF6FD;        --banner-bd: #BBD8F2;        --banner-tx: #2C5A8A;
--cnt-chip-bg: #E4F3E9;      --cnt-chip-tx: #20713F;      /* chip compteur */
--dang-bg: #FDEDED;  --dang-bd: #F2B8B5;  --dang-tx: #B3261E;  --dang-solid: #C62828;
--zoneA-bg: #EEF7F0;         --zoneA-bd: #CDE6D6;         /* zone verte lightSchedule */
--cell-on: #F1F7EE;          --cell-on-bd: #BCCBB6;
--cell-off: #ECEEEA;         --cell-off-bd: #C4CBC2;
--hint-bg: rgba(34,48,42,0.88);  --hint-tx: #fff;
--expo-icc: #E8890C;         /* accent soleil (arc de la rose, icône calque) */
--exp-sel-bg: #F4FAF6;
```

## 2. Palette globale — Nuit

```css
--page-bg: #0D1D34;          --nav-bg: #306D4C;
--card: #16294A;             --card-bd: #22375C;
--shadow: 0 2px 10px rgba(0,0,0,0.28);
--t-title: #F2F6FA;          --t-sci: #9FACC2;
--t-meta: #D6DEEC;           --muted: #7E8CA6;
--prim: #4CB47C;             --h1: #4CB47C;
--divider: #24395F;          --input-bd: #2C3F63;
--search-bg: #0F2038;        --placeholder: #7E8CA6;
--track: #31456B;
--seg-bg: #0F2038;           --seg-on-bg: #4CB47C;        --seg-on-tx: #0D1D34;
--obtn-bd: #31456B;          --obtn-tx: #DCE4F0;
--banner-bg: rgba(76,140,220,0.12); --banner-bd: rgba(96,160,235,0.35); --banner-tx: #A8C6EE;
--cnt-chip-bg: rgba(76,180,124,0.16); --cnt-chip-tx: #7ED0A4;
--dang-bg: rgba(229,90,90,0.13); --dang-bd: rgba(229,90,90,0.45);
--dang-tx: #F08A8A;          --dang-solid: #C64545;
--zoneA-bg: rgba(76,180,124,0.10); --zoneA-bd: rgba(76,180,124,0.32);
--cell-on: #132740;          --cell-on-bd: #1F3556;       /* SMA-209 */
--cell-off: #0B1830;         --cell-off-bd: #152742;      /* SMA-209 */
--hint-bg: rgba(242,246,250,0.92); --hint-tx: #16294A;
--expo-icc: #FFCB54;
--exp-sel-bg: rgba(76,180,124,0.10);
```

## 3. Calque d'exposition (4 catégories + hachures)

| Catégorie | Jour fill / border | Nuit fill / border (voiles translucides) |
|---|---|---|
| **Plein soleil** | `#FFE7A3` / `#EFD27E` | `rgba(255,203,84,0.36)` / `rgba(255,203,84,0.55)` |
| **Soleil du matin** | `#EDF3B4` / `#D9E38C` | `rgba(196,214,100,0.30)` / `rgba(196,214,100,0.48)` |
| **Soleil d'après-midi** | `#FFD6A6` / `#EFBD7F` | `rgba(255,148,92,0.34)` / `rgba(255,148,92,0.52)` |
| **Ombre** | `#CBD8E4` / `#B4C5D6` | `rgba(124,152,190,0.22)` / `rgba(124,152,190,0.42)` |

```css
/* Hachure "Ombre" / "Ombre portée" (background-image de la cellule) */
--hatch-day:   repeating-linear-gradient(45deg, rgba(71,94,120,0.18) 0px, rgba(71,94,120,0.18) 3px, transparent 3px, transparent 8px);
--hatch-night: repeating-linear-gradient(45deg, rgba(142,170,206,0.30) 0px, rgba(142,170,206,0.30) 3px, transparent 3px, transparent 8px);

/* Hachure rouge collision (DnD / empreinte invalide) */
--red-hatch-day:   repeating-linear-gradient(45deg, rgba(198,40,40,0.30) 0px, rgba(198,40,40,0.30) 4px, rgba(198,40,40,0.08) 4px, rgba(198,40,40,0.08) 9px);
--red-hatch-night: repeating-linear-gradient(45deg, rgba(229,90,90,0.40) 0px, rgba(229,90,90,0.40) 4px, rgba(229,90,90,0.10) 4px, rgba(229,90,90,0.10) 9px);
```

Le calque est un **fond de cellule** (fill + border remplacent `cell-on`/`cell-on-bd`) :
il scrolle et zoome avec la grille. Boussole + légende = chrome fixe.

## 4. Grille & cellules

| Métrique | Desktop | Mobile |
|---|---|---|
| Côté de cellule `CELL` | **58 px** | **30 px** |
| Gap inter-cellules `GAP` | **3 px** | **2 px** |
| Radius cellule | 4 px (border 1 px) | idem |
| Axes (A–J / 1–8) | fs 10.5 · w700 · `--muted` | fs 8.5 |
| Padding carte grille | 20 px | 12 px |
| Carte grille | radius 12 · border 1 `--card-bd` · `--shadow` | idem |

Démo maquette : COLS 10 × ROWS 8. Cases inactives = `cell-off` (+ border off).

## 5. Placements (plantes) & poignées de sélection

- Bloc plante : radius **7 px**, ombre légère, lettre fs 16 w800 (desktop), pill du label
  `radius 999 · padding 2px 8px · fs 11 (9 mobile) · w700`.
- Sélection : border 2 px `--prim` + **4 poignées** 10×10 px, fond `#fff`, border 2 `--prim`, radius 3.
- Palette des plantes de démo `[fill, texte, border]` — jour :
  `tomate ['#F6C9C4','#8C2F27','#EBA9A1']` · `basilic ['#CDE8CE','#1F5E23','#A8D4AA']` ·
  `courgette ['#BFE3CB','#14532D','#2E8B57']` · `laitue ['#DFEFC2','#4A6B12','#C4DE97']` ·
  `fraisier ['#F8D3E0','#96285C','#EDAFC6']` · `fougere ['#DFD4F0','#4B2E83','#C4B2E2']` ·
  `lierre ['#FCDACC','#8C4A2F','#F0BBA5']` — nuit :
  `tomate ['rgba(232,117,107,0.30)','#F5B8B2','rgba(232,117,107,0.55)']` ·
  `basilic ['rgba(129,199,132,0.28)','#B8E6BA','rgba(129,199,132,0.55)']` ·
  `courgette ['rgba(76,180,124,0.32)','#A8E6C4','#4CB47C']` ·
  `laitue ['rgba(174,213,129,0.28)','#D4EDB0','rgba(174,213,129,0.55)']` ·
  `fraisier ['rgba(244,143,177,0.28)','#F8C6D8','rgba(244,143,177,0.55)']` ·
  `fougere ['rgba(149,117,205,0.30)','#CDBBE8','rgba(149,117,205,0.55)']` ·
  `lierre ['rgba(255,171,145,0.28)','#FFCDBC','rgba(255,171,145,0.55)']`.

## 6. Infrastructures (référence 5.4, présentes dans la vue planner)

Radius rectangles **5 px** ; formes rondes (eau, pot) **29 px** desktop / **15 px** mobile.
Icônes Material Symbols fs 18 (14 mobile) ; label affiché si largeur ≥ 4 cases (desktop),
fs 12 (9 mobile) w800 ls .02em.

| Infra | Jour | Nuit |
|---|---|---|
| **Mur** (`foundation`) | bg `#8A919C` · bd `1px solid #767E8A` · briques : `repeating-linear-gradient(0deg, rgba(255,255,255,0.28) 0 1.5px, transparent 1.5px 13px), repeating-linear-gradient(90deg, rgba(255,255,255,0.28) 0 1.5px, transparent 1.5px 24px)` · icône/label `#fff` | bg `#3A4556` · bd `#4A5568` · briques `rgba(255,255,255,0.10)` · icône `#B9C4D6` · label `#D6DEEC` |
| **Treillis (garni)** (`grid_on`) | bg `rgba(46,139,87,0.08)` · bd `1.5px dashed #2E8B57` · croisillons ±45° `rgba(46,139,87,0.30)` pas 8 px · icône `#2E8B57` · label `#20713F` | bg `rgba(76,180,124,0.10)` · bd dashed `#4CB47C` · croisillons `rgba(76,180,124,0.35)` · icône/label `#7ED0A4` |
| **Chemin** (`route`) | bg `#EDE4D3` · bd `#DCCFB8` · pointillés `radial-gradient(circle at 4px 4px, rgba(120,100,70,0.30) 1.4px, transparent 2px)` size 9×9 · icône `#8A7351` · label `#6E5B40` | bg `#2E3A50` · bd `#3C4A63` · points `rgba(214,222,236,0.28)` · icône `#9FACC2` · label `#B4C0D4` |
| **Point d'eau** (`water_drop`, rond) | bg `#CCE7FA` · bd `#9FCDEE` · icône/label `#1565C0` | bg `rgba(100,181,246,0.22)` · bd `rgba(100,181,246,0.5)` · `#90CAF9` |
| **Pot** (`potted_plant`, rond) | bg `#EFD7C3` · bd `#DDB894` · icône/label `#A0522D` | bg `rgba(200,120,70,0.26)` · bd `rgba(220,140,90,0.5)` · `#E9A06B` |

Badges sidebar INFRAS. : « Bloque la lumière » (style danger doux) vs « Pas d'ombre » (neutre).

## 7. DnD (chantier E — référence)

- **Fantôme** : bg jour `rgba(191,227,203,0.92)` / texte `#14532D` — nuit `rgba(76,180,124,0.45)` / `#EAFBF2` ;
  border 2 `--prim` · radius 9 · `box-shadow 0 14px 30px rgba(10,40,20,0.35)` ·
  `transform: rotate(-2.5deg)` · opacity 0.93 ; curseur `near_me` fs 22.
- **Cible valide** : cellule `border 2px dashed --prim` (fond vert léger).
- **Collision** : `--red-hatch` + `border 2px dashed --dang-tx`.
- **Toast** : `--dang-bg/--dang-bd/--dang-tx` · radius 9 · padding 9px 14px · fs 13 w700 ·
  ombre `0 8px 22px rgba(120,20,20,0.18)` · icône `error` fs 17.
- **Hint pill** : `--hint-bg/--hint-tx` · radius 999 · padding 7px 14px · fs 12 w600
  (« Relâchez pour poser · Échap pour annuler »).

## 8. Boussole (permanente, coin haut-droit de la carte grille)

- Conteneur rond : **56 px** desktop / **40 px** mobile, bg `--card`, border 1 `--card-bd`,
  `--shadow`, position `right:-6px; top:-10px` (déborde la carte), z-index 10.
- SVG **42 px** (30 mobile), viewBox `0 0 40 40` : cercle r18 stroke `compRing`
  (`#D8E0D8` jour / `#31456B` nuit) w1.4 ; aiguille N `polygon 20,7 23.2,20 16.8,20`
  fill **`#D64545`** ; queue S fill `compSTail` (`#D3DAD2` jour / `#31456B` nuit) ;
  lettres : N fs 6.6 w800 `compTx` — E/S/O fs 6 w700 `compMut`.
- La rose du **dialog** (§12) réutilise la même géométrie à **104 px**, + **arc soleil
  pointillé** couleur `--expo-icc`.

## 9. Légende du calque (obligatoire, sous la grille)

Carte : radius 12 · padding **12px 16px** · gap 16 (10 mobile) · wrap.
Titre « Exposition — {saison} · {moment} » fs 13 (11 mobile) w800 `--t-title`.
Swatch **16 px** (13 mobile) radius 5 border 1 (fill/border de la catégorie ; « Ombre » et
« Ombre portée » portent la hachure). Libellé fs 12.5 (10.5) w600 `--t-meta`.
En mode DnD s'ajoutent à droite : « Cible valide » (dashed `--prim`) · « Collision » (dashed `--dang-tx`).

## 10. Toolbar & contrôles segmentés

- Carte toolbar : padding **12px 16px** (10×12 mobile) ; 2 rangées, divider pleine largeur
  (`margin 12px -16px`).
- Boutons de mode (Sélection/Placer/Infrastructures) : h **38** (34) · padding-x 14 (10) ·
  fs 13.5 (12) ; actif = fond `--prim` texte blanc ; labels masqués sur mobile (icône seule).
- Rangée 2 : toggle **Exposition** (switch 34×19, pouce 15, actif `--prim`, inactif `--track`)
  + icône soleil `--expo-icc` ; segmented **Matin/Midi/Soir** et **Été/Hiver** :
  conteneur `--seg-bg` radius 9 padding 3 ; item padding **8px 14px** (6×9) radius 7
  fs 13 (11.5) w700 ; actif `--seg-on-bg`/`--seg-on-tx` + ombre `0 1px 4px rgba(0,0,0,0.18)`.
- Zoom : − / **100 %** / + ; undo à gauche du zoom.

## 11. Chrome de page

- Navbar h **64** (56) ; logo 38 (32).
- « ← Retour à mes jardins » margin `26px 0 14px` (18/10 mobile).
- H1 fs **32** (26) couleur `--h1` ; méta fs **14.5** (12.5) `--t-meta` — format :
  `10 × 8 — 5.0m × 4.0m (50cm/cellule) — 76/80 parcelles actives (19.0 m²) · Terrasse · Orienté S`.
- Boutons d'en-tête (Exporter · Réglages · Enregistrer) : h **44** (40) · padding-x 17 (13) ·
  fs 14.5 (13) ; Enregistrer = contained `--prim`.
- Bannière d'aide (desktop) : `--banner-*`, fs 14, fermable.
- Sidebar **PLANTES / SOLS / INFRAS.** : onglet actif = texte + soulignement `--prim` ;
  chip empreinte inconnue « 1×1 ? » en style pointillé (fpUnk).
- Panneau détail : **330 px** · radius 12 · border `--card-bd` · `--shadow`.
- Chips « Plantes dans ce jardin (N) » ; note « Toutes les modifications sont enregistrées ».
- Padding bas de page 30 (76 mobile, au-dessus de la bottom-bar).

## 12. Dialog « Configurer le jardin » (620 px)

- **Scrim** : `rgba(9,22,16,0.52)`, contenu top-aligné `padding-top 64px` (90 px variante templates).
- Boîte : **620 px** max-width 100 % · radius **14** · `box-shadow 0 30px 80px rgba(0,0,0,0.4)`.
- En-tête : icône engrenage + titre « Configurer le jardin » / sous-titre
  « Dimensions, orientation et type de jardin » (EN : « Garden settings » /
  « Layout, orientation and garden type ») + croix.
- **Labels de section** (DIMENSIONS · ORIENTATION · TYPE DE JARDIN) : fs **13 w800**
  `--t-title`, margin-bottom 10. Sous-labels champs (COLONNES · LIGNES · TAILLE DE CASE) en petites capitales grisées.
- Dimensions : steppers Colonnes × Lignes + segmented **25 cm / 50 cm / 1 m**
  (item padding 9px 14px · radius 7 · fs 13 w700 ; actif `--seg-on-*` + ombre).
- Orientation : sous-titre « Vers où le jardin est-il tourné ? » ; segmented **N/E/S/O** ;
  note : « Alimente le calque d'exposition par case : matin = Est éclairé, midi = Sud,
  soir = Ouest, jamais = Nord. » (EN : « Drives the per-cell Exposure layer: morning = east
  lit, noon = south, evening = west, never = north. ») ; **rose de boussole 104 px**
  (cercle `--search-bg` bordé `--input-bd`) + arc soleil pointillé `--expo-icc`.
- Type de jardin : **5 cartes** — Balcon `balcony` · Terrasse `deck` · Pleine terre `grass` ·
  Serre `cabin` · Intérieur `home`. Sélectionnée : bg `#F0F9F3` (nuit `rgba(76,180,124,0.12)`) ·
  `border 2px solid --prim` · texte/icône `--prim`. Non sélectionnée : `border 1px --input-bd` ·
  texte `--t-meta` · icône `--muted`.
- **Bloc lightSchedule** (si Intérieur) : zone `--zoneA-bg`/`--zoneA-bd` ; titre
  « Éclairage automatisé (lightSchedule) » + icône ampoule ; sous-texte « Jardin intérieur :
  ces plages remplacent l'exposition naturelle du calque. » ; lignes de plage
  `06:00 → 10:00` + chip durée `4 h` + croix ; « + Ajouter une plage » ;
  total « 10 h de lumière / jour · uniforme sur la grille ».
- Pied : Annuler (outlined) · **Enregistrer** (contained `--prim`, coche).

## 13. Libellés de référence (FR / EN)

- Moments : **Matin · Midi · Soir** / Morning · Noon · Evening — Saisons : **Été · Hiver** / Summer · Winter.
- Titre légende : « Exposition — été · midi » / « Exposure — summer · noon ».
- Catégories : Plein soleil · Soleil du matin · Soleil d'après-midi · Ombre ·
  Ombre portée (mur, treillis) / Full sun · Morning sun · Afternoon sun · Shade ·
  Cast shadow (wall, trellis).
- Panneau : « Placement sélectionné » ; « Cases F3–G4 · empreinte 2×2 (1,0 × 1,0 m) » ;
  « Plein soleil — matin, midi et soir » ; « Empreinte » ; « Issue de l'espacement Perenual
  (90–120 cm) » / « Espacement inconnu — réglage manuel » ; Déplacer · Retirer.
- Collision : toast « Collision — chevauche Fraisier (H3) » ; panneau « Chevauche Fraisier (H3).
  Ajustez l'empreinte ou déplacez la plante. »
- DnD : « Relâchez pour poser · Échap pour annuler ».
- Sidebar INFRAS. : « Bloque la lumière » / « Pas d'ombre ».
- État sauvegardé : « Toutes les modifications sont enregistrées ».

## 14. Notes d'implémentation

1. Ces tokens s'ajoutent au **thème MUI** (palette/vars par mode jour-nuit) — pas de hex
   en dur dans les composants : un module `plannerTokens` (ou extension du thème) est la
   seule source, consommée par grille, calque, légende, dialog.
2. Les 4 catégories d'exposition = **enum partagé** moteur ↔ UI ↔ (Phase 6 IA) ; le mapping
   vers le vocabulaire plantes (full sun / partial / shade) vit côté moteur.
3. `sr-only` : toujours `visuallyHidden` de `@mui/utils` (jamais `width:1`).
4. Rappel modèle gravé (SMA-17) : le calque est une **estimation** (libellé assumé) ;
   hemisphere + latitudeBand = 2 contrôles ajoutés **au code** dans ce dialog, zéro retouche maquette.
