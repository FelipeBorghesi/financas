export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message: string) => new HttpError(404, message);
export const badRequest = (message: string) => new HttpError(400, message);
