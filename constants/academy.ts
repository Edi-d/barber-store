// Academy free-haircut feature — shared constants.
//
// Bumping ACADEMY_CONSENT_VERSION invalidates every previously-accepted
// consent (see hooks/useAcademyConsent.ts), forcing a re-prompt next time the
// client tries to book a free academy haircut.
export const ACADEMY_CONSENT_VERSION = "2026-07-v1";

export const ACADEMY_CONSENT_TITLE = "Tuns gratuit — Academie";

// TODO: replace with final legal consent terms provided by the business
export const ACADEMY_CONSENT_BODY_PARAGRAPHS = [
  "Acest serviciu este oferit gratuit în cadrul programului de formare al academiei. Tunsoarea va fi realizată de un cursant aflat în curs de pregătire, sub — sau fără — supravegherea unui frizer senior, în funcție de disponibilitate.",
  "Deoarece cursantul este în proces de învățare, rezultatul poate varia față de o tunsoare realizată de un frizer cu experiență. Îți recomandăm să vii cu așteptări flexibile în privința rezultatului final.",
  "Platforma Tapzi facilitează programarea, dar nu răspunde pentru rezultatul tunsorii, eventuale nemulțumiri estetice sau alte consecințe ale serviciului prestat de cursant.",
  "Prin apăsarea butonului \"Sunt de acord\" confirmi că ai citit și înțeles cele de mai sus și îți exprimi acordul de a participa la acest serviciu în aceste condiții.",
] as const;
