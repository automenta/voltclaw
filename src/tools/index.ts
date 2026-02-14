import { ToolRegistry, type ToolExecutor } from './registry.js';
import type { Tool, ToolCallResult, ToolDefinition, ToolParameters, ToolParameterProperty } from './types.js';
import { timeTool, dateTool, sleepTool } from './time.js';
import { createCallTool, createCallParallelTool, estimateTokens, estimateTokensTool, type CallToolConfig } from './call.js';
import { httpGetTool, httpPostTool } from './http.js';
import { readFileTool, writeFileTool, listFilesTool } from './files.js';
import { restartTool } from './restart.js';
import { grepTool } from './grep.js';
import { globTool } from './glob.js';
import { editTool } from './edit.js';
import { executeTool } from './execute.js';
import { createAllTools } from './loader.js';

export { ToolRegistry, type ToolExecutor };
export type { Tool, ToolCallResult, ToolDefinition, ToolParameters, ToolParameterProperty };
export { timeTool, dateTool, sleepTool };
export { createCallTool, createCallParallelTool, estimateTokens, estimateTokensTool, type CallToolConfig };
export { httpGetTool, httpPostTool };
export { readFileTool, writeFileTool, listFilesTool };
export { restartTool };
export { grepTool, globTool, editTool, executeTool };
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
    restartTool,
    grepTool,
    globTool,
    editTool,
    executeTool
  ];
}
