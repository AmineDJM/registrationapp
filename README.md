# Nomenclature pharmaceutique

Micro-outil web : on choisit une période, on voit immédiatement à l'écran les molécules (DCI)
enregistrées par chaque laboratoire pendant cette période, puis on exporte le résultat en Excel.

Source de données : `data/nomenclature.xlsx`, onglet **Nomenclature Juin 2026** (en-têtes ligne 14,
données à partir de la ligne 15). Le fichier reste côté serveur, il n'est jamais envoyé au navigateur.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:3000
```

Autres commandes :

```bash
npm run build      # build de production
npm start          # sert le build
npm test           # tests unitaires (Vitest), fichier réel inclus
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

### Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `NOMENCLATURE_ADMIN_PASSWORD` | Mot de passe de l'écran **Réglages**. Obligatoire en production : sans elle, l'import est refusé (503). En développement local, l'import fonctionne sans mot de passe. |
| `BLOB_READ_WRITE_TOKEN` | Store [Vercel Blob](https://vercel.com/docs/vercel-blob) où est conservé le fichier importé. Obligatoire en production : le disque d'une fonction serverless est en lecture seule. Ajouté automatiquement quand on crée un store Blob depuis le projet Vercel. |

En local, sans `BLOB_READ_WRITE_TOKEN`, l'import écrit simplement dans `data/nomenclature.xlsx`.

## Règles métier

- **Filtre** : `DATE D'ENREGISTREMENT INITIAL` (colonne O) uniquement, bornes incluses.
  La date d'enregistrement final n'est jamais utilisée pour filtrer.
- **Dates Excel** : les numéros de série (`45411`), les vraies dates et les dates textuelles
  (`01/04/2025`, `2025-04-01`) sont normalisés en numéro de jour UTC — aucune comparaison de chaînes.
  Le bug de l'année bissextile 1900 d'Excel est compensé.
- **Bornes** : dates minimale et maximale calculées depuis le fichier. Une date de fin vide utilise
  le maximum disponible, une date de début vide le minimum.
- **Regroupement** : un couple unique **laboratoire + DCI**. Une même DCI déclinée en plusieurs
  dosages, formes ou marques n'apparaît qu'une fois, avec le nombre d'enregistrements et la liste
  des marques.
- **Première date** : la plus ancienne date d'enregistrement initial du couple *à l'intérieur de la
  période sélectionnée*.
- **Normalisation** : trim + espaces multiples réduits + comparaison insensible à la casse, sur les
  laboratoires comme sur les DCI. Aucun rapprochement approximatif : deux raisons sociales
  différentes ne sont jamais fusionnées.
- **Lignes ignorées** : sans date initiale exploitable, sans laboratoire ou sans DCI (19 lignes
  actuellement, toutes pour date manquante ou invalide).
- **Cas limites** : date de début postérieure à la date de fin → message d'erreur et export
  désactivé ; période vide → « Aucun enregistrement trouvé sur cette période. »

## Architecture

```
data/nomenclature.xlsx          fichier source (hors /public)
src/lib/nomenclature/
  types.ts        modèle de données
  excel-date.ts   conversions de dates (série Excel / Date / texte → jour UTC)
  normalize.ts    normalisation typographique labos et DCI
  load.ts         lecture ExcelJS, détection auto des en-têtes, cache mémoire
  filter.ts       filtre par période + résolution des bornes
  aggregate.ts    regroupement labo + DCI, synthèse par laboratoire
  search.ts       recherche texte et filtres de colonnes, partagés serveur / client
  storage.ts      lecture / écriture de la source (Vercel Blob ou disque)
  report.ts       pipeline complet (filtre → agrégation → compteurs)
  export.ts       génération du classeur Excel (ExcelJS)
  api.ts          sérialisation JSON
src/app/api/nomenclature/{meta,result,export,source}/route.ts
src/app/reglages/                page de mise à jour du fichier source
src/components/                  UI (période, résultats, filtres de colonnes, import)
```

Le fichier est lu et normalisé une seule fois (~0,9 s), puis conservé en cache mémoire : les
requêtes suivantes répondent en quelques millisecondes. Pas de base de données.

## API

| Route | Réponse |
| --- | --- |
| `GET /api/nomenclature/meta` | `{ minDate, maxDate, totalRows, sheet }` |
| `GET /api/nomenclature/result?start=&end=&q=&lab=&dci=` | statistiques + laboratoires + couples labo/DCI (JSON gzip) |
| `GET /api/nomenclature/export?start=&end=&q=&lab=&dci=` | le fichier `.xlsx` |
| `GET /api/nomenclature/source` | état de la source : stockage, origine, date de mise à jour, compteurs |
| `POST /api/nomenclature/source` | remplace la nomenclature (multipart : `file`, `password`) |

Tous les filtres sont facultatifs et appliquent exactement ce que fait l'écran : `q` est la
recherche libre (laboratoire, DCI ou marque), `lab` et `dci` sont les valeurs exactes des menus
déroulants de colonnes, comparées sans tenir compte de la casse ni des accents.

## Écran

- **Laboratoires** : un laboratoire se déplie et montre ses molécules avec leur première date.
- **Molécules** : les titres de colonnes *sont* les filtres, comme un filtre automatique de tableur.
  *Laboratoire* et *DCI / Molécule* ouvrent une liste recherchable des valeurs encore disponibles
  (choisir un laboratoire restreint la liste des DCI, et inversement) ; *Première date* trie en
  croissant, puis décroissant, puis revient à l'ordre laboratoire / DCI.
- Les compteurs, les deux onglets et l'export Excel reflètent toujours les mêmes filtres ; le tri,
  lui, ne concerne que l'affichage, l'Excel gardant son ordre laboratoire puis DCI et son filtre
  automatique.

## Réglages — remplacer la nomenclature

`/reglages` permet d'importer un nouveau fichier `.xlsx` (jusqu'à 4 Mo, la limite d'une requête
Vercel). L'import est protégé par `NOMENCLATURE_ADMIN_PASSWORD` et se déroule ainsi :

1. le fichier est reçu en mémoire ;
2. il est vérifié de bout en bout — taille, signature `.xlsx`, onglet, en-têtes, et présence d'au
   moins une ligne exploitable ;
3. **seulement s'il est valide**, il remplace le précédent (Vercel Blob en production, disque en
   local) et écrase définitivement l'ancienne version ;
4. le cache mémoire est remplacé dans la foulée ; les autres instances du serveur détectent la
   nouvelle version en moins de 30 secondes.

Un fichier illisible, tronqué ou vide est refusé avec un message explicite et **ne touche pas** à la
nomenclature en service.

## Fichier Excel généré

`nomenclature_laboratoires_<début>_<fin>.xlsx`, trois feuilles :

1. **Synthèse** — en-tête récapitulatif (période, date de génération, compteurs) puis
   `Laboratoire | Nombre de molécules`, trié par nombre décroissant puis nom.
2. **Molécules par laboratoire** — une ligne par couple laboratoire + DCI :
   `Laboratoire | DCI / Molécule | Première date | Nombre d'enregistrements | Marque(s)`,
   trié par laboratoire puis DCI.
3. **Détail** — les lignes source correspondant au filtre, colonnes utiles uniquement,
   pour vérification.

En-têtes en gras, première ligne figée, filtre automatique, largeurs de colonnes adaptées et
vraies cellules de type date au format `dd/mm/yyyy`.
