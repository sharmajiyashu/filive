import { PermissionModule } from '../../../interfaces';

export const allAdminPermissions: PermissionModule[] = [
  {
    moduleName: 'Dashboard',
    enabled: true,
    features: {
      'dashboard:view': { enabled: true, description: 'View dashboard metrics and analytics' },
      'dashboard:export': { enabled: true, description: 'Export dashboard reports' },
    },
  },
  {
    moduleName: 'User Management',
    enabled: true,
    features: {
      'users:view': { enabled: true, description: 'View all users list and profiles' },
      'users:create': { enabled: true, description: 'Create new users manually' },
      'users:edit': { enabled: true, description: 'Edit user details, coins, and levels' },
      'users:block': { enabled: true, description: 'Block or unblock users' },
      'users:delete': { enabled: true, description: 'Delete user accounts' },
    },
  },
  {
    moduleName: 'Verified Users',
    enabled: true,
    features: {
      'verifiedUsers:view': { enabled: true, description: 'View verified hosts and users' },
      'verifiedUsers:verify': { enabled: true, description: 'Verify or revoke user verification' },
    },
  },
  {
    moduleName: 'Video Verifications',
    enabled: true,
    features: {
      'videoVerifications:view': { enabled: true, description: 'View user video verification submissions' },
      'videoVerifications:approve': { enabled: true, description: 'Approve video verification' },
      'videoVerifications:reject': { enabled: true, description: 'Reject video verification' },
    },
  },
  {
    moduleName: 'Coin Trader',
    enabled: true,
    features: {
      'coinTrader:view': { enabled: true, description: 'View coin sellers and trader requests' },
      'coinTrader:manage': { enabled: true, description: 'Approve, assign coins, and manage coin sellers' },
    },
  },
  {
    moduleName: 'Profile Management',
    enabled: true,
    features: {
      'profileSettings:view': { enabled: true, description: 'View profile dropdown settings' },
      'profileSettings:edit': { enabled: true, description: 'Manage profile dropdown options' },
      'careers:view': { enabled: true, description: 'View careers list' },
      'careers:create': { enabled: true, description: 'Create career options' },
      'careers:edit': { enabled: true, description: 'Edit career options' },
      'careers:delete': { enabled: true, description: 'Delete career options' },
      'hobbies:view': { enabled: true, description: 'View hobbies list' },
      'hobbies:create': { enabled: true, description: 'Create new hobbies' },
      'hobbies:edit': { enabled: true, description: 'Edit existing hobbies' },
      'hobbies:delete': { enabled: true, description: 'Delete hobbies' },
    },
  },
  {
    moduleName: 'Support Chat',
    enabled: true,
    features: {
      'supportChat:view': { enabled: true, description: 'View customer support chats and tickets' },
      'supportChat:reply': { enabled: true, description: 'Send replies and attachments to users' },
      'supportChat:delete': { enabled: true, description: 'Delete support messages' },
    },
  },
  {
    moduleName: 'Reports Management',
    enabled: true,
    features: {
      'reports:view': { enabled: true, description: 'View reported users, posts, and rooms' },
      'reports:resolve': { enabled: true, description: 'Resolve or dismiss reports' },
      'reports:delete': { enabled: true, description: 'Delete reports' },
    },
  },
  {
    moduleName: 'Beans Management',
    enabled: true,
    features: {
      'beans:view': { enabled: true, description: 'View beans ledger, history, and earnings' },
      'beans:adjust': { enabled: true, description: 'Add or deduct beans from users' },
      'beans:export': { enabled: true, description: 'Export beans financial transactions' },
    },
  },
  {
    moduleName: 'Payout Management',
    enabled: true,
    features: {
      'payoutMethods:view': { enabled: true, description: 'View withdrawal and payout methods' },
      'payoutMethods:manage': { enabled: true, description: 'Create and update payout methods' },
      'payoutRequests:view': { enabled: true, description: 'View host payout and withdrawal requests' },
      'payoutRequests:approve': { enabled: true, description: 'Approve and process payouts' },
      'payoutRequests:reject': { enabled: true, description: 'Reject payout requests' },
    },
  },
  {
    moduleName: 'Stores Management',
    enabled: true,
    features: {
      'stores:view': { enabled: true, description: 'View store items (frames, entry effects, themes, rides)' },
      'stores:create': { enabled: true, description: 'Create new store item' },
      'stores:edit': { enabled: true, description: 'Edit store item price, SVGA, and validity' },
      'stores:delete': { enabled: true, description: 'Delete store item' },
    },
  },
  {
    moduleName: 'Gifts Management',
    enabled: true,
    features: {
      'gifts:view': { enabled: true, description: 'View virtual gifts catalog' },
      'gifts:create': { enabled: true, description: 'Upload and create new gifts with SVGA/audio' },
      'gifts:edit': { enabled: true, description: 'Edit gift coin cost, category, and animations' },
      'gifts:delete': { enabled: true, description: 'Delete virtual gifts' },
    },
  },
  {
    moduleName: 'Reactions Management',
    enabled: true,
    features: {
      'reactions:view': { enabled: true, description: 'View live stream floating reactions' },
      'reactions:create': { enabled: true, description: 'Add floating reactions' },
      'reactions:edit': { enabled: true, description: 'Edit reaction properties' },
      'reactions:delete': { enabled: true, description: 'Delete reactions' },
    },
  },
  {
    moduleName: 'Games Management',
    enabled: true,
    features: {
      'games:view': { enabled: true, description: 'View interactive live games' },
      'games:create': { enabled: true, description: 'Add new in-app games' },
      'games:edit': { enabled: true, description: 'Configure game URLs and rewards' },
      'games:delete': { enabled: true, description: 'Delete games' },
    },
  },
  {
    moduleName: 'Music Management',
    enabled: true,
    features: {
      'music:view': { enabled: true, description: 'View audio and music tracks' },
      'music:upload': { enabled: true, description: 'Upload audio tracks' },
      'music:edit': { enabled: true, description: 'Edit music info and singer' },
      'music:delete': { enabled: true, description: 'Delete music tracks' },
    },
  },
  {
    moduleName: 'Room Themes',
    enabled: true,
    features: {
      'roomThemes:view': { enabled: true, description: 'View audio and video room background themes' },
      'roomThemes:create': { enabled: true, description: 'Upload and add room themes' },
      'roomThemes:edit': { enabled: true, description: 'Edit room themes' },
      'roomThemes:delete': { enabled: true, description: 'Delete room themes' },
    },
  },
  {
    moduleName: 'Live Content',
    enabled: true,
    features: {
      'liveStreams:view': { enabled: true, description: 'Monitor ongoing video live streams' },
      'liveStreams:terminate': { enabled: true, description: 'Force stop or terminate improper live stream' },
      'audioRooms:view': { enabled: true, description: 'Monitor multi-mic audio party rooms' },
      'audioRooms:terminate': { enabled: true, description: 'Close audio party room' },
      'liveHistory:view': { enabled: true, description: 'View historical live streaming logs' },
      'liveBannedUsers:view': { enabled: true, description: 'View users banned from live streaming' },
      'liveBannedUsers:unban': { enabled: true, description: 'Unban users from going live' },
    },
  },
  {
    moduleName: 'Call Management',
    enabled: true,
    features: {
      'calls:view': { enabled: true, description: 'View 1-on-1 audio/video call logs' },
      'calls:manage': { enabled: true, description: 'Manage call settings and tariffs' },
    },
  },
  {
    moduleName: 'Rooms',
    enabled: true,
    features: {
      'rooms:view': { enabled: true, description: 'View audio/video rooms list' },
      'rooms:manage': { enabled: true, description: 'Manage room moderators and settings' },
    },
  },
  {
    moduleName: 'Families',
    enabled: true,
    features: {
      'families:view': { enabled: true, description: 'View creator families and clans' },
      'families:manage': { enabled: true, description: 'Verify and edit family details' },
      'families:delete': { enabled: true, description: 'Disband or delete families' },
    },
  },
  {
    moduleName: 'Levels',
    enabled: true,
    features: {
      'levels:view': { enabled: true, description: 'View user and host levels configuration' },
      'levels:edit': { enabled: true, description: 'Update coin thresholds, badges, and perks' },
    },
  },
  {
    moduleName: 'Stories',
    enabled: true,
    features: {
      'stories:view': { enabled: true, description: 'View user moments and stories' },
      'stories:block': { enabled: true, description: 'Block or hide inappropriate stories' },
      'stories:delete': { enabled: true, description: 'Delete stories permanently' },
    },
  },
  {
    moduleName: 'Hashtags Management',
    enabled: true,
    features: {
      'hashtags:view': { enabled: true, description: 'View dynamic hashtags and trending topics' },
      'hashtags:create': { enabled: true, description: 'Create dynamic hashtags' },
      'hashtags:edit': { enabled: true, description: 'Edit hashtags, orders, and trending flags' },
      'hashtags:delete': { enabled: true, description: 'Delete hashtags' },
    },
  },
  {
    moduleName: 'Announcements',
    enabled: true,
    features: {
      'announcements:view': { enabled: true, description: 'View official system announcements' },
      'announcements:create': { enabled: true, description: 'Broadcast push notifications and announcements' },
      'announcements:edit': { enabled: true, description: 'Edit announcements' },
      'announcements:delete': { enabled: true, description: 'Delete announcements' },
    },
  },
  {
    moduleName: 'Banner Management',
    enabled: true,
    features: {
      'banners:view': { enabled: true, description: 'View splash, home, gift, and game banners' },
      'banners:create': { enabled: true, description: 'Upload and publish banners' },
      'banners:edit': { enabled: true, description: 'Update banner links and routes' },
      'banners:delete': { enabled: true, description: 'Delete banners' },
    },
  },
  {
    moduleName: 'Agencies Management',
    enabled: true,
    features: {
      'agencies:view': { enabled: true, description: 'View agencies and host rosters' },
      'agencies:create': { enabled: true, description: 'Create or onboard agency' },
      'agencies:edit': { enabled: true, description: 'Edit agency commission slabs and details' },
      'agencies:delete': { enabled: true, description: 'Delete agency' },
    },
  },
  {
    moduleName: 'Help & Feedback',
    enabled: true,
    features: {
      'helpFeedback:view': { enabled: true, description: 'View user bug reports and inquiries' },
      'helpFeedback:reply': { enabled: true, description: 'Respond to user feedback' },
      'helpFeedback:delete': { enabled: true, description: 'Delete feedback' },
    },
  },
  {
    moduleName: 'Recharge & Coin Packages',
    enabled: true,
    features: {
      'plans:view': { enabled: true, description: 'View user, seller, and website recharge plans' },
      'plans:create': { enabled: true, description: 'Create new coin top-up plans' },
      'plans:edit': { enabled: true, description: 'Update coin prices and bonus coins' },
      'plans:delete': { enabled: true, description: 'Delete recharge plans' },
    },
  },
  {
    moduleName: 'VIP Plans',
    enabled: true,
    features: {
      'vipPlans:view': { enabled: true, description: 'View VIP subscription tiers' },
      'vipPlans:create': { enabled: true, description: 'Create VIP plans' },
      'vipPlans:edit': { enabled: true, description: 'Update VIP privileges and prices' },
      'vipPlans:delete': { enabled: true, description: 'Delete VIP plans' },
    },
  },
  {
    moduleName: 'Website Management',
    enabled: true,
    features: {
      'websiteSettings:view': { enabled: true, description: 'View website configuration, hero banners, and SEO' },
      'websiteSettings:manage': { enabled: true, description: 'Save website settings and access emails' },
      'teamApplications:view': { enabled: true, description: 'View creator and agency applications' },
      'teamApplications:review': { enabled: true, description: 'Approve or reject team applications' },
      'contactMessages:view': { enabled: true, description: 'View contact form messages' },
      'contactMessages:reply': { enabled: true, description: 'Reply to contact messages' },
      'contactMessages:delete': { enabled: true, description: 'Delete contact messages' },
    },
  },
  {
    moduleName: 'Roles & Permissions',
    enabled: true,
    features: {
      'adminRoles:view': { enabled: true, description: 'View staff roles and permissions' },
      'adminRoles:create': { enabled: true, description: 'Create new staff role with customized permissions' },
      'adminRoles:edit': { enabled: true, description: 'Edit role permissions and module access' },
      'adminRoles:delete': { enabled: true, description: 'Delete staff roles' },
    },
  },
  {
    moduleName: 'Admin Users & Staff',
    enabled: true,
    features: {
      'adminUsers:view': { enabled: true, description: 'View sub-admins and staff members' },
      'adminUsers:create': { enabled: true, description: 'Create sub-admin account with assigned role' },
      'adminUsers:edit': { enabled: true, description: 'Update staff account, change role, or reset password' },
      'adminUsers:delete': { enabled: true, description: 'Delete staff member account' },
    },
  },
  {
    moduleName: 'App Settings & Gateways',
    enabled: true,
    features: {
      'appSettings:view': { enabled: true, description: 'View system app settings and payment gateways' },
      'appSettings:edit': { enabled: true, description: 'Modify Agora keys, payment gateway credentials, and app constants' },
    },
  },
];
