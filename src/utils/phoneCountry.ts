import mongoose from 'mongoose';
import Country from '../models/Country';

/** E.164 dial code → ISO 3166-1 alpha-2. First match wins for shared codes (e.g. +1 → US). */
const DIAL_TO_ISO: Record<string, string> = {
  '1': 'US',
  '7': 'RU',
  '20': 'EG',
  '27': 'ZA',
  '30': 'GR',
  '31': 'NL',
  '32': 'BE',
  '33': 'FR',
  '34': 'ES',
  '36': 'HU',
  '39': 'IT',
  '40': 'RO',
  '41': 'CH',
  '43': 'AT',
  '44': 'GB',
  '45': 'DK',
  '46': 'SE',
  '47': 'NO',
  '48': 'PL',
  '49': 'DE',
  '51': 'PE',
  '52': 'MX',
  '53': 'CU',
  '54': 'AR',
  '55': 'BR',
  '56': 'CL',
  '57': 'CO',
  '58': 'VE',
  '60': 'MY',
  '61': 'AU',
  '62': 'ID',
  '63': 'PH',
  '64': 'NZ',
  '65': 'SG',
  '66': 'TH',
  '81': 'JP',
  '82': 'KR',
  '84': 'VN',
  '86': 'CN',
  '90': 'TR',
  '91': 'IN',
  '92': 'PK',
  '93': 'AF',
  '94': 'LK',
  '95': 'MM',
  '98': 'IR',
  '212': 'MA',
  '213': 'DZ',
  '216': 'TN',
  '218': 'LY',
  '220': 'GM',
  '221': 'SN',
  '233': 'GH',
  '234': 'NG',
  '254': 'KE',
  '255': 'TZ',
  '256': 'UG',
  '351': 'PT',
  '352': 'LU',
  '353': 'IE',
  '354': 'IS',
  '358': 'FI',
  '359': 'BG',
  '370': 'LT',
  '371': 'LV',
  '372': 'EE',
  '380': 'UA',
  '381': 'RS',
  '385': 'HR',
  '386': 'SI',
  '420': 'CZ',
  '421': 'SK',
  '852': 'HK',
  '853': 'MO',
  '855': 'KH',
  '856': 'LA',
  '880': 'BD',
  '886': 'TW',
  '960': 'MV',
  '961': 'LB',
  '962': 'JO',
  '963': 'SY',
  '964': 'IQ',
  '965': 'KW',
  '966': 'SA',
  '967': 'YE',
  '968': 'OM',
  '970': 'PS',
  '971': 'AE',
  '972': 'IL',
  '973': 'BH',
  '974': 'QA',
  '975': 'BT',
  '976': 'MN',
  '977': 'NP',
  '992': 'TJ',
  '993': 'TM',
  '994': 'AZ',
  '995': 'GE',
  '996': 'KG',
  '998': 'UZ',
};

export function isoFromDialCode(extension?: string | null): string | null {
  if (!extension) return null;
  const digits = String(extension).replace(/\D/g, '');
  if (!digits) return null;
  for (let len = Math.min(4, digits.length); len >= 1; len--) {
    const iso = DIAL_TO_ISO[digits.slice(0, len)];
    if (iso) return iso;
  }
  return null;
}

export function countryCodeFromIpHeaders(headers?: Record<string, any> | null): string | null {
  if (!headers) return null;
  const raw =
    headers['cf-ipcountry'] ||
    headers['x-vercel-ip-country'] ||
    headers['x-country-code'] ||
    headers['x-appengine-country'];
  if (!raw) return null;
  const code = String(Array.isArray(raw) ? raw[0] : raw).trim().toUpperCase();
  if (!code || code === 'XX' || code === 'T1') return null;
  return code;
}

export async function resolveCountryFromSignals(signals: {
  countryId?: string | null;
  countryCode?: string | null;
  extension?: string | null;
  ipCountry?: string | null;
}): Promise<{ countryId?: mongoose.Types.ObjectId; country?: string } | null> {
  if (signals.countryId && mongoose.Types.ObjectId.isValid(signals.countryId)) {
    const byId = await Country.findById(signals.countryId);
    if (byId) {
      return { countryId: byId._id as mongoose.Types.ObjectId, country: byId.code };
    }
  }

  const codes = [
    signals.countryCode,
    isoFromDialCode(signals.extension),
    signals.ipCountry,
  ]
    .map((c) => (c ? String(c).trim().toUpperCase() : ''))
    .filter(Boolean);

  for (const code of codes) {
    const byCode = await Country.findOne({
      $or: [
        { code: { $regex: new RegExp(`^${code}$`, 'i') } },
        { name: { $regex: new RegExp(`^${code}$`, 'i') } },
      ],
      isActive: { $ne: false },
    });
    if (byCode) {
      return { countryId: byCode._id as mongoose.Types.ObjectId, country: byCode.code };
    }
  }

  return null;
}
