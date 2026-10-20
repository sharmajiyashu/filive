import { Response } from "express";

export class ResponseWrapper {
  static success<T>(res: Response, data: T, message: string = 'Success', code: number = 200) {
    if (res.headersSent) {
      return;
    }
    return res.status(code).json({
      success: true,
      data,
      message,
    });
  }

  static error(res: Response, error: any, code: number = 400) {
    if (res.headersSent) {
      return;
    }
    let errorMessage = 'An error occurred';

    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && error.message) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }

    if (errorMessage.includes('DEVICE_BANNED')) {
      return res.status(403).json({
        success: false,
        message: 'This device has been banned by admin. You cannot log in or register from this device.',
        error: errorMessage,
        isDeviceBanned: true,
      });
    }

    return res.status(code).json({
      success: false,
      message: errorMessage,
      error: errorMessage,
    });
  }
}
