/**
 * Centralized linguistic rules for the "QudahWay" Jordanian Arabic tutor style.
 * Consistency across backend and frontend is key.
 */

export const ARABIC_REPLACEMENTS: Record<string, string> = {
    'هاد': 'هاض',
    'منيح': 'مليح',
    'كتير': 'كثير',
    'تانية': 'ثانية',
    'متل': 'مثل',
};

/**
 * Cleans the text based on the predefined Jordanian Arabic rules.
 */
export const jordanianCleanText = (text: string | undefined): string => {
    if (!text) return '';
    let cleaned = text;
    for (const [target, replacement] of Object.entries(ARABIC_REPLACEMENTS)) {
        const regex = new RegExp(target, 'g');
        cleaned = cleaned.replace(regex, replacement);
    }
    return cleaned;
};
