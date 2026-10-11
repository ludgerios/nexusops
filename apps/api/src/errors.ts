export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function deny(message = 'Você não tem permissão para executar esta ação.'): never {
  throw new ApiError(403, 'FORBIDDEN', message);
}
export function missing(): never {
  throw new ApiError(404, 'NOT_FOUND', 'Registro não encontrado.');
}
export function invalid(message: string): never {
  throw new ApiError(400, 'INVALID_INPUT', message);
}
