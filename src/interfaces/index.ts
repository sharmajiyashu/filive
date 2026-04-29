export interface IPagination {
    page: number;
    limit: number;
}

export interface IPaginationResponse {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface IPaginatedResponse<T> {
    data: T[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        [key: string]: any;
    };
}

export interface PermissionModule {
    moduleName: string;
    enabled: boolean;
    features: {
        [featureName: string]: {
            enabled: boolean;
            description: { en: string };
        };
    };
}
