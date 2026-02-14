export function formatToolError(tool: string, error: unknown, args?: Record<string, unknown>): string {
  // File system errors
  if ((error as any).code === 'ENOENT') {
    const path = args?.path || args?.file || 'unknown';
    return `File not found: ${path}`;
  }
  if ((error as any).code === 'EACCES') {
    const path = args?.path || args?.file || 'unknown';
    return `Permission denied: ${path}`;
  }
  if ((error as any).code === 'EISDIR') {
    return `Expected file but found directory: ${args?.path}`;
  }
  if ((error as any).code === 'ENOTDIR') {
    return `Expected directory but found file: ${args?.path}`;
  }

  // Network errors
  if ((error as any).code === 'ECONNREFUSED') {
    return `Connection refused: ${args?.url || 'unknown host'}`;
  }
  if ((error as any).code === 'ETIMEDOUT') {
    return `Connection timed out: ${args?.url || 'unknown host'}`;
  }
  if ((error as any).code === 'ENOTFOUND') {
    return `Host not found: ${args?.url}`;
  }

  // HTTP errors
  if ((error as any).status) {
    const status = (error as any).status;
    const statusMessages: Record<number, string> = {
      400: 'Bad request',
      401: 'Unauthorized - check API key',
      403: 'Forbidden - insufficient permissions',
      404: 'Not found',
      429: 'Rate limited - try again later',
      500: 'Server error',
      502: 'Bad gateway',
      503: 'Service unavailable'
    };
    return `HTTP ${status}: ${statusMessages[status] || 'Unknown error'}`;
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return `${tool} failed: ${message}`;
}
