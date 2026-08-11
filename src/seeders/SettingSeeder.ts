import AppSetting from '../models/AppSetting';
import AppLogger from '../api/loaders/logger';

export async function seedSettings() {
  try {
    const settings = [
      { key: 'family_creation_charge', value: 3000, description: 'Cost to create a family in coins' },
      { key: 'app_name', value: 'Filive', description: 'Application name' },
      {
        key: 'marital_statuses',
        value: ['single', 'divorced', 'married', 'secret', 'inlove'],
        description: 'List of available marital statuses'
      },
      {
        key: 'feedback_types',
        value: ['bug_report', 'feature_request', 'billing_issue', 'general_inquiry'],
        description: 'List of available help & feedback types'
      },
      {
        key: 'home_banner_image_url',
        value: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200',
        description: 'Home screen banner URL'
      },
      {
        key: 'party_room_banner_image_url',
        value: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200',
        description: 'Party room banner URL'
      },
      {
        key: 'recharge_offer_banner_image_url',
        value: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200',
        description: 'Recharge offer banner URL'
      },
      {
        key: 'home_banners',
        value: ['https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200'],
        description: 'List of home banners'
      },
      {
        key: 'party_room_banners',
        value: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200'],
        description: 'List of party room banners'
      },
      {
        key: 'recharge_offer_banners',
        value: ['https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200'],
        description: 'List of recharge offer banners'
      },
      {
        key: 'invite_reward_coins',
        value: 2000,
        description: 'Reward in coins for each user invited/referred'
      },
      {
        key: 'deep_link_base_url',
        value: 'https://filive.app/invite',
        description: 'Base URL for invitation deep links'
      },

      // PandaPay Gateway Seed
      { key: 'payment_gateway_pandapay_enabled', value: true, description: 'PandaPay gateway toggle status' },
      { key: 'payment_gateway_pandapay_gateway_url', value: 'https://pandaxpay.sbs', description: 'PandaPay gateway base URL' },
      { key: 'payment_gateway_pandapay_merchant_id', value: 'm_6ae9d055c1172ea450cd1507', description: 'PandaPay Merchant ID' },
      { key: 'payment_gateway_pandapay_secret_key', value: 'sk_3235a3fe02192c28a4fb9c5bfdc75dd0bb9a26c2b02a16e4113038f9da5f7913', description: 'PandaPay Pay-in Secret Key' },
      { key: 'payment_gateway_pandapay_trade_type', value: 'upi', description: 'PandaPay Trade Type' },
      { key: 'payment_gateway_pandapay_notify_url', value: 'https://filiva-node.creatamax.in/v1/api/app/coins/pandapay/callback', description: 'PandaPay Webhook Notification Callback URL' },

      // Razorpay Gateway Seed
      { key: 'payment_gateway_razorpay_enabled', value: true, description: 'Razorpay gateway toggle status' },
      { key: 'payment_gateway_razorpay_merchant_id', value: 'RKaMsbocngrNr4', description: 'Razorpay Merchant ID' },
      { key: 'payment_gateway_razorpay_key_id', value: 'rzp_live_TOLcZZUrGcgCad', description: 'Razorpay Live Key ID' },
      { key: 'payment_gateway_razorpay_key_secret', value: 'l2iC9Y61NpDsaec0FROTkqsr', description: 'Razorpay Live Secret Key' },
    ];

    for (const setting of settings) {
      await AppSetting.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ App settings seeded');
  } catch (error) {
    AppLogger.error('❌ Error seeding app settings:', error);
  }
}
