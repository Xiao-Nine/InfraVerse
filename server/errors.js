export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new HttpError(400, message, details);
}

export function notFound(message = '资源不存在') {
  return new HttpError(404, message);
}

export function conflict(message, details) {
  return new HttpError(409, message, details);
}