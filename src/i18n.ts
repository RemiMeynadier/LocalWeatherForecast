// Minimal two-language support. The current language lives at module level
// so plain functions (formatters, text generators) can read it; App keeps it
// in state too, so changing it re-renders everything.

export type Lang = 'en' | 'fr'

const KEY = 'lwf.lang'

// Priority: ?lang= in the URL (shareable links), then the saved choice,
// then the browser language.
function detect(): Lang {
  try {
    const fromUrl = new URLSearchParams(location.search).get('lang')
    if (fromUrl === 'en' || fromUrl === 'fr') return fromUrl
  } catch {
    // Not in a browser.
  }
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'fr') return saved
  } catch {
    // Storage unavailable.
  }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('fr') ? 'fr' : 'en'
}

let current: Lang = detect()

export const getLang = () => current
export const locale = () => (current === 'fr' ? 'fr-FR' : 'en-GB')

export function setLang(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Not critical.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

const en = {
  // Header & page
  search: 'Search a place…',
  myLocation: 'My location',
  useMyLocation: 'Use my location',
  geoUnavailable: 'Geolocation is not available in this browser.',
  geoDenied: 'Location denied or unavailable.',
  switchLang: 'Version française',
  loading: 'Loading models…',
  error: 'Error: {msg}',
  synoptic: 'Synoptic situation',
  extremes: 'Extremes & warnings',
  next10: 'Next 10 days',
  temps: 'Temperatures · {n} days',
  precip: 'Precipitation',
  weekly: 'Weekly outlook',
  weeklyLede: 'Probabilities vs. 1991–2020 normals (33% each = no signal).',
  backtest: 'Backtest & weights',
  models: 'Models',
  dataTable: 'All data (table)',
  method: 'Method',
  methodItems:
    'D0–D+3: local high-resolution models weigh most.|D+4–D+15: blend of physics and AI global models, weighted by last week’s accuracy.|Beyond: ensembles only, as probabilities vs. normals.|Extremes: local climate thresholds, cross-checked with official warnings.',
  data: 'Data',

  // Legends
  lMax: 'Max',
  lMin: 'Min',
  lRange: 'Likely range (80% / 50%)',
  lNormals: 'Normals 1991–2020',
  lLoading: '(loading…)',
  lRain: 'Daily total',
  lProb: 'Chance ≥ 1 mm',

  // Days & confidence
  today: 'Today',
  todayShort: 'Today',
  tomorrow: 'Tomorrow',
  confidence: 'Confidence',
  cHigh: 'High',
  cGood: 'Good',
  cMedium: 'Medium',
  cLow: 'Low',
  cTrend: 'Trend',
  maxRange: 'max {lo}–{hi}',
  maxRangeTip: '80% of scenarios give a maximum in this range',

  // Charts
  lead: 'D+{n}',
  hTrend: 'D+10 · trend',
  hProb: 'D+15 · probabilities',
  normal: 'Normal',
  rain: 'Rain',
  rainChance: '{p} chance ≥ 1 mm',
  nModels: '{n} models',
  nScenarios: 'ensembles ({n} scenarios)',
  chanceShort: 'Chance',
  ariaTemps: 'Forecast temperatures with uncertainty range and normals',
  ariaPrecip: 'Forecast precipitation and chance of rain',

  // Table
  tDay: 'Day',
  tMaxRange: 'Max range (80%)',
  tNormals: 'Normals',
  tGusts: 'Gusts',

  // Weekly
  week: 'Week {n}',
  daysSuffix: '{n} d',
  meanTemp: 'mean temp.',
  vsNormal: 'vs normal',
  medianTotal: 'median total',
  source: 'Source: {s}',
  noEnsemble: 'No ensemble data available.',
  loadingNormals: 'Loading normals…',
  colder: 'Colder',
  near: 'Near normal',
  warmer: 'Warmer',
  drier: 'Drier',
  wetter: 'Wetter',
  noSignal: 'No clear signal',
  nearNormal: 'Near normal',
  thanNormal: '{x} than normal',
  likely: 'likely',
  slightly: 'slightly favoured',

  // Models table
  model: 'Model',
  blend: 'Weighted blend',
  local: 'local',
  aiTip: 'Machine-learning model',
  weightTip: 'Weight in the day’s blend: {p}',
  outOfRange: 'Beyond the model’s range',
  modelsNote: 'Bar = weight in the day’s blend. Ensembles: {e}.',
  unavailable: 'Unavailable: {x}.',
  notUsed: 'Out of domain: {x}.',

  // Backtest
  btLoading: 'Fetching last week’s observations and forecasts…',
  btError: 'Backtest unavailable ({msg}): fixed weights used.',
  btNoStation: 'No observing station within 60 km: fixed weights used.',
  btLede: 'Last 7 days at {station} ({id}, {km} km): forecasts issued 1–7 days ahead vs. hourly observations. More accurate models get more weight.',
  btFewRain: 'Too little rain this week to score rain forecasts.',
  btWeights: 'Weights in the temperature blend',
  btBefore: 'Before backtest',
  btAfter: 'After',
  btError2: 'Temperature error (MAE, °C)',
  btErrorSub: 'Darker = larger error.',
  btBias: 'Bias D+1',
  btRain: 'Rain skill D+1',
  btBiasTip: 'Mean forecast minus observed, D+1',
  btRainTip: 'Rain / no rain detection (ETS): 1 = perfect, 0 = no skill',
  btObs: 'Observed vs. forecast (D+1)',
  observed: 'Observed',
  best: 'Best: {m}',
  worst: 'Worst: {m}',
  ariaObs: 'Observed temperature vs. best and worst model',
  leadTime: 'Lead time',

  // Synoptic map & briefing
  synUnavailable: 'Synoptic data unavailable: {msg}',
  synLoading: 'Analysing the synoptic situation…',
  synSource: 'ECMWF IFS fields, 3° grid.',
  synNow: 'Now',
  syn48: 'Next 48 h',
  syn35: 'Days 3–5',
  now: 'now',
  mapPressure: 'Pressure (hPa)',
  mapLow: '500 hPa trough',
  mapHigh: '500 hPa ridge',
  mapYou: 'You',
  mapTime: 'Forecast time',
  mapAria: 'Synoptic chart for {t} UTC',

  sNow: '{p} hPa, {regime}. {centres}Wind: {flow}. 500 hPa: {upper}. T850: {t} °C.',
  rFirmHigh: 'strongly anticyclonic',
  rHigh: 'anticyclonic',
  rNeutral: 'neutral',
  rLow: 'cyclonic',
  rDeepLow: 'deeply cyclonic',
  cHighNear: 'High {v} hPa nearby. ',
  cHighFar: 'High {v} hPa {km} km {dir}. ',
  cLowNear: 'Low {v} hPa nearby. ',
  cLowFar: 'Low {v} hPa {km} km {dir}. ',
  dirs: 'to the N|to the NE|to the E|to the SE|to the S|to the SW|to the W|to the NW',
  fromDirs: 'northerly|north-easterly|easterly|south-easterly|southerly|south-westerly|westerly|north-westerly',
  flowSlack: 'light and variable',
  flow: '{strength} {from}',
  sLight: 'light',
  sModerate: 'moderate',
  sStrong: 'strong',
  sSevere: 'very strong',
  uTrough: 'trough overhead (unstable)',
  uRidge: 'ridge overhead (settled)',
  uFlat: 'straight flow',
  uTroughUp: ', trough upstream',
  uRidgeUp: ', ridge upstream',
  chDip: 'Pressure dips to {p} hPa on {day} (low or front passing), {dp} hPa overall by {end}.',
  chFallSharp: 'Sharp fall ({dp} hPa by {end}): low or front approaching, wind and rain risk.',
  chFall: 'Pressure falling ({dp} hPa by {end}): more unsettled.',
  chRiseStrong: 'Strong rise (+{dp} hPa by {end}): high pressure building.',
  chRise: 'Pressure rising (+{dp} hPa by {end}): settling.',
  chSteady: 'Little change ({dp} hPa).',
  chWind: 'Tightest gradient on {day}: {flow} wind.',
  chGales: ' Gales likely.',
  chWarmer: 'Warmer air mass (T850 +{dt} °C).',
  chColder: 'Colder air mass (T850 {dt} °C).',
  chUpperTrough: 'Upper trough on {day}.',
  chUpperRidge: 'Upper ridge on {day}.',
  chTurn: 'Wind turning {from}.',

  // Extremes
  xHeat: 'Heat',
  xWarmth: 'Unusual warmth',
  xSevereCold: 'Severe cold',
  xUnusualCold: 'Unusual cold',
  xFrost: 'Unseasonal frost',
  xRain: 'Heavy rain',
  xWind: 'Strong winds',
  xWindPossible: 'Possible strong winds',
  xSnow: 'Snow',
  xStorms: 'Thunderstorms',
  xDetail: 'Peak {v} · threshold {thr}',
  xLocal: '{v} (local extreme)',
  xOneModel: '{v} in one model',
  xTwoModels: '2+ models',
  xProb: ' · {p} of scenarios',
  warning: 'Warning',
  watch: 'Watch',
  confirmed: '✓ Confirmed:',
  notConfirmed: '✗ No official warning.',
  tooEarly: 'No official warning yet (issued 1–2 days ahead).',
  unmatched: 'Official warnings not flagged by the models:',
  followOfficial: 'Follow the official warning.',
  allClear: '✓ No extreme weather expected in the next 15 days.',
  wChecking: 'Checking official warnings…',
  wFailed: 'Official warnings unavailable ({msg}).',
  wMeteoAlarm: 'Official warnings: MeteoAlarm, updated {t}.',
  wNws: 'Official warnings: US National Weather Service.',
  wNone: ' None for your area.',
  wNoFeed: 'No official warning feed for this country: model alerts only.',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red',
  details: 'details',
}

type Dict = typeof en
export type TKey = keyof Dict

const fr: Dict = {
  search: 'Rechercher un lieu…',
  myLocation: 'Ma position',
  useMyLocation: 'Utiliser ma position',
  geoUnavailable: 'Géolocalisation indisponible sur ce navigateur.',
  geoDenied: 'Position refusée ou introuvable.',
  switchLang: 'English version',
  loading: 'Chargement des modèles…',
  error: 'Erreur : {msg}',
  synoptic: 'Situation synoptique',
  extremes: 'Extrêmes et vigilances',
  next10: 'Les 10 prochains jours',
  temps: 'Températures · {n} jours',
  precip: 'Précipitations',
  weekly: 'Tendances hebdomadaires',
  weeklyLede: 'Probabilités par rapport aux normales 1991–2020 (33 % chacune = pas de signal).',
  backtest: 'Backtest et pondération',
  models: 'Modèles',
  dataTable: 'Toutes les données (tableau)',
  method: 'Méthode',
  methodItems:
    'J0–J+3 : les modèles locaux haute résolution pèsent le plus.|J+4–J+15 : consensus des modèles globaux physiques et IA, pondéré par leur précision de la semaine passée.|Au-delà : ensembles uniquement, en probabilités par rapport aux normales.|Extrêmes : seuils climatologiques locaux, recoupés avec les vigilances officielles.',
  data: 'Données',

  lMax: 'Max',
  lMin: 'Min',
  lRange: 'Plage probable (80 % / 50 %)',
  lNormals: 'Normales 1991–2020',
  lLoading: '(chargement…)',
  lRain: 'Cumul journalier',
  lProb: 'Probabilité ≥ 1 mm',

  today: 'Aujourd’hui',
  todayShort: 'Auj.',
  tomorrow: 'Demain',
  confidence: 'Confiance',
  cHigh: 'Élevée',
  cGood: 'Bonne',
  cMedium: 'Moyenne',
  cLow: 'Faible',
  cTrend: 'Tendance',
  maxRange: 'max {lo}–{hi}',
  maxRangeTip: '80 % des scénarios donnent un maximum dans cette plage',

  lead: 'J+{n}',
  hTrend: 'J+10 · tendance',
  hProb: 'J+15 · probabilités',
  normal: 'Normale',
  rain: 'Pluie',
  rainChance: '{p} de risque ≥ 1 mm',
  nModels: '{n} modèles',
  nScenarios: 'ensembles ({n} scénarios)',
  chanceShort: 'Proba.',
  ariaTemps: 'Températures prévues avec plage d’incertitude et normales',
  ariaPrecip: 'Précipitations prévues et probabilité de pluie',

  tDay: 'Jour',
  tMaxRange: 'Plage max (80 %)',
  tNormals: 'Normales',
  tGusts: 'Rafales',

  week: 'Semaine {n}',
  daysSuffix: '{n} j',
  meanTemp: 'temp. moyenne',
  vsNormal: 'vs normale',
  medianTotal: 'cumul médian',
  source: 'Source : {s}',
  noEnsemble: 'Pas de données d’ensemble.',
  loadingNormals: 'Chargement des normales…',
  colder: 'Plus frais',
  near: 'Proche normale',
  warmer: 'Plus chaud',
  drier: 'Plus sec',
  wetter: 'Plus humide',
  noSignal: 'Pas de signal clair',
  nearNormal: 'Proche de la normale',
  thanNormal: '{x} que la normale',
  likely: 'probable',
  slightly: 'légèrement favorisé',

  model: 'Modèle',
  blend: 'Consensus pondéré',
  local: 'local',
  aiTip: 'Modèle d’apprentissage automatique',
  weightTip: 'Poids dans le consensus du jour : {p}',
  outOfRange: 'Hors échéance du modèle',
  modelsNote: 'Trait = poids dans le consensus du jour. Ensembles : {e}.',
  unavailable: 'Indisponibles : {x}.',
  notUsed: 'Hors domaine : {x}.',

  btLoading: 'Récupération des observations et prévisions de la semaine passée…',
  btError: 'Backtest indisponible ({msg}) : poids fixes utilisés.',
  btNoStation: 'Aucune station d’observation à moins de 60 km : poids fixes utilisés.',
  btLede: '7 derniers jours à {station} ({id}, {km} km) : prévisions émises 1 à 7 jours avant vs observations horaires. Les modèles les plus précis pèsent davantage.',
  btFewRain: 'Trop peu de pluie cette semaine pour évaluer les prévisions de pluie.',
  btWeights: 'Poids dans le consensus de température',
  btBefore: 'Avant backtest',
  btAfter: 'Après',
  btError2: 'Erreur de température (MAE, °C)',
  btErrorSub: 'Plus foncé = erreur plus grande.',
  btBias: 'Biais J+1',
  btRain: 'Score pluie J+1',
  btBiasTip: 'Prévu moins observé en moyenne, J+1',
  btRainTip: 'Détection pluie / pas de pluie (ETS) : 1 = parfait, 0 = aucun skill',
  btObs: 'Observé vs prévu (J+1)',
  observed: 'Observé',
  best: 'Meilleur : {m}',
  worst: 'Pire : {m}',
  ariaObs: 'Température observée vs meilleur et pire modèle',
  leadTime: 'Échéance',

  synUnavailable: 'Données synoptiques indisponibles : {msg}',
  synLoading: 'Analyse de la situation synoptique…',
  synSource: 'Champs ECMWF IFS, grille de 3°.',
  synNow: 'Maintenant',
  syn48: 'Prochaines 48 h',
  syn35: 'Jours 3 à 5',
  now: 'maintenant',
  mapPressure: 'Pression (hPa)',
  mapLow: 'Thalweg à 500 hPa',
  mapHigh: 'Dorsale à 500 hPa',
  mapYou: 'Vous',
  mapTime: 'Échéance',
  mapAria: 'Carte synoptique du {t} UTC',

  sNow: '{p} hPa, régime {regime}. {centres}Vent : {flow}. 500 hPa : {upper}. T850 : {t} °C.',
  rFirmHigh: 'anticyclonique marqué',
  rHigh: 'anticyclonique',
  rNeutral: 'neutre',
  rLow: 'dépressionnaire',
  rDeepLow: 'très dépressionnaire',
  cHighNear: 'Anticyclone de {v} hPa tout proche. ',
  cHighFar: 'Anticyclone de {v} hPa à {km} km {dir}. ',
  cLowNear: 'Dépression de {v} hPa toute proche. ',
  cLowFar: 'Dépression de {v} hPa à {km} km {dir}. ',
  dirs: 'au nord|au nord-est|à l’est|au sud-est|au sud|au sud-ouest|à l’ouest|au nord-ouest',
  fromDirs: 'de nord|de nord-est|d’est|de sud-est|de sud|de sud-ouest|d’ouest|de nord-ouest',
  flowSlack: 'faible et variable',
  flow: '{from}, {strength}',
  sLight: 'faible',
  sModerate: 'modéré',
  sStrong: 'fort',
  sSevere: 'très fort',
  uTrough: 'thalweg au-dessus (instable)',
  uRidge: 'dorsale au-dessus (stable)',
  uFlat: 'flux rectiligne',
  uTroughUp: ', thalweg en amont',
  uRidgeUp: ', dorsale en amont',
  chDip: 'Creux à {p} hPa {day} (passage d’une dépression ou d’un front), {dp} hPa au total d’ici {end}.',
  chFallSharp: 'Forte baisse ({dp} hPa d’ici {end}) : dépression ou front en approche, risque de vent et de pluie.',
  chFall: 'Baisse de pression ({dp} hPa d’ici {end}) : temps plus perturbé.',
  chRiseStrong: 'Forte hausse (+{dp} hPa d’ici {end}) : l’anticyclone se renforce.',
  chRise: 'Hausse de pression (+{dp} hPa d’ici {end}) : temps plus stable.',
  chSteady: 'Pression stable ({dp} hPa).',
  chWind: 'Gradient le plus serré {day} : vent {flow}.',
  chGales: ' Coups de vent probables.',
  chWarmer: 'Masse d’air plus douce (T850 +{dt} °C).',
  chColder: 'Masse d’air plus froide (T850 {dt} °C).',
  chUpperTrough: 'Thalweg d’altitude {day}.',
  chUpperRidge: 'Dorsale d’altitude {day}.',
  chTurn: 'Vent tournant {from}.',

  xHeat: 'Chaleur',
  xWarmth: 'Douceur inhabituelle',
  xSevereCold: 'Grand froid',
  xUnusualCold: 'Froid inhabituel',
  xFrost: 'Gel inhabituel',
  xRain: 'Fortes pluies',
  xWind: 'Vents forts',
  xWindPossible: 'Vents forts possibles',
  xSnow: 'Neige',
  xStorms: 'Orages',
  xDetail: 'Pic {v} · seuil {thr}',
  xLocal: '{v} (extrême local)',
  xOneModel: '{v} dans un modèle',
  xTwoModels: '2 modèles ou plus',
  xProb: ' · {p} des scénarios',
  warning: 'Alerte',
  watch: 'Vigilance',
  confirmed: '✓ Confirmé :',
  notConfirmed: '✗ Aucune vigilance officielle.',
  tooEarly: 'Pas encore de vigilance (émises 1 à 2 jours avant).',
  unmatched: 'Vigilances officielles non détectées par les modèles :',
  followOfficial: 'Suivez la vigilance officielle.',
  allClear: '✓ Pas de temps extrême prévu dans les 15 prochains jours.',
  wChecking: 'Vérification des vigilances officielles…',
  wFailed: 'Vigilances officielles indisponibles ({msg}).',
  wMeteoAlarm: 'Vigilances : MeteoAlarm, mise à jour {t}.',
  wNws: 'Vigilances : National Weather Service (États-Unis).',
  wNone: ' Aucune pour votre zone.',
  wNoFeed: 'Pas de source de vigilance officielle pour ce pays : alertes des modèles uniquement.',
  yellow: 'Jaune',
  orange: 'Orange',
  red: 'Rouge',
  details: 'détails',
}

const DICTS: Record<Lang, Dict> = { en, fr }

export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s: string = DICTS[current][key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

// "a|b|c" entries as arrays (compass points, method items...).
export const tList = (key: TKey) => t(key).split('|')

// Locale-aware number: "3.5" / "3,5".
export function num(v: number, digits = 0): string {
  const r = Number(v.toFixed(digits)) || 0 // avoid "-0"
  const s = r.toFixed(digits)
  return current === 'fr' ? s.replace('.', ',') : s
}

export const percent = (p: number) => (current === 'fr' ? `${Math.round(p * 100)} %` : `${Math.round(p * 100)}%`)
