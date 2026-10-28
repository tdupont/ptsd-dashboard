// Input variables shown in the form: grouping, widget, bilingual labels.
// Questionnaire items are short paraphrases (the official wordings are copyrighted); enter the item score.

const YN = { No: { en: "No", fr: "Non" }, Yes: { en: "Yes", fr: "Oui" } };
const SEX = { Female: { en: "Female", fr: "Femme" }, Male: { en: "Male", fr: "Homme" } };

const scale = (anchors) => anchors.map(([v, en, fr]) => ({ value: v, en, fr }));

const HADS_FREQ = scale([[0, "Not at all", "Jamais"], [1, "Not often", "Rarement"], [2, "Quite often", "Assez souvent"], [3, "Very often", "Très souvent"]]);
const PDEQ = scale([[1, "Not at all true", "Pas du tout vrai"], [2, "Slightly true", "Un peu vrai"], [3, "Somewhat true", "Plutôt vrai"], [4, "Very true", "Très vrai"], [5, "Extremely true", "Extrêmement vrai"]]);
const ISI_IMPACT = scale([[0, "Not at all", "Aucunement"], [1, "A little", "Légèrement"], [2, "Somewhat", "Moyennement"], [3, "Much", "Très"], [4, "Very much", "Extrêmement"]]);

export const GROUPS = {
  patient: { en: "Patient", fr: "Patient" },
  stay: { en: "ICU and stay", fr: "Service et séjour" },
  relative: { en: "Relative", fr: "Proche" },
  experience: { en: "Relative's experience of the stay", fr: "Vécu du séjour par le proche" },
  hads: { en: "HADS at discharge (item scores)", fr: "HADS à la sortie (score de l'item)" },
  pdeq: { en: "PDEQ at discharge (peritraumatic dissociation)", fr: "PDEQ à la sortie (dissociation péritraumatique)" },
  isi: { en: "ISI at discharge (insomnia)", fr: "ISI à la sortie (insomnie)" },
  context: { en: "Perceived context", fr: "Contexte perçu" },
};

