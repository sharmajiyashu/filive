import { Request, Response, NextFunction } from 'express';
import { Language } from '../../constants/enum';

declare module 'express-serve-static-core' {
    interface Request {
        language: Language;
    }
}

export const languageMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Express normalizes headers to lowercase
    const acceptLanguage = req.headers['accept-language'];

    let language: Language = Language.English;

    if (acceptLanguage && typeof acceptLanguage === 'string') {
        const languages = acceptLanguage.split(',').map(lang => {
            const [code] = lang.trim().split(';');
            return code.toLowerCase();
        });

        const supportedLanguage = languages.find(lang => {
            const langCode = lang.split('-')[0];
            return Object.values(Language).includes(langCode as Language);
        });

        if (supportedLanguage) {
            const langCode = supportedLanguage.split('-')[0];
            // Map language codes to enum values
            if (langCode === 'en') {
                language = Language.English;
            }
            // Add more language mappings here when enum is extended
        }
    }

    req.language = language;

    res.setHeader('Content-Language', language);

    next();
};
