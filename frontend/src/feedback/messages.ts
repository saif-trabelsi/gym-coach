export type SupportedLanguage = 'en-US' | 'fr-FR' | 'ar';

export interface FeedbackMessages {
  // Squat messages
  depth: string;
  back: string;
  tempo: string;

  // Bicep curl messages
  range: string;
  extension: string;
  elbowDrift: string;
  swing: string;

  // General positive feedback
  good_rep: string;
}

export const MESSAGES: Record<SupportedLanguage, FeedbackMessages> = {
  'en-US': {
    depth: 'Go lower',
    back: 'Keep your chest up',
    tempo: 'Slow down',
    range: 'Curl higher',
    extension: 'Fully extend',
    elbowDrift: 'Pin your elbow',
    swing: "Don't swing",
    good_rep: 'Good rep',
  },
  'fr-FR': {
    depth: 'Descends plus bas',
    back: 'Garde la poitrine haute',
    tempo: 'Ralentis',
    range: 'Monte plus haut',
    extension: 'Tends complètement les bras',
    elbowDrift: 'Garde les coudes fixes',
    swing: 'Ne balance pas ton corps',
    good_rep: 'Bonne répétition',
  },
  ar: {
    depth: 'انزل أكثر',
    back: 'ارفع صدرك',
    tempo: 'تمهل',
    range: 'ارفع للأعلى',
    extension: 'افرد ذراعيك بالكامل',
    elbowDrift: 'ثبت كوعك',
    swing: 'لا تتأرجح',
    good_rep: 'تكرار ممتاز',
  },
};

/**
 * Returns translated message for a given message key and language,
 * falling back to English if missing.
 */
export function getTranslatedMessage(
  key: keyof FeedbackMessages | string,
  lang: SupportedLanguage = 'en-US'
): string {
  const langDict = MESSAGES[lang] || MESSAGES['en-US'];
  const msgKey = key as keyof FeedbackMessages;
  if (langDict[msgKey]) {
    return langDict[msgKey];
  }
  return MESSAGES['en-US'][msgKey] ?? String(key);
}
