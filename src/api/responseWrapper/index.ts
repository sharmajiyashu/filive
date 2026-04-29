import { Response } from "express";

export class ResponseWrapper {
  static success<T>(res: Response, data: T, message: string = 'Success', code: number = 200) {
    return res.status(code).json({
      success: true,
      data,
      message,
    });
  }

  static error(res: Response, error: any, code: number = 400) {
    let errorMessage = 'An error occurred';

    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && error.message) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }

    return res.status(code).json({
      success: false,
      error: errorMessage,
    });
  }
}
