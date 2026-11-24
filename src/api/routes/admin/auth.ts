import { Router, Request, Response } from 'express';
import Container from "typedi";
import { AuthenticationService } from "../../../services/common/AuthenticationService";
import { ResponseWrapper } from '../../responseWrapper';
import { validate } from '../../validators';
import { adminLoginSchema } from '../../validators/auth';

export default (router: Router) => {
    const authService = Container.get(AuthenticationService);

    /**
     * @swagger
     * /admin/login:
     *   post:
     *     summary: Admin login
     *     tags: [Admin Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *               - password
     *             properties:
     *               email:
     *                 type: string
     *               password:
     *                 type: string
     *     responses:
     *       200:
     *         description: Admin logged in successfully
     */
    router.post('/login', validate(adminLoginSchema), async (req: Request, res: Response) => {
        try {
            const { email, password } = req.body;
            const result = await authService.adminLogin(email, password);
            return ResponseWrapper.success(res, result, 'Admin logged in successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error.message);
        }
    });

    /**
     * @swagger
     * /admin/me:
     *   get:
     *     summary: Get current authenticated admin profile, role, and permissions
     *     tags: [Admin Auth]
     *     security:
     *       - bearerAuth: []
     */
    const getAdminMeHandler = async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return ResponseWrapper.error(res, new Error('Authentication required'), 401);
            }

            const User = (await import('../../../models/User')).default;
            const user = await User.findById(userId)
                .populate('profileImage')
                .populate('adminRoleId')
                .lean();

            if (!user) {
                return ResponseWrapper.error(res, new Error('User not found'), 404);
            }

            const isDeactivated = user.isBlocked === true || (user as any).isActive === false || (user as any).status === 'inactive' || (user as any).status === 'disabled' || (user as any).status === 'suspended';
            if (isDeactivated) {
                return ResponseWrapper.error(res, new Error('ACCOUNT_DISABLED: Your staff account has been deactivated or disabled'), 401);
            }

            const callerEmail = (user.email || '').trim().toLowerCase();
            const roleName = ((user.adminRoleId as any)?.name || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
            const isRoleSuperAdmin = (user.adminRoleId as any)?.isSuperAdmin === true || roleName === 'SUPERADMIN';
            const isMasterSuperAdmin = callerEmail === 'admin@example.com' || callerEmail === 'filive@gmail.com';
            const isSuperAdmin = isMasterSuperAdmin || isRoleSuperAdmin;

            const roleObj = user.adminRoleId && typeof user.adminRoleId === 'object' ? user.adminRoleId : null;

            const uAny = user as any;
            const firstName = uAny.firstName || (user.name ? user.name.split(' ')[0] : '');
            const lastName = uAny.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : '');

            const result = {
                id: user._id,
                _id: user._id,
                name: user.name || `${firstName} ${lastName}`.trim() || 'Admin User',
                firstName,
                lastName,
                email: user.email,
                mobile: user.mobile,
                userRole: user.userRole,
                isSuperAdmin,
                adminRole: roleObj
                    ? {
                        _id: (roleObj as any)._id,
                        id: (roleObj as any)._id,
                        name: (roleObj as any).name,
                        description: (roleObj as any).description,
                        permissions: (roleObj as any).permissions || [],
                        isActive: (roleObj as any).isActive !== false,
                    }
                    : null,
                permissions: (roleObj as any)?.permissions || [],
                isActive: !isDeactivated,
                status: isDeactivated ? 'inactive' : 'active',
            };

            return ResponseWrapper.success(res, result, 'Current admin profile fetched successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error.message);
        }
    };

    router.get('/me', getAdminMeHandler);
    router.get('/auth/me', getAdminMeHandler);

    /**
     * @swagger
     * /admin/profile:
     *   put:
     *     summary: Update authenticated admin profile (name, mobile, phoneExt)
     *     tags: [Admin Auth]
     *     security:
     *       - bearerAuth: []
     */
    const updateAdminProfileHandler = async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return ResponseWrapper.error(res, new Error('Authentication required'), 401);
            }

            const User = (await import('../../../models/User')).default;
            const user = await User.findById(userId);
            if (!user) {
                return ResponseWrapper.error(res, new Error('User not found'), 404);
            }

            const { firstName, lastName, name, mobile, phoneExt } = req.body;

            if (name !== undefined || firstName !== undefined || lastName !== undefined) {
                user.name = (name || `${firstName || ''} ${lastName || ''}`).trim();
                if (firstName !== undefined) user.firstName = firstName.trim();
                if (lastName !== undefined) user.lastName = lastName.trim();
            }

            if (mobile !== undefined) {
                user.mobile = mobile ? mobile.trim() : undefined;
                user.whatsapp = mobile ? mobile.trim() : undefined;
            }

            if (phoneExt !== undefined) {
                user.phoneExt = phoneExt ? phoneExt.trim() : undefined;
            }

            await user.save();

            const updated = await User.findById(userId)
                .populate('profileImage')
                .populate('adminRoleId')
                .lean();

            if (!updated) {
                return ResponseWrapper.error(res, new Error('User not found'), 404);
            }

            const isDeactivated = updated.isBlocked === true || (updated as any).isActive === false || (updated as any).status === 'inactive' || (updated as any).status === 'disabled' || (updated as any).status === 'suspended';
            const isSuperAdmin =
                updated.email === 'admin@example.com' ||
                updated.email === 'filive@gmail.com' ||
                (updated.adminRoleId as any)?.name === 'SUPER_ADMIN';

            const roleObj = updated.adminRoleId && typeof updated.adminRoleId === 'object' ? updated.adminRoleId : null;
            const uAny = updated as any;
            const resFirstName = uAny.firstName || (updated.name ? updated.name.split(' ')[0] : '');
            const resLastName = uAny.lastName || (updated.name ? updated.name.split(' ').slice(1).join(' ') : '');

            const result = {
                id: updated._id,
                _id: updated._id,
                name: updated.name || `${resFirstName} ${resLastName}`.trim() || 'Admin User',
                firstName: resFirstName,
                lastName: resLastName,
                email: updated.email,
                mobile: updated.mobile,
                phoneExt: updated.phoneExt,
                userRole: updated.userRole,
                isSuperAdmin,
                adminRole: roleObj
                    ? {
                        _id: (roleObj as any)._id,
                        id: (roleObj as any)._id,
                        name: (roleObj as any).name,
                        description: (roleObj as any).description,
                        permissions: (roleObj as any).permissions || [],
                        isActive: (roleObj as any).isActive !== false,
                    }
                    : null,
                permissions: (roleObj as any)?.permissions || [],
                isActive: !isDeactivated,
                status: isDeactivated ? 'inactive' : 'active',
            };

            return ResponseWrapper.success(res, result, 'Profile updated successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error.message);
        }
    };

    router.put('/profile', updateAdminProfileHandler);
    router.put('/auth/profile', updateAdminProfileHandler);

    /**
     * @swagger
     * /admin/change-password:
     *   put:
     *     summary: Change authenticated admin password
     *     tags: [Admin Auth]
     *     security:
     *       - bearerAuth: []
     */
    const changeAdminPasswordHandler = async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return ResponseWrapper.error(res, new Error('Authentication required'), 401);
            }

            const { currentPassword, newPassword, confirmPassword } = req.body;

            if (!currentPassword) {
                return ResponseWrapper.error(res, new Error('Current password is required'), 400);
            }

            if (!newPassword || newPassword.length < 6) {
                return ResponseWrapper.error(res, new Error('New password must be at least 6 characters'), 400);
            }

            if (confirmPassword && confirmPassword !== newPassword) {
                return ResponseWrapper.error(res, new Error('Password confirmation does not match'), 400);
            }

            const User = (await import('../../../models/User')).default;
            const user = await User.findById(userId);
            if (!user || !user.password) {
                return ResponseWrapper.error(res, new Error('Admin user account or password not found'), 404);
            }

            const bcrypt = (await import('bcrypt')).default;
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return ResponseWrapper.error(res, new Error('Current password is incorrect'), 400);
            }

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();

            return ResponseWrapper.success(res, { message: 'Password changed successfully' }, 'Password changed successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error.message);
        }
    };

    router.put('/change-password', changeAdminPasswordHandler);
    router.put('/auth/change-password', changeAdminPasswordHandler);

    /**
     * @swagger
     * /admin/logout:
     *   post:
     *     summary: Admin logout
     *     tags: [Admin Auth]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Admin logged out successfully
     */
    router.post('/logout', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (userId) {
                await authService.logout(userId);
            }
            return ResponseWrapper.success(res, null, 'Admin logged out successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error.message);
        }
    });
}

