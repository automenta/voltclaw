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
import { createGraphTools } from './graph.js';
import { createSelfTestTool } from './self-test.js';
import { createDocumentationTools } from './documentation.js';
import { createPromptTools } from './prompt.js';
import { createCodeExecTool, type CodeExecConfig } from './code_exec.js';
import { createBrowserTools, browserNavigateTool, browserClickTool, browserTypeTool, browserExtractTool, browserScreenshotTool, browserCloseTool, browserLoginTool } from './browser.js';
import { createSchedulerTools } from './scheduler.js';
import { webSearchTool } from './web_search.js';
import { createSkillTools } from './skills.js';

export { ToolRegistry, type ToolExecutor };
export type { Tool, ToolCallResult, ToolDefinition, ToolParameters, ToolParameterProperty };
export { timeTool, dateTool, sleepTool };
export { createCallTool, createCallParallelTool, estimateTokens, estimateTokensTool, type CallToolConfig };
export { httpGetTool, httpPostTool };
export { readFileTool, writeFileTool, listFilesTool };
export { restartTool };
export { grepTool, globTool, editTool, executeTool };
export { createAllTools, createGraphTools, createSelfTestTool, createDocumentationTools, createPromptTools, createCodeExecTool, type CodeExecConfig };
export { createBrowserTools, browserNavigateTool, browserClickTool, browserTypeTool, browserExtractTool, browserScreenshotTool, browserCloseTool, browserLoginTool };
export { createSchedulerTools };
export { webSearchTool };
export { createSkillTools };

export function createBuiltinTools(config?: { rlm?: CodeExecConfig }): Tool[] {
  return [
    ...createSkillTools(),
    webSearchTool,
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
    executeTool,
    createCodeExecTool(config?.rlm),
    ...createBrowserTools()
  ];
}
