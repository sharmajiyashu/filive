import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import User from '../../../models/User';
import AdminRole from '../../../models/AdminRole';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const adminUserRouter = Router();

  // Mount at both /adminUser and /adminUsers
  router.use('/adminUser', adminUserRouter);
  router.use('/adminUsers', adminUserRouter);

  /**
   * Helper to format admin user for response
   */
  const formatAdminUser = (user: any) => {
    const roleObj = user.adminRoleId && typeof user.adminRoleId === 'object' ? user.adminRoleId : null;
    return {
      _id: user._id,
      id: user._id,
      userId: user.userId,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Staff Member',
      firstName: user.firstName || (user.name ? user.name.split(' ')[0] : ''),
      lastName: user.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : ''),
      email: user.email,
      mobile: user.mobile,
      phoneExt: user.phoneExt,
      userRole: user.userRole,
      adminRoleId: roleObj?._id || user.adminRoleId,
      roleId: roleObj?._id || user.adminRoleId,
      role: roleObj
        ? {
            id: roleObj._id,
            _id: roleObj._id,
            name: roleObj.name,
            description: roleObj.description,
          }
        : null,
      isActive: !user.isBlocked,
      status: user.isBlocked ? 'inactive' : 'active',
      profileImage: user.profileImage,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  };

  /**
   * @swagger
   * /admin/adminUser/get:
   *   post:
   *     summary: Get paginated list of sub-admin staff users
   *     tags: [Admin - Staff Users]
   */
  const getAdminUsersHandler = async (req: Request, res: Response) => {
    try {
      const page = parseInt((req.body.page || req.query.page || 1).toString(), 10);
      const limit = parseInt((req.body.limit || req.query.limit || 10).toString(), 10);
      const search = (req.body.search || req.body.email || req.body.firstName || req.query.search || '')
        .toString()
        .trim();
      const roleId = req.body.roleId || req.body.adminRoleId || req.query.roleId;

      const query: any = { userRole: 'admin' };

      if (roleId && roleId !== 'all') {
        query.adminRoleId = roleId;
      }

      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { mobile: new RegExp(search, 'i') },
        ];
      }

      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        User.find(query)
          .populate('adminRoleId')
          .populate('profileImage')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(query),
      ]);

      const formattedUsers = users.map(formatAdminUser);

      return ResponseWrapper.success(
        res,
        {
          users: formattedUsers,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
        'Admin users fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  adminUserRouter.post('/get', getAdminUsersHandler);
  adminUserRouter.get('/get', getAdminUsersHandler);
  adminUserRouter.get('/', getAdminUsersHandler);

  /**
   * @swagger
   * /admin/adminUser/create:
   *   post:
   *     summary: Create a new sub-admin staff account
   *     tags: [Admin - Staff Users]
   */
  const createAdminUserHandler = async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, name, email, mobile, phoneExt, password, roleId, adminRoleId, isActive } =
        req.body;

      if (!email || !email.trim()) {
        return ResponseWrapper.error(res, new Error('Email is required'), 400);
      }

      if (!password || password.length < 6) {
        return ResponseWrapper.error(res, new Error('Password of at least 6 characters is required'), 400);
      }

      const cleanedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: cleanedEmail });
      if (existing) {
        return ResponseWrapper.error(res, new Error(`User with email "${cleanedEmail}" already exists`), 400);
      }

      const targetRoleId = roleId || adminRoleId;
      if (targetRoleId) {
        const role = await AdminRole.findById(targetRoleId);
        if (!role) {
          return ResponseWrapper.error(res, new Error('Specified admin role was not found'), 404);
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const fullName = (name || `${firstName || ''} ${lastName || ''}`).trim() || cleanedEmail.split('@')[0];

      const user = await User.create({
        userRole: 'admin',
        name: fullName,
        email: cleanedEmail,
        mobile: mobile ? mobile.trim() : undefined,
        whatsapp: mobile ? mobile.trim() : undefined,
        password: hashedPassword,
        adminRoleId: targetRoleId || undefined,
        isBlocked: isActive === false,
      });

      const populatedUser = await User.findById(user._id).populate('adminRoleId').lean();

      return ResponseWrapper.success(res, formatAdminUser(populatedUser), 'Admin user created successfully', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  adminUserRouter.post('/create', createAdminUserHandler);
  adminUserRouter.post('/', createAdminUserHandler);

  /**
   * @swagger
   * /admin/adminUser/update:
   *   put:
   *     summary: Update an existing sub-admin staff account
   *     tags: [Admin - Staff Users]
   */
  const updateAdminUserHandler = async (req: Request, res: Response) => {
    try {
      const userId = req.params.id || req.body.id || req.body.userId || req.body._id;

      if (!userId) {
        return ResponseWrapper.error(res, new Error('User ID is required for update'), 400);
      }

      const user = await User.findById(userId);
      if (!user) {
        return ResponseWrapper.error(res, new Error('Admin user not found'), 404);
      }

      const { firstName, lastName, name, email, mobile, password, roleId, adminRoleId, isActive, status } =
        req.body;

      const updateData: any = {};

      if (email && email.trim()) {
        const cleanedEmail = email.trim().toLowerCase();
        if (cleanedEmail !== user.email?.toLowerCase()) {
          const duplicate = await User.findOne({ _id: { $ne: user._id }, email: cleanedEmail });
          if (duplicate) {
            return ResponseWrapper.error(res, new Error(`Email "${cleanedEmail}" is already taken`), 400);
          }
        }
        updateData.email = cleanedEmail;
      }

      if (name || firstName || lastName) {
        updateData.name = (name || `${firstName || ''} ${lastName || ''}`).trim();
      }

      if (mobile !== undefined) {
        updateData.mobile = mobile ? mobile.trim() : undefined;
      }

      if (password && password.trim().length >= 6) {
        updateData.password = await bcrypt.hash(password.trim(), 10);
      }

      const targetRoleId = roleId !== undefined ? roleId : adminRoleId;
      if (targetRoleId !== undefined) {
        if (targetRoleId && targetRoleId !== '') {
          const role = await AdminRole.findById(targetRoleId);
          if (!role) {
            return ResponseWrapper.error(res, new Error('Specified admin role was not found'), 404);
          }
          updateData.adminRoleId = targetRoleId;
        } else {
          updateData.adminRoleId = null;
        }
      }

      if (isActive !== undefined) {
        updateData.isBlocked = !isActive;
      } else if (status !== undefined) {
        updateData.isBlocked = status === 'inactive' || status === 'suspended';
      }

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true })
        .populate('adminRoleId')
        .lean();

      return ResponseWrapper.success(res, formatAdminUser(updatedUser), 'Admin user updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  adminUserRouter.put('/update', updateAdminUserHandler);
  adminUserRouter.put('/:id', updateAdminUserHandler);

  /**
   * @swagger
   * /admin/adminUser/delete/{id}:
   *   delete:
   *     summary: Delete a sub-admin staff user
   *     tags: [Admin - Staff Users]
   */
  const deleteAdminUserHandler = async (req: Request, res: Response) => {
    try {
      const userId = req.params.id || req.body.id || req.query.id;

      if (!userId) {
        return ResponseWrapper.error(res, new Error('User ID is required for deletion'), 400);
      }

      const currentAdminId = req.user?.id;
      if (String(currentAdminId) === String(userId)) {
        return ResponseWrapper.error(res, new Error('You cannot delete your own admin account'), 400);
      }

      const user = await User.findById(userId);
      if (!user) {
        return ResponseWrapper.error(res, new Error('User not found'), 404);
      }

      if (user.email === 'admin@example.com' || user.email === 'filive@gmail.com') {
        return ResponseWrapper.error(res, new Error('Primary system administrator accounts cannot be deleted'), 403);
      }

      await User.findByIdAndDelete(userId);
      return ResponseWrapper.success(res, { message: 'Admin user deleted successfully' }, 'Admin user deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  adminUserRouter.delete('/delete/:id', deleteAdminUserHandler);
  adminUserRouter.delete('/:id', deleteAdminUserHandler);
};
