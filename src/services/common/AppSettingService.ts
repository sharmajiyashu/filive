import { Service } from 'typedi';
import AppSetting from '../../models/AppSetting';

@Service()
export class AppSettingService {
  private defaultSettings = {
    coin_to_bean_rate: 1,
    bean_to_coin_rate_other: 0.95,
    min_coin_to_bean_transfer: 100,
    exchange_rate_base_beans: 10000,
    beans_per_usd: 10000,
    usd_to_inr_exchange_rate: 95.0,
    cashout_enabled: true,
    cashout_allowed_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    cashout_disabled_message: 'Beans cash out is currently closed. Please check the allowed withdrawal schedule.',
    cashout_fee_type: 'percentage',
    cashout_fee_value: 0,
    call_price_tiers: [
      { minLevel: 1, maxLevel: 7, audioPrice: 1200, videoPrice: 2500, label: 'Level 1–7' },
      { minLevel: 8, maxLevel: 15, audioPrice: 1500, videoPrice: 3000, label: 'Level 8–15' },
      { minLevel: 16, maxLevel: 25, audioPrice: 2000, videoPrice: 4000, label: 'Level 16–25' },
      { minLevel: 26, maxLevel: 35, audioPrice: 2500, videoPrice: 5000, label: 'Level 26–35' },
      { minLevel: 36, maxLevel: 42, audioPrice: 3000, videoPrice: 6500, label: 'Level 36–42' },
      { minLevel: 43, maxLevel: 45, audioPrice: 4000, videoPrice: 8000, label: 'Level 43–45' },
    ],
    marital_statuses: ['single', 'divorced', 'married', 'secret', 'inlove'],
    agency_global_commission_rate: 10,
    agency_use_commission_slabs: true,
    agency_auto_settlement_enabled: true,
    agency_settlement_day: 3,
    agency_data_enabled: true,
    host_application_enabled: true,
    agent_ranking_enabled: true,
    activity_center_enabled: true,
    agency_invite_enabled: true,
    e_day_min_hours: 1,
    call_platform_fee_percent: 10,
    gift_commission_percent: 20,
    invite_reward_coins: 2000,
    deep_link_base_url: 'https://filive.app/invite',
    home_banner_image_url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200',
    party_room_banner_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200',
    recharge_offer_banner_image_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200',
    home_banners: ['https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200'],
    party_room_banners: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200'],
    recharge_offer_banners: ['https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200'],
    default_album_image_url: '',
    // Role Tag Settings
    host_role_image: '',
    agency_role_image: '',
    coin_trader_role_image: '',
    bd_role_image: '',
    // About Us & Legal Settings
    about_us_title: 'About FiLive',
    about_us_content: 'Welcome to FiLive – your premier live streaming, voice party, and social entertainment platform. Connect with talented creators, make real-time friends, participate in thrilling live rooms, and share your memorable moments across the globe.',
    about_us_version: 'V_1.1.18.2025698',
    company_name: 'FiLive Entertainment Private Limited',
    official_website_url: 'https://filive-website.vercel.app',
    terms_conditions_url: 'https://filive.app/terms',
    privacy_policy_url: 'https://filive.app/privacy',
    contact_us_email: 'support@filive.app',
    contact_us_phone: '+91 98765 43210',
    contact_us_address: 'FiLive Global Tech Park, Bangalore, India',
    // Website & Enquiry Settings
    website_enquiry_email: 'filive@gmail.com',
    website_permission_emails: ['filive@gmail.com'],
    website_recharge_enabled: true,
    website_contact_notifications_enabled: true,
    // Connect With Us – Social Media Links
    social_facebook_url: '',
    social_instagram_url: '',
    social_youtube_url: '',
    social_twitter_url: '',
    social_telegram_url: '',
    social_whatsapp_url: '',
    social_tiktok_url: '',
    // Payment Gateway Settings (Cashfree)
    payment_gateway_cashfree_enabled: true,
    payment_gateway_cashfree_mode: process.env.CASHFREE_MODE || 'production',
    payment_gateway_cashfree_app_id: process.env.CASHFREE_APP_ID || '',
    payment_gateway_cashfree_secret_key: process.env.CASHFREE_SECRET_KEY || '',
    payment_gateway_cashfree_api_version: process.env.CASHFREE_API_VERSION || '2023-08-01',
    payment_gateway_cashfree_notify_url: 'https://filiva-node.creatamax.in/v1/api/app/coins/cashfree/callback',

    // Payment Gateway Settings (PandaPay)
    payment_gateway_pandapay_enabled: false,
    payment_gateway_pandapay_gateway_url: 'https://pandaxpay.sbs',
    payment_gateway_pandapay_merchant_id: 'm_6ae9d055c1172ea450cd1507',
    payment_gateway_pandapay_secret_key: 'sk_3235a3fe02192c28a4fb9c5bfdc75dd0bb9a26c2b02a16e4113038f9da5f7913',
    payment_gateway_pandapay_trade_type: 'upi',
    payment_gateway_pandapay_notify_url: 'https://filiva-node.creatamax.in/v1/api/app/coins/pandapay/callback',

    // Payment Gateway Settings (Razorpay)
    payment_gateway_razorpay_enabled: true,
    payment_gateway_razorpay_merchant_id: 'RKaMsbocngrNr4',
    payment_gateway_razorpay_key_id: 'rzp_live_TOLcZZUrGcgCad',
    payment_gateway_razorpay_key_secret: 'l2iC9Y61NpDsaec0FROTkqsr',

    // Social Auth & Login Settings (Google & Facebook)
    google_login_enabled: true,
    google_client_id: process.env.GOOGLE_CLIENT_ID || '',
    google_client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    google_android_client_id: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
    google_ios_client_id: process.env.GOOGLE_IOS_CLIENT_ID || '',

    facebook_login_enabled: true,
    facebook_app_id: process.env.FACEBOOK_APP_ID || '',
    facebook_app_secret: process.env.FACEBOOK_APP_SECRET || '',
    facebook_client_token: process.env.FACEBOOK_CLIENT_TOKEN || '',

    phone_login_enabled: true,
    email_login_enabled: true,

    // Auto Translation Settings
    google_translate_api_key: process.env.GOOGLE_TRANSLATE_API_KEY || '',
    auto_translate_chat_enabled: true,
  };

  async getSettings() {
    const settings = await AppSetting.find();
    const settingsMap = settings.reduce((acc: any, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Ensure defaults exist only when missing in database
    for (const [key, value] of Object.entries(this.defaultSettings)) {
      if (settingsMap[key] === undefined) {
        await AppSetting.create({ key, value });
        settingsMap[key] = value;
      }
    }

    return settingsMap;
  }

  async getSettingValue(key: string): Promise<any> {
    const setting = await AppSetting.findOne({ key });
    if (setting) return setting.value;

    const defaultValue = (this.defaultSettings as any)[key];
    if (defaultValue !== undefined) {
      await AppSetting.create({ key, value: defaultValue });
      return defaultValue;
    }
    return null;
  }

  async updateSetting(key: string, value: any) {
    return this.updateSettings({ [key]: value });
  }

  async updateSettings(settings: { [key: string]: any }) {
    for (const [key, value] of Object.entries(settings)) {
      await AppSetting.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, new: true }
      );
    }
    return this.getSettings();
  }
}
