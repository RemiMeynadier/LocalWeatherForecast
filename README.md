# LocalWeatherForecast

Prévisions météo locales **jusqu’à 5 semaines**, qui combinent les meilleurs modèles numériques disponibles pour
l’endroit où vous êtes.

👉 **Démo : https://remimeynadier.github.io/LocalWeatherForecast/**

## Ce que fait l’app

| Échéance | Source | Affichage |
|---|---|---|
| J0 → J+3 | Modèles haute résolution couvrant le lieu (AROME, ICON-D2, UKV, HRRR, HARMONIE, MET Nordic…) | Prévision détaillée, poids renforcé pour les modèles locaux |
| J+4 → J+15 | Consensus pondéré des modèles globaux (ECMWF IFS, ICON, UKMO, GFS, GEM, JMA) | Prévision jour par jour et plage d’incertitude |
| J+15 → J+35 | Ensembles (ECMWF ENS, ECMWF AIFS ENS, NOAA GEFS, ICON-EPS) | Médiane, dispersion et probabilités par tercile par rapport aux normales 1991-2020 |

- **Sélection automatique des modèles** selon la position : un modèle régional n’est utilisé que si le lieu est
  dans son domaine, et seulement jusqu’à sa vraie échéance. Les produits « seamless » basculent sur ECMWF au-delà,
  ce qui compterait ECMWF deux fois.
- **Indice de confiance** par jour : il dépend de l’échéance et baisse quand les scénarios divergent.
- **Tendances hebdomadaires** : probabilité qu’une semaine soit plus chaude, plus froide, plus sèche ou plus humide
  que la normale, comme dans les prévisions longue échéance des services météo.
- **Normales de saison** calculées à partir de la réanalyse ERA5 (1991-2020) au point exact, avec un cache local.
- Le dernier jour de chaque modèle n’est souvent couvert que sur quelques heures, ce qui fausse ses valeurs
  journalières. Il est donc ignoré.

Toutes les données viennent de l’API gratuite [Open-Meteo](https://open-meteo.com) (sans clé), appelée
directement depuis le navigateur. Il n’y a pas de backend.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/LocalWeatherForecast/
npm test         # tests unitaires (Vitest)
npm run lint
npm run build
```

Chaque push sur `main` est testé puis déployé sur GitHub Pages (`.github/workflows/deploy.yml`).

## Structure

```
src/
  api/openMeteo.ts        appels API (géocodage, modèles, ensembles, climat)
  lib/models.ts           catalogue des modèles, domaines, pondération selon l’échéance
  lib/forecast.ts         consensus, quantiles d’ensemble, confiance, tendances hebdo
  lib/climate.ts          normales journalières et terciles climatologiques
  lib/useForecast.ts      chargement et assemblage
  components/             recherche, cartes, graphiques SVG, tendances, tableau des modèles
```

## Pistes

- Pondération selon la fiabilité réelle de chaque modèle à l’endroit choisi (comparaison prévisions passées /
  observations).
- Correction de biais des ensembles (altitude, maille).
- Prévision horaire pour les 48 premières heures.
- Prévisions saisonnières (1 à 6 mois).

## Licence des données

Données météo : [Open-Meteo.com](https://open-meteo.com/) sous licence CC BY 4.0, d’après ECMWF, DWD, NOAA,
Météo-France, Met Office, ECCC, JMA, KNMI, DMI et MET Norway. Normales : ERA5 (Copernicus).
