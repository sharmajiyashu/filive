declare namespace Express {
    interface Request {
        user: {
            id: string;
            userRole: string;
            adminRoleId: string | null;
        };
    }
}
