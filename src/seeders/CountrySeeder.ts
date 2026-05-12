import Country from '../models/Country';
import AppLogger from '../api/loaders/logger';

export async function seedCountries() {
  try {
    const countries = [
      { name: 'Kenya', code: 'KE', flag: 'https://flagcdn.com/w160/ke.png', currencySymbol: 'KSh', currencyCode: 'KES', exchangeRate: 130 },
      { name: 'United Arab Emirates', code: 'AE', flag: 'https://flagcdn.com/w160/ae.png', currencySymbol: 'د.إ', currencyCode: 'AED', exchangeRate: 3.67 },
      { name: 'Italy', code: 'IT', flag: 'https://flagcdn.com/w160/it.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Togo', code: 'TG', flag: 'https://flagcdn.com/w160/tg.png', currencySymbol: 'CFA', currencyCode: 'XOF', exchangeRate: 600 },
      { name: 'Libya', code: 'LY', flag: 'https://flagcdn.com/w160/ly.png', currencySymbol: 'LD', currencyCode: 'LYD', exchangeRate: 4.8 },
      { name: 'South Africa', code: 'ZA', flag: 'https://flagcdn.com/w160/za.png', currencySymbol: 'R', currencyCode: 'ZAR', exchangeRate: 18.5 },
      { name: 'Ghana', code: 'GH', flag: 'https://flagcdn.com/w160/gh.png', currencySymbol: 'GH₵', currencyCode: 'GHS', exchangeRate: 13 },
      { name: 'Zambia', code: 'ZM', flag: 'https://flagcdn.com/w160/zm.png', currencySymbol: 'ZK', currencyCode: 'ZMW', exchangeRate: 25 },
      { name: 'Ethiopia', code: 'ET', flag: 'https://flagcdn.com/w160/et.png', currencySymbol: 'Br', currencyCode: 'ETB', exchangeRate: 56 },
      { name: 'Singapore', code: 'SG', flag: 'https://flagcdn.com/w160/sg.png', currencySymbol: '$', currencyCode: 'SGD', exchangeRate: 1.35 },
      { name: 'United Kingdom', code: 'GB', flag: 'https://flagcdn.com/w160/gb.png', currencySymbol: '£', currencyCode: 'GBP', exchangeRate: 0.79 },
      { name: 'Kuwait', code: 'KW', flag: 'https://flagcdn.com/w160/kw.png', currencySymbol: 'KD', currencyCode: 'KWD', exchangeRate: 0.31 },
      { name: 'Uganda', code: 'UG', flag: 'https://flagcdn.com/w160/ug.png', currencySymbol: 'USh', currencyCode: 'UGX', exchangeRate: 3800 },
      { name: 'Canada', code: 'CA', flag: 'https://flagcdn.com/w160/ca.png', currencySymbol: '$', currencyCode: 'CAD', exchangeRate: 1.36 },
      { name: 'France', code: 'FR', flag: 'https://flagcdn.com/w160/fr.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Netherlands', code: 'NL', flag: 'https://flagcdn.com/w160/nl.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Australia', code: 'AU', flag: 'https://flagcdn.com/w160/au.png', currencySymbol: '$', currencyCode: 'AUD', exchangeRate: 1.52 },
      { name: 'Egypt', code: 'EG', flag: 'https://flagcdn.com/w160/eg.png', currencySymbol: 'E£', currencyCode: 'EGP', exchangeRate: 47 },
      { name: 'Qatar', code: 'QA', flag: 'https://flagcdn.com/w160/qa.png', currencySymbol: 'QR', currencyCode: 'QAR', exchangeRate: 3.64 },
      { name: 'Russia', code: 'RU', flag: 'https://flagcdn.com/w160/ru.png', currencySymbol: '₽', currencyCode: 'RUB', exchangeRate: 92 },
      { name: 'Germany', code: 'DE', flag: 'https://flagcdn.com/w160/de.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Greece', code: 'GR', flag: 'https://flagcdn.com/w160/gr.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Burma', code: 'MM', flag: 'https://flagcdn.com/w160/mm.png', currencySymbol: 'K', currencyCode: 'MMK', exchangeRate: 2100 },
      { name: 'Benin', code: 'BJ', flag: 'https://flagcdn.com/w160/bj.png', currencySymbol: 'CFA', currencyCode: 'XOF', exchangeRate: 600 },
      { name: 'Spain', code: 'ES', flag: 'https://flagcdn.com/w160/es.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Uzbekistan', code: 'UZ', flag: 'https://flagcdn.com/w160/uz.png', currencySymbol: "so'm", currencyCode: 'UZS', exchangeRate: 12500 },
      { name: 'Andorra', code: 'AD', flag: 'https://flagcdn.com/w160/ad.png', currencySymbol: '€', currencyCode: 'EUR', exchangeRate: 0.92 },
      { name: 'Argentina', code: 'AR', flag: 'https://flagcdn.com/w160/ar.png', currencySymbol: '$', currencyCode: 'ARS', exchangeRate: 880 },
      { name: 'Sri Lanka', code: 'LK', flag: 'https://flagcdn.com/w160/lk.png', currencySymbol: 'Rs', currencyCode: 'LKR', exchangeRate: 300 },
      { name: 'Senegal', code: 'SN', flag: 'https://flagcdn.com/w160/sn.png', currencySymbol: 'CFA', currencyCode: 'XOF', exchangeRate: 600 },
      { name: 'Korea', code: 'KR', flag: 'https://flagcdn.com/w160/kr.png', currencySymbol: '₩', currencyCode: 'KRW', exchangeRate: 1350 },
      { name: 'Afghanistan', code: 'AF', flag: 'https://flagcdn.com/w160/af.png', currencySymbol: 'Af', currencyCode: 'AFN', exchangeRate: 72 },
      { name: 'Oman', code: 'OM', flag: 'https://flagcdn.com/w160/om.png', currencySymbol: 'RO', currencyCode: 'OMR', exchangeRate: 0.38 },
      { name: 'Brazil', code: 'BR', flag: 'https://flagcdn.com/w160/br.png', currencySymbol: 'R$', currencyCode: 'BRL', exchangeRate: 5.15 },
      { name: 'India', code: 'IN', flag: 'https://flagcdn.com/w160/in.png', currencySymbol: '₹', currencyCode: 'INR', exchangeRate: 83.5 },
      { name: 'Pakistan', code: 'PK', flag: 'https://flagcdn.com/w160/pk.png', currencySymbol: 'Rs', currencyCode: 'PKR', exchangeRate: 278 },
      { name: 'Nepal', code: 'NP', flag: 'https://flagcdn.com/w160/np.png', currencySymbol: 'Rs', currencyCode: 'NPR', exchangeRate: 133 },
      { name: 'Bangladesh', code: 'BD', flag: 'https://flagcdn.com/w160/bd.png', currencySymbol: '৳', currencyCode: 'BDT', exchangeRate: 110 },
      { name: 'United States', code: 'US', flag: 'https://flagcdn.com/w160/us.png', currencySymbol: '$', currencyCode: 'USD', exchangeRate: 1 },
      { name: 'China', code: 'CN', flag: 'https://flagcdn.com/w160/cn.png', currencySymbol: '¥', currencyCode: 'CNY', exchangeRate: 7.24 },
      { name: 'Japan', code: 'JP', flag: 'https://flagcdn.com/w160/jp.png', currencySymbol: '¥', currencyCode: 'JPY', exchangeRate: 155 },
      { name: 'Saudi Arabia', code: 'SA', flag: 'https://flagcdn.com/w160/sa.png', currencySymbol: 'SR', currencyCode: 'SAR', exchangeRate: 3.75 },
    ];

    for (const country of countries) {
      await Country.findOneAndUpdate(
        { code: country.code },
        country,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Countries with currencies and exchange rates seeded successfully');
  } catch (error) {
    AppLogger.error('❌ Error seeding countries:', error);
  }
}
