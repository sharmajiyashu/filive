const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
  const { allAdminPermissions } = require('../dist/api/permission/admin/adminPermissions');
  
  const fullPermissions = allAdminPermissions.map(m => ({
    moduleName: m.moduleName,
    enabled: true,
    features: Object.keys(m.features || {}).reduce((acc, k) => {
      acc[k] = { enabled: true, description: m.features[k].description };
      return acc;
    }, {})
  }));

  const updateOp = {};
  updateOp['$set'] = {
    permissions: fullPermissions,
    isActive: true,
    updatedAt: new Date()
  };

  const res = await mongoose.connection.collection('adminroles').updateOne(
    { name: 'SUPER_ADMIN' },
    updateOp
  );
  console.log('SUPER_ADMIN permissions populated. Matched:', res.matchedCount, 'Modified:', res.modifiedCount);

  // Also check if admin@example.com or other admins need adminRoleId assigned
  const superAdminRole = await mongoose.connection.collection('adminroles').findOne({ name: 'SUPER_ADMIN' });
  if (superAdminRole) {
    const adminUpdate = {};
    adminUpdate['$set'] = {
      adminRoleId: superAdminRole._id,
      isActive: true,
      isBlocked: false,
      status: 'active'
    };
    const userRes = await mongoose.connection.collection('users').updateMany(
      { userRole: 'admin', adminRoleId: { '$exists': false } },
      adminUpdate
    );
    console.log('Unassigned admin users updated with SUPER_ADMIN role:', userRes.modifiedCount);

    // Also update filive@gmail.com, support@filive.com, admin@example.com
    await mongoose.connection.collection('users').updateMany(
      { email: { '$in': ['filive@gmail.com', 'admin@example.com', 'support@filive.com', 'system@filive.com'] } },
      adminUpdate
    );
    console.log('Core admin users verified and linked to SUPER_ADMIN role.');
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
