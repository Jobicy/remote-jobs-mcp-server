export class ToolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function errorResult(error) {
  const code = error instanceof ToolError ? error.code : 'UPSTREAM_ERROR';
  const message = error instanceof ToolError ? error.message : 'Jobicy API request failed.';
  return { isError: true, content: [{ type: 'text', text: `${code}: ${message}` }] };
}
