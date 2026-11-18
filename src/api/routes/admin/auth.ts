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

            const isSuperAdmin =
                user.email === 'admin@example.com' ||
                user.email === 'filive@gmail.com' ||
                (user.adminRoleId as any)?.name === 'SUPER_ADMIN';

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

