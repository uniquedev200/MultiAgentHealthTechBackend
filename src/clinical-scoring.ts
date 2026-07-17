import type { VitalSigns } from "./types";

/**
 * Derive a clinical acuity score (1-5) from objective clinical data.
 *
 * Scoring factors:
 *  - Vital sign abnormalities (SpO2, HR, BP, Temp)
 *  - Symptom keywords (chest pain, cardiac arrest, breathing difficulty, etc.)
 *  - Medical history risk factors (elderly, cardiac history, diabetes, etc.)
 *
 * This replaces subjective acuity input — the data decides, not the user.
 */
export function computeAcuityFromClinicalData(params: {
  vitals?: VitalSigns;
  symptoms?: string;
  medicalHistory?: string;
  age?: number;
}): number {
  let score = 1;
  const { vitals, symptoms, medicalHistory, age } = params;
  const symLower = (symptoms || "").toLowerCase();
  const histLower = (medicalHistory || "").toLowerCase();

  // ── Vital signs scoring (0-3 points) ──
  if (vitals) {
    // SpO2: normal 95-100
    if (vitals.sp_o2 !== undefined) {
      if (vitals.sp_o2 < 85) score += 3;
      else if (vitals.sp_o2 < 90) score += 2;
      else if (vitals.sp_o2 < 95) score += 1;
    }

    // Heart rate: normal 60-100
    if (vitals.heart_rate !== undefined) {
      if (vitals.heart_rate > 150 || vitals.heart_rate < 40) score += 2;
      else if (vitals.heart_rate > 110 || vitals.heart_rate < 50) score += 1;
    }

    // Blood pressure: parse systolic from "120/80" format
    if (vitals.blood_pressure) {
      const systolic = parseInt(vitals.blood_pressure.split("/")[0], 10);
      if (!isNaN(systolic)) {
        if (systolic < 70 || systolic > 200) score += 2;
        else if (systolic < 90 || systolic > 160) score += 1;
      }
    }

    // Temperature: normal 36.1-37.5
    if (vitals.temperature !== undefined) {
      if (vitals.temperature > 40 || vitals.temperature < 34) score += 2;
      else if (vitals.temperature > 38.5 || vitals.temperature < 35.5) score += 1;
    }
  }

  // ── Symptom keyword scoring (0-3 points) ──
  const criticalSymptoms = [
    "cardiac arrest", "unresponsive", "no pulse", "anaphylaxis",
    "massive hemorrhage", "tension pneumothorax", "severe sepsis",
  ];
  const severeSymptoms = [
    "chest pain", "cardiac", "stroke", "sob", "shortness of breath",
    "respiratory distress", "difficulty breathing", "severe bleeding",
    "hemorrhage", "altered mental", "seizure", "overdose",
    "major trauma", "gunshot", "stabbing", "burn",
  ];
  const moderateSymptoms = [
    "fracture", "laceration", "abdominal pain", "vomiting", "dizziness",
    "weakness", "fever", "dehydration", "wound", "sprain", "fall",
    "headache", "back pain", "allergic reaction", "diarrhea", "syncope",
  ];

  // Allow up to 2 matches per severity tier (each match adds 1)
  let critHits = 0;
  for (const s of criticalSymptoms) {
    if (symLower.includes(s) && critHits < 2) { score += 2; critHits++; }
  }
  let sevHits = 0;
  for (const s of severeSymptoms) {
    if (symLower.includes(s) && sevHits < 2) { score += 2; sevHits++; }
  }
  let modHits = 0;
  for (const s of moderateSymptoms) {
    if (symLower.includes(s) && modHits < 2) { score += 1; modHits++; }
  }

  // ── Age risk factor (0-1 point) ──
  if (age !== undefined) {
    if (age > 75 || age < 2) score += 1;
  }

  // ── Medical history risk factors (0-1 point) ──
  const highRiskHistory = [
    "cardiac", "heart disease", "mi", "myocardial infarction",
    "stroke", "copd", "renal failure", "dialysis", "immunocompromised",
    "cancer", "chemotherapy", "organ transplant",
  ];
  for (const h of highRiskHistory) {
    if (histLower.includes(h)) { score += 1; break; }
  }

  // Normalize to 1-5
  // Raw score ranges from ~1 to ~12. Map generously for clinical accuracy.
  if (score >= 8) return 5;
  if (score >= 6) return 4;
  if (score >= 4) return 3;
  if (score >= 2) return 2;
  return 1;
}
