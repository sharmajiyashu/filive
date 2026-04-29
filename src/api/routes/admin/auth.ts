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
}
