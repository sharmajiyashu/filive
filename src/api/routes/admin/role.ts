import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import AdminRole from '../../../models/AdminRole';
import User from '../../../models/User';
import { allAdminPermissions } from '../../permission/admin/adminPermissions';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const roleRouter = Router();

  // Mount at both /role and /roles for frontend service compatibility
  router.use('/role', roleRouter);
  router.use('/roles', roleRouter);

  /**
   * @swagger
   * /admin/role/permissions:
   *   get:
   *     summary: Get all system permission modules and features
   *     tags: [Admin - Roles]
   */
  const getPermissionsHandler = async (_req: Request, res: Response) => {
    try {
      return ResponseWrapper.success(res, allAdminPermissions, 'Permissions fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  roleRouter.get('/permissions', getPermissionsHandler);

  /**
   * @swagger
   * /admin/role/get:
   *   get:
   *     summary: Get paginated list of admin roles with assigned user counts
   *     tags: [Admin - Roles]
   */
  const getRolesHandler = async (req: Request, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page.toString(), 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 50;
      const search = req.query.search?.toString().trim();
      const status = req.query.status?.toString();

      const query: any = {};
      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }

      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') },
        ];
      }

      const skip = (page - 1) * limit;

      const [rolesData, total] = await Promise.all([
        AdminRole.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AdminRole.countDocuments(query),
      ]);

      // Calculate user counts for each role
      const roleIds = rolesData.map((r: any) => r._id);
      const userCountAggregation = await User.aggregate([
        {
          $match: {
            userRole: 'admin',
            adminRoleId: { $in: roleIds },
          },
        },
        {
          $group: {
            _id: '$adminRoleId',
            count: { $sum: 1 },
          },
        },
      ]);

      const countMap = new Map<string, number>();
      userCountAggregation.forEach((item: any) => {
        countMap.set(String(item._id), item.count);
      });

      const roles = rolesData.map((role: any) => ({
        ...role,
        id: role._id,
        userCount: countMap.get(String(role._id)) || 0,
      }));

      return ResponseWrapper.success(
        res,
        {
          roles,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
        'Roles fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  roleRouter.get('/get', getRolesHandler);
  roleRouter.get('/', getRolesHandler);

  /**
   * @swagger
   * /admin/role/create:
   *   post:
   *     summary: Create a new admin role
   *     tags: [Admin - Roles]
   */
  const createRoleHandler = async (req: Request, res: Response) => {
    try {
      const { name, description, permissions, isActive } = req.body;

      if (!name || !name.trim()) {
        return ResponseWrapper.error(res, new Error('Role name is required'), 400);
      }

      const trimmedName = name.trim();
      const existing = await AdminRole.findOne({
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      });

      if (existing) {
        return ResponseWrapper.error(res, new Error(`Role "${trimmedName}" already exists`), 400);
      }

      // If permissions not provided or partial, merge with system default permission templates
      let formattedPermissions = permissions;
      if (!Array.isArray(permissions) || permissions.length === 0) {
        formattedPermissions = allAdminPermissions;
      }

      const role = await AdminRole.create({
        name: trimmedName,
        description: description ? description.trim() : '',
        permissions: formattedPermissions,
        isActive: isActive !== false,
      });

      return ResponseWrapper.success(
        res,
        { ...role.toObject(), id: role._id },
        'Role created successfully',
        201
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  roleRouter.post('/create', createRoleHandler);
  roleRouter.post('/', createRoleHandler);

  /**
   * @swagger
   * /admin/role/update:
   *   put:
   *     summary: Update an existing admin role
   *     tags: [Admin - Roles]
   */
  const updateRoleHandler = async (req: Request, res: Response) => {
    try {
      const roleId = req.params.id || req.body.adminRoleId || req.body.id || req.body._id;

      if (!roleId) {
        return ResponseWrapper.error(res, new Error('Role ID is required for updating'), 400);
      }

      const { name, description, permissions, isActive } = req.body;

      const role = await AdminRole.findById(roleId);
      if (!role) {
        return ResponseWrapper.error(res, new Error('Role not found'), 404);
      }

      const updateData: any = {};

      if (name && name.trim()) {
        const trimmedName = name.trim();
        if (role.name === 'SUPER_ADMIN' && trimmedName !== 'SUPER_ADMIN') {
          return ResponseWrapper.error(res, new Error('The SUPER_ADMIN role name cannot be modified'), 400);
        }

        if (trimmedName.toLowerCase() !== role.name.toLowerCase()) {
          const duplicate = await AdminRole.findOne({
            _id: { $ne: role._id },
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
          });
          if (duplicate) {
            return ResponseWrapper.error(res, new Error(`Role "${trimmedName}" already exists`), 400);
          }
        }
        updateData.name = trimmedName;
      }

      if (description !== undefined) updateData.description = description.trim();
      if (permissions !== undefined) updateData.permissions = permissions;
      if (isActive !== undefined) {
        // SUPER_ADMIN must always remain active
        updateData.isActive = role.name === 'SUPER_ADMIN' ? true : !!isActive;
      }

      const updatedRole = await AdminRole.findByIdAndUpdate(roleId, updateData, { new: true });

      return ResponseWrapper.success(
        res,
        { ...updatedRole!.toObject(), id: updatedRole!._id },
        'Role updated successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  roleRouter.put('/update', updateRoleHandler);
  roleRouter.put('/:id', updateRoleHandler);

  /**
   * @swagger
   * /admin/role/delete:
   *   delete:
   *     summary: Delete an admin role
   *     tags: [Admin - Roles]
   */
  const deleteRoleHandler = async (req: Request, res: Response) => {
    try {
      const roleId = req.params.id || req.body.adminRoleId || req.body.id || req.query.adminRoleId || req.query.id;

      if (!roleId) {
        return ResponseWrapper.error(res, new Error('Role ID is required'), 400);
      }

      const role = await AdminRole.findById(roleId);
      if (!role) {
        return ResponseWrapper.error(res, new Error('Role not found'), 404);
      }

      if (role.name === 'SUPER_ADMIN') {
        return ResponseWrapper.error(res, new Error('The SUPER_ADMIN role cannot be deleted'), 403);
      }

      // Check if any admin users are assigned to this role
      const assignedUsersCount = await User.countDocuments({
        userRole: 'admin',
        adminRoleId: role._id,
      });

      if (assignedUsersCount > 0) {
        return ResponseWrapper.error(
          res,
          new Error(`Cannot delete role because it is currently assigned to ${assignedUsersCount} admin user(s). Reassign them first.`),
          400
        );
      }

      await AdminRole.findByIdAndDelete(roleId);
      return ResponseWrapper.success(res, null, 'Role deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  };

  roleRouter.delete('/delete', deleteRoleHandler);
  roleRouter.delete('/:id', deleteRoleHandler);
};
