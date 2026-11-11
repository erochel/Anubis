# ANUBIS – Visites de chantier G4

Web-app iPhone (PWA) pour les visites G4 : points de contrôle, photos, dictée et mémos vocaux sur place, puis **compte rendu de visite Word (.docx) généré automatiquement** au format Ginger (A4 paysage, cartouche, tableau *Ouvrages / Observations / Avis Ginger*, planches photographiques).

- Pas de Mac ni de compte Apple Developer : l'app est hébergée gratuitement sur **GitHub Pages** et s'installe sur l'écran d'accueil.
- **Fonctionne hors connexion** sur chantier. Toutes les données restent sur l'iPhone (aucun serveur).

## Mise en ligne (une seule fois, environ 5 minutes)

1. Sur github.com, créez un dépôt **public** nommé `anubis` (*New repository*). Cochez *Add a README file*.
2. Dans le dépôt : **Add file → Upload files**, puis glissez **tous les fichiers** du dossier (ils sont tous au même niveau, sans sous-dossier). Validez avec *Commit changes*.
   - Depuis l'iPhone : décompressez le zip dans l'app *Fichiers*, puis, sur github.com dans Safari, faites *Upload files* et sélectionnez tous les fichiers.
3. **Settings → Pages** : *Source* = `Deploy from a branch`, *Branch* = `main` et `/ (root)` → *Save*.
4. Au bout d'une minute environ, l'app est disponible à l'adresse `https://<votre-pseudo>.github.io/anubis/`.

## Installation sur l'iPhone

Ouvrez l'adresse dans **Safari**, touchez **Partager → Sur l'écran d'accueil**. ANUBIS s'ouvre ensuite en plein écran, comme une app.

Au premier lancement : **⚙︎ Réglages**, puis renseignez votre nom, votre agence et votre **logo Ginger** (image PNG ou JPG). Le logo s'affiche dans le cartouche du compte rendu.

## Utilisation sur chantier

| Onglet | Contenu |
|---|---|
| **Infos** | N° de visite (auto-incrémenté), date, horaires, présents, météo, phase, objet, conclusion, diffusion |
| **Contrôles** | Points ajoutés depuis des listes types (paroi berlinoise, terrassements, fondations, pieux, inclusions rigides, remblais, murs) ou saisis librement. Statuts Conforme / À surveiller / Non conforme / Non vérifié, avis rapides, photo liée au point |
| **Photos** | Prise de vue ou photothèque, légende, lien avec un point, ordre des planches |
| **Vocal** | Mémos audio à réécouter, à convertir en point de contrôle ou à ajouter à la conclusion |
| **Rapport** | Vérifications avant envoi, puis **Générer le compte rendu Word** (feuille de partage iOS : Fichiers, Mail, Teams, OneDrive…) |

- **Dictée** : bouton 🎙 dans chaque champ. S'il n'est pas disponible, utilisez le micro du clavier iOS.
- **Nouvelle visite** : l'app propose de reprendre les points restés *Non conforme* ou *À surveiller* lors de la visite précédente.
- **Sauvegarde** : ⚙︎ → *Exporter une sauvegarde* (fichier .json à ranger dans OneDrive ou Fichiers). Pensez-y régulièrement.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | Interface |
| `db.js` | Stockage local (IndexedDB) |
| `report.js` | **Mise en page du compte rendu Word** : c'est ce fichier qu'il faut modifier pour ajuster le modèle |
| `docx.iife.js` | Bibliothèque docx 9.8 (génération Word dans le navigateur) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Fonctionnement hors connexion et installation |

**Mise à jour** : après avoir remplacé un fichier sur GitHub, incrémentez `VERSION` dans `sw.js` pour que les iPhone récupèrent la nouvelle version.
