export class UnauthorizedError extends Error {
    status: number;
    constructor(err: Error) {
        super(err.message);
        this.status = 401;
        this.name = 'UnauthorizedError';
    }
}

export class ValidationError extends Error {
    status: number;
    constructor(err: Error) {
        super(err.message);
        this.status = 400;
        this.name = 'ValidationError';
    }
}

export class ForbiddenError extends Error {
    status: number;
    constructor(err: Error) {
        super(err.message);
        this.status = 403;
        this.name = 'ForbiddenError';
    }
}
