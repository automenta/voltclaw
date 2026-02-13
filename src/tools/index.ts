import { ToolRegistry, type ToolExecutor } from './registry.js';
import type { Tool, ToolCallResult, ToolDefinition, ToolParameters, ToolParameterProperty } from './types.js';
import { timeTool, dateTool, sleepTool } from './time.js';
import { createDelegateTool, estimateTokens, estimateTokensTool, type DelegateToolConfig } from './delegate.js';
import { httpGetTool, httpPostTool } from './http.js';
import { readFileTool, writeFileTool, listFilesTool } from './files.js';
import { restartTool } from './restart.js';
import { createAllTools } from './loader.js';

export { ToolRegistry, type ToolExecutor };
export type { Tool, ToolCallResult, ToolDefinition, ToolParameters, ToolParameterProperty };
export { timeTool, dateTool, sleepTool };
export { createDelegateTool, estimateTokens, estimateTokensTool, type DelegateToolConfig };
export { httpGetTool, httpPostTool };
export { readFileTool, writeFileTool, listFilesTool };
export { restartTool };
export { createAllTools };

export function createBuiltinTools(): Tool[] {
  return [
    timeTool,
    dateTool,
    sleepTool,
    estimateTokensTool,
    httpGetTool,
    httpPostTool,
    readFileTool,
    writeFileTool,
    listFilesTool,
    restartTool
  ];
}
