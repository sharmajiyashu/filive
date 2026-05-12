import Language from '../models/Language';
import AppLogger from '../api/loaders/logger';

export async function seedLanguages() {
  try {
    const languages = [
      { name: 'Hindi', nativeName: 'हिन्दी', code: 'hi' },
      { name: 'English', nativeName: 'English', code: 'en' },
      { name: 'Arabic', nativeName: 'العربية', code: 'ar' },
      { name: 'Bengali', nativeName: 'বাংলা', code: 'bn' },
      { name: 'Spanish', nativeName: 'Español', code: 'es' },
      { name: 'French', nativeName: 'Français', code: 'fr' },
      { name: 'German', nativeName: 'Deutsch', code: 'de' },
      { name: 'Russian', nativeName: 'Русский', code: 'ru' },
      { name: 'Chinese', nativeName: '中文', code: 'zh' },
      { name: 'Japanese', nativeName: '日本語', code: 'ja' },
      { name: 'Korean', nativeName: '한국어', code: 'ko' },
      { name: 'Portuguese', nativeName: 'Português', code: 'pt' },
      { name: 'Italian', nativeName: 'Italiano', code: 'it' },
      { name: 'Turkish', nativeName: 'Türkçe', code: 'tr' },
      { name: 'Urdu', nativeName: 'اردو', code: 'ur' },
      { name: 'Tamil', nativeName: 'தமிழ்', code: 'ta' },
      { name: 'Telugu', nativeName: 'తెలుగు', code: 'te' },
      { name: 'Marathi', nativeName: 'मराठी', code: 'mr' },
      { name: 'Gujarati', nativeName: 'ગુજરાતી', code: 'gu' },
      { name: 'Malayalam', nativeName: 'മലയാളം', code: 'ml' },
      { name: 'Kannada', nativeName: 'ಕನ್ನಡ', code: 'kn' },
      { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', code: 'pa' },
      { name: 'Thai', nativeName: 'ไทย', code: 'th' },
      { name: 'Vietnamese', nativeName: 'Tiếng Việt', code: 'vi' },
      { name: 'Indonesian', nativeName: 'Bahasa Indonesia', code: 'id' },
    ];

    for (const lang of languages) {
      await Language.findOneAndUpdate(
        { code: lang.code },
        lang,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Languages seeded successfully');
  } catch (error) {
    AppLogger.error('❌ Error seeding languages:', error);
  }
}
