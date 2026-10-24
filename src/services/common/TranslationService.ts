import { Service, Container } from 'typedi';
import axios from 'axios';
import { AppSettingService } from './AppSettingService';

export interface ITranslationResult {
  translatedText: string;
  sourceLang: string;
}

@Service()
export class TranslationService {
  private appSettingService: AppSettingService;

  constructor() {
    this.appSettingService = Container.get(AppSettingService);
  }

  /**
   * Automatically translate message text to English if needed.
   * Skips:
   * - Empty or non-string input
   * - System / structured message tags: [GIFT:...], [PARTY:...], etc.
   * - URLs
   * - Pure numbers, pure emojis, or pure symbols
   * - Messages already written in English
   */
  async translateToEnglish(rawText?: string): Promise<ITranslationResult | null> {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();
    if (!text) return null;

    // Skip special tags or URLs
    if (/^\[(GIFT|PARTY|LIVE|CALL|VIP|CUSTOM):/i.test(text)) return null;
    if (/^(https?:\/\/|www\.)/i.test(text)) return null;

    // Check if there are any readable word/alphabetic characters (across any script: Latin, Devanagari, Arabic, Han, Cyrillic, etc.)
    const hasLetters = /\p{L}/u.test(text);
    if (!hasLetters) return null;

    try {
      const settings = await this.appSettingService.getSettings();
      if (settings?.auto_translate_chat_enabled === false) {
        return null;
      }

      const apiKey = settings?.google_translate_api_key || process.env.GOOGLE_TRANSLATE_API_KEY || '';

      // 1. If official Google Cloud Translation API key is configured, use official API
      if (apiKey && apiKey.trim().length > 0) {
        try {
          const officialRes = await axios.post(
            `https://translation.googleapis.com/language/translate/v2?key=${apiKey.trim()}`,
            {
              q: text,
              target: 'en',
              format: 'text',
            },
            { timeout: 3500 }
          );

          const translationData = officialRes.data?.data?.translations?.[0];
          if (translationData) {
            const detectedLang = (translationData.detectedSourceLanguage || '').toLowerCase();
            const translatedText = (translationData.translatedText || '').trim();

            // If source was already English or translation is identical, return null
            if (detectedLang === 'en' || !translatedText || translatedText.toLowerCase() === text.toLowerCase()) {
              return null;
            }

            return {
              translatedText,
              sourceLang: detectedLang || 'auto',
            };
          }
        } catch (apiErr: any) {
          console.warn('[TranslationService] Official Google API warning, using fallback:', apiErr?.message);
        }
      }

      // 2. High-performance fallback: Google Translate endpoint (timeout: 3500ms)
      const fallbackUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      const res = await axios.get(fallbackUrl, {
        timeout: 3500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (res.status === 200 && Array.isArray(res.data)) {
        const segments = res.data[0];
        let detectedLang = '';
        if (typeof res.data[2] === 'string') {
          detectedLang = res.data[2].toLowerCase();
        } else if (typeof res.data[1] === 'string') {
          detectedLang = res.data[1].toLowerCase();
        }

        if (Array.isArray(segments) && segments.length > 0) {
          let translatedText = '';
          for (const item of segments) {
            if (Array.isArray(item) && item[0]) {
              translatedText += item[0];
            }
          }
          translatedText = translatedText.trim();

          // If detected source was English or no meaningful difference, skip saving translation
          if (detectedLang === 'en' || !translatedText || translatedText.toLowerCase() === text.toLowerCase()) {
            return null;
          }

          return {
            translatedText,
            sourceLang: detectedLang || 'auto',
          };
        }
      }
    } catch (err: any) {
      console.warn('[TranslationService] Translation warning (skipping translation for message):', err?.message);
    }

    return null;
  }
}