// widget: "number" | "choice" | "scale"
export const VARIABLES = {
  algo1: [
    { name: "Patient's age", group: "patient", widget: "number", min: 12, max: 97, step: 1, unit: { en: "years", fr: "ans" },
      label: { en: "Patient's age", fr: "Âge du patient" }, short: { en: "Patient's age", fr: "Âge patient" } },
    { name: "Patient's sex", group: "patient", widget: "choice", options: SEX,
      label: { en: "Patient's sex", fr: "Sexe du patient" }, short: { en: "Patient's sex", fr: "Sexe patient" } },
    { name: "Performans status", group: "patient", widget: "choice",
      options: { "Good (1-2)": { en: "Good (1–2)", fr: "Bon (1–2)" }, "Poor (3-4)": { en: "Poor (3–4)", fr: "Altéré (3–4)" } },
      label: { en: "Performance status before admission", fr: "Performance status avant l'admission" }, short: { en: "Performance status", fr: "Performance status" } },
    { name: "History of cancer", group: "patient", widget: "choice", options: YN,
      label: { en: "History of cancer", fr: "Antécédent de cancer" }, short: { en: "History of cancer", fr: "Antécédent de cancer" } },
    { name: "Center type", group: "stay", widget: "choice",
      options: { University: { en: "University", fr: "Universitaire" }, General: { en: "General", fr: "Général" }, Private: { en: "Private", fr: "Privé" } },
      label: { en: "Hospital type", fr: "Type d'établissement" }, short: { en: "Hospital type", fr: "Type d'établissement" } },
    { name: "Number of beds", group: "stay", widget: "choice", numeric: true,
      options: { 1: { en: "20 beds or fewer", fr: "20 lits ou moins" }, 2: { en: "More than 20 beds", fr: "Plus de 20 lits" } },
      label: { en: "ICU size", fr: "Taille du service" }, short: { en: "ICU size", fr: "Taille du service" } },
    { name: "Psychologist", group: "stay", widget: "choice", options: YN,
      label: { en: "Psychologist available in the ICU", fr: "Psychologue dans le service" }, short: { en: "Psychologist in ICU", fr: "Psychologue" } },
    { name: "Mechanical ventilation", group: "stay", widget: "choice", options: YN,
      label: { en: "Mechanical ventilation", fr: "Ventilation mécanique" }, short: { en: "Mechanical ventilation", fr: "Ventilation mécanique" } },
    { name: "Treatment limitation", group: "stay", widget: "choice", options: YN,
      label: { en: "Treatment limitation decision", fr: "Limitation ou arrêt des thérapeutiques" }, short: { en: "Treatment limitation", fr: "LAT" } },
    { name: "Duration of stay", group: "stay", widget: "number", min: 1, max: 90, step: 1, unit: { en: "days", fr: "jours" },
      label: { en: "Length of ICU stay", fr: "Durée de séjour en réanimation" }, short: { en: "Length of stay", fr: "Durée de séjour" } },
    { name: "Death in ICU", group: "stay", widget: "choice", options: YN,
      label: { en: "Patient died in the ICU", fr: "Décès en réanimation" }, short: { en: "Death in ICU", fr: "Décès en réanimation" } },
    { name: "Relative's age", group: "relative", widget: "number", min: 18, max: 92, step: 1, unit: { en: "years", fr: "ans" },
      label: { en: "Relative's age", fr: "Âge du proche" }, short: { en: "Relative's age", fr: "Âge proche" } },
    { name: "Relative's sex", group: "relative", widget: "choice", options: SEX,
      label: { en: "Relative's sex", fr: "Sexe du proche" }, short: { en: "Relative's sex", fr: "Sexe proche" } },
    { name: "Relationship", group: "relative", widget: "choice",
      options: { Spouse: { en: "Spouse or partner", fr: "Conjoint" }, Children: { en: "Child of the patient", fr: "Enfant du patient" },
        Parent: { en: "Parent of the patient", fr: "Parent du patient" }, Other: { en: "Other", fr: "Autre" } },
      label: { en: "Relationship to the patient", fr: "Lien avec le patient" }, short: { en: "Relationship", fr: "Lien de parenté" } },
    { name: "Relative's activity status", group: "relative", widget: "choice",
      options: { Active: { en: "Working", fr: "En activité" }, Retired: { en: "Retired", fr: "Retraité" },
        Unemployed: { en: "Unemployed", fr: "Sans emploi" }, Other: { en: "Other", fr: "Autre" } },
      label: { en: "Relative's occupation", fr: "Activité du proche" }, short: { en: "Occupation", fr: "Activité" } },
    { name: "Relative has children", group: "relative", widget: "choice", options: YN,
      label: { en: "Relative has children", fr: "Le proche a des enfants" }, short: { en: "Has children", fr: "A des enfants" } },
  ],

  algo2: [
    { name: "Patient's age", group: "patient", widget: "number", min: 18, max: 93, step: 1, unit: { en: "years", fr: "ans" },
      label: { en: "Patient's age", fr: "Âge du patient" }, short: { en: "Patient's age", fr: "Âge patient" } },
    { name: "Death in ICU", group: "patient", widget: "choice", options: YN,
      label: { en: "Patient died in the ICU", fr: "Décès en réanimation" }, short: { en: "Death in ICU", fr: "Décès en réanimation" } },
    { name: "Relative's sex", group: "relative", widget: "choice", options: SEX,
      label: { en: "Relative's sex", fr: "Sexe du proche" }, short: { en: "Relative's sex", fr: "Sexe proche" } },
    { name: "Relationship", group: "relative", widget: "choice",
      options: { Spouse: { en: "Spouse or partner", fr: "Conjoint" }, Children: { en: "Child of the patient", fr: "Enfant du patient" },
        Parent: { en: "Parent of the patient", fr: "Parent du patient" }, Sibling: { en: "Sibling", fr: "Frère ou sœur" }, Other: { en: "Other", fr: "Autre" } },
      label: { en: "Relationship to the patient", fr: "Lien avec le patient" }, short: { en: "Relationship", fr: "Lien de parenté" } },
    { name: "Relative lives alone", group: "relative", widget: "choice", options: YN,
      label: { en: "Relative lives alone", fr: "Le proche vit seul" }, short: { en: "Lives alone", fr: "Vit seul" } },
    { name: "Relative has children", group: "relative", widget: "choice", options: YN,
      label: { en: "Relative has children", fr: "Le proche a des enfants" }, short: { en: "Has children", fr: "A des enfants" } },
    { name: "Bereavements (THS item J)", group: "relative", widget: "number", min: 0, max: 20, step: 1,
      label: { en: "Previous bereavements of close family or friends", fr: "Deuils antérieurs (famille proche ou amis)" },
      help: { en: "Traumatic History Screen, item J: number of times (0 if never).", fr: "Traumatic History Screen, item J : nombre de fois (0 si jamais)." },
      short: { en: "Previous bereavements", fr: "Deuils antérieurs" } },
    { name: "At ease expressing opinion", group: "experience", widget: "choice", options: YN,
      label: { en: "Felt at ease giving their opinion", fr: "À l'aise pour donner son avis" }, short: { en: "At ease giving opinion", fr: "À l'aise (avis)" } },
    { name: "At ease expressing feelings", group: "experience", widget: "choice", options: YN,
      label: { en: "Felt at ease expressing their feelings", fr: "À l'aise pour exprimer son ressenti" }, short: { en: "At ease with feelings", fr: "À l'aise (ressenti)" } },
    { name: "HADS A13 (sudden panic)", group: "hads", widget: "scale", options: HADS_FREQ,
      label: { en: "A13 · Sudden feelings of panic", fr: "A13 · Sensations soudaines de panique" }, short: { en: "HADS A13 panic", fr: "HADS A13 panique" } },
    { name: "HADS D2 (enjoyment)", group: "hads", widget: "scale",
      options: scale([[0, "As much as before", "Autant qu'avant"], [1, "Not quite as much", "Un peu moins"], [2, "Only a little", "Un peu seulement"], [3, "Hardly at all", "Presque plus"]]),
      label: { en: "D2 · Still enjoys the things they used to", fr: "D2 · Prend plaisir aux mêmes choses qu'avant" }, short: { en: "HADS D2 enjoyment", fr: "HADS D2 plaisir" } },
    { name: "HADS D4 (laughter)", group: "hads", widget: "scale",
      options: scale([[0, "As much as before", "Autant qu'avant"], [1, "Not quite as much", "Un peu moins"], [2, "Definitely less", "Nettement moins"], [3, "Not at all", "Plus du tout"]]),
      label: { en: "D4 · Laughs and sees the funny side", fr: "D4 · Rit et voit le bon côté des choses" }, short: { en: "HADS D4 laughter", fr: "HADS D4 rire" } },
    { name: "HADS D12 (looking forward)", group: "hads", widget: "scale",
      options: scale([[0, "As much as before", "Autant qu'avant"], [1, "Rather less", "Un peu moins"], [2, "Definitely less", "Bien moins"], [3, "Hardly at all", "Presque jamais"]]),
      label: { en: "D12 · Looks forward to things", fr: "D12 · Se réjouit d'avance de certaines choses" }, short: { en: "HADS D12 looking forward", fr: "HADS D12 se réjouir" } },
    { name: "PDEQ 4 (unreality)", group: "pdeq", widget: "scale", options: PDEQ,
      label: { en: "Item 4 · What was happening seemed unreal", fr: "Item 4 · Ce qui se passait semblait irréel" }, short: { en: "PDEQ 4 unreality", fr: "PDEQ 4 irréel" } },
    { name: "PDEQ 5 (spectator)", group: "pdeq", widget: "scale", options: PDEQ,
      label: { en: "Item 5 · Felt like a spectator", fr: "Item 5 · Comme spectateur de ce qui arrivait" }, short: { en: "PDEQ 5 spectator", fr: "PDEQ 5 spectateur" } },
    { name: "PDEQ 6 (body disconnection)", group: "pdeq", widget: "scale", options: PDEQ,
      label: { en: "Item 6 · Body perception was altered", fr: "Item 6 · Perception du corps perturbée" }, short: { en: "PDEQ 6 body", fr: "PDEQ 6 corps" } },
    { name: "ISI sleep dissatisfaction", group: "isi", widget: "scale",
      options: scale([[0, "Very satisfied", "Très satisfait"], [1, "Satisfied", "Satisfait"], [2, "Neutral", "Neutre"], [3, "Dissatisfied", "Insatisfait"], [4, "Very dissatisfied", "Très insatisfait"]]),
      label: { en: "Satisfaction with current sleep", fr: "Satisfaction du sommeil actuel" }, short: { en: "ISI sleep dissatisfaction", fr: "ISI insatisfaction sommeil" } },
    { name: "ISI daily functioning", group: "isi", widget: "scale", options: ISI_IMPACT,
      label: { en: "Sleep problems interfere with daily functioning", fr: "Retentissement sur le fonctionnement quotidien" }, short: { en: "ISI daily functioning", fr: "ISI fonctionnement" } },
    { name: "ISI quality of life", group: "isi", widget: "scale", options: ISI_IMPACT,
      label: { en: "Sleep problems impair quality of life", fr: "Détérioration de la qualité de vie" }, short: { en: "ISI quality of life", fr: "ISI qualité de vie" } },
    // Directions checked against the eCRF: exclusion (0 = strong exclusion, 7 = none) and financial stress
    // (0 = very high stress, 7 = none). TODO(author): confirm "Social support" (0 = very isolated, 7 = very well supported).
    { name: "Social support", group: "context", widget: "scale", options: scale([[0, "", ""], [1, "", ""], [2, "", ""], [3, "", ""], [4, "", ""], [5, "", ""], [6, "", ""], [7, "", ""]]),
      ends: { en: ["Very isolated", "Very well supported"], fr: ["Très isolé", "Très entouré"] },
      label: { en: "Support from family and friends", fr: "Soutien de l'entourage" }, short: { en: "Social support", fr: "Soutien entourage" } },
    { name: "Social exclusion", group: "context", widget: "scale", options: scale([[0, "", ""], [1, "", ""], [2, "", ""], [3, "", ""], [4, "", ""], [5, "", ""], [6, "", ""], [7, "", ""]]),
      ends: { en: ["Strong social exclusion", "No social exclusion"], fr: ["Forte exclusion sociale", "Aucune exclusion sociale"] },
      label: { en: "Feeling of social exclusion", fr: "Sentiment d'exclusion sociale" }, short: { en: "Social exclusion", fr: "Exclusion sociale" } },
    { name: "Financial stress", group: "context", widget: "scale", options: scale([[0, "", ""], [1, "", ""], [2, "", ""], [3, "", ""], [4, "", ""], [5, "", ""], [6, "", ""], [7, "", ""]]),
      ends: { en: ["Very high stress", "No stress"], fr: ["Stress très important", "Aucun stress"] },
      label: { en: "Perceived financial stress", fr: "Stress financier ressenti" }, short: { en: "Financial stress", fr: "Stress financier" } },
    { name: "Physical pain", group: "context", widget: "scale", options: scale([[0, "", ""], [1, "", ""], [2, "", ""], [3, "", ""], [4, "", ""], [5, "", ""], [6, "", ""], [7, "", ""], [8, "", ""], [9, "", ""], [10, "", ""]]),
      ends: { en: ["No pain", "Worst pain"], fr: ["Aucune douleur", "Douleur maximale"] },
      label: { en: "Relative's physical pain", fr: "Douleurs physiques du proche" }, short: { en: "Physical pain", fr: "Douleurs physiques" } },
  ],
};

export function optionLabel(v, value, lang) {
  if (value === null || value === undefined || value === "") return lang === "fr" ? "non renseigné" : "not provided";
  if (v.widget === "number") return `${value}${v.unit ? " " + v.unit[lang] : ""}`;
  if (v.widget === "scale") {
    const o = v.options.find((o) => o.value === Number(value));
    return o && o[lang] ? `${value} (${o[lang].toLowerCase()})` : String(value);
  }
  const o = v.options[value];
  return o ? o[lang] : String(value);
}
