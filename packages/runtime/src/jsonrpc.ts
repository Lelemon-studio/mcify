export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorBody;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  Unauthorized: -32001,
  Forbidden: -32002,
  NotFound: -32003,
} as const;

export const ok = (id: JsonRpcId, result: unknown): JsonRpcSuccess => ({
  jsonrpc: '2.0',
  id,
  result,
});

export const err = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError => ({
  jsonrpc: '2.0',
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

export const isJsonRpcRequest = (value: unknown): value is JsonRpcRequest => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v['jsonrpc'] === '2.0' && typeof v['method'] === 'string';
};

export const isNotification = (req: JsonRpcRequest): boolean =>
  req.id === undefined || req.id === null;
