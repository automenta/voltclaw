import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import type { Tool, ToolCallResult } from './types.js';
import { formatToolError } from './errors.js';

let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;

// Ensure browser is closed on process exit
process.on('exit', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
});

const NavigateSchema = z.object({
  url: z.string().url().describe('The URL to navigate to')
});

const ClickSchema = z.object({
  selector: z.string().describe('The CSS selector to click')
});

const TypeSchema = z.object({
  selector: z.string().describe('The CSS selector to type into'),
  text: z.string().describe('The text to type')
});

const ExtractSchema = z.object({
  selector: z.string().optional().describe('The CSS selector to extract text from (optional, defaults to body)'),
  attribute: z.string().optional().describe('The attribute to extract (optional, defaults to text content)')
});

const ScreenshotSchema = z.object({
  path: z.string().optional().describe('Path to save the screenshot (optional, returns base64 if not provided)'),
  fullPage: z.boolean().optional().default(false).describe('Capture full page')
});

async function getPage(): Promise<Page> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  if (!pageInstance) {
    pageInstance = await browserInstance.newPage();
  }
  return pageInstance;
}

export const browserNavigateTool: Tool = {
  name: 'browser_navigate',
  description: 'Navigate the browser to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' }
    },
    required: ['url']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      const { url } = NavigateSchema.parse(args);
      const page = await getPage();
      await page.goto(url);
      const title = await page.title();
      return { status: 'success', title, url };
    } catch (error) {
      return { error: formatToolError('browser_navigate', error, args) };
    }
  }
};

export const browserClickTool: Tool = {
  name: 'browser_click',
  description: 'Click an element on the current page',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'The CSS selector to click' }
    },
    required: ['selector']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      const { selector } = ClickSchema.parse(args);
      const page = await getPage();
      await page.click(selector);
      return { status: 'success', selector };
    } catch (error) {
      return { error: formatToolError('browser_click', error, args) };
    }
  }
};

export const browserTypeTool: Tool = {
  name: 'browser_type',
  description: 'Type text into an element on the current page',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'The CSS selector to type into' },
      text: { type: 'string', description: 'The text to type' }
    },
    required: ['selector', 'text']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      const { selector, text } = TypeSchema.parse(args);
      const page = await getPage();
      await page.fill(selector, text);
      return { status: 'success', selector, textLength: text.length };
    } catch (error) {
      return { error: formatToolError('browser_type', error, args) };
    }
  }
};

export const browserExtractTool: Tool = {
  name: 'browser_extract',
  description: 'Extract text or attribute from an element',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'The CSS selector (optional, defaults to body)' },
      attribute: { type: 'string', description: 'The attribute to extract (optional)' }
    }
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      const { selector, attribute } = ExtractSchema.parse(args);
      const page = await getPage();
      const targetSelector = selector || 'body';

      let content;
      if (attribute) {
        content = await page.getAttribute(targetSelector, attribute);
      } else {
        content = await page.innerText(targetSelector);
      }

      return { content: content || '' };
    } catch (error) {
      return { error: formatToolError('browser_extract', error, args) };
    }
  }
};

export const browserScreenshotTool: Tool = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current page',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to save (optional)' },
      fullPage: { type: 'boolean', description: 'Capture full page' }
    }
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      const { path, fullPage } = ScreenshotSchema.parse(args);
      const page = await getPage();
      const buffer = await page.screenshot({ path, fullPage });

      if (path) {
        return { status: 'success', path };
      }

      return { status: 'success', base64: buffer.toString('base64').slice(0, 100) + '...' }; // Truncate for log
    } catch (error) {
      return { error: formatToolError('browser_screenshot', error, args) };
    }
  }
};

export const browserCloseTool: Tool = {
  name: 'browser_close',
  description: 'Close the browser instance',
  parameters: { type: 'object', properties: {} },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        pageInstance = null;
      }
      return { status: 'success' };
    } catch (error) {
      return { error: formatToolError('browser_close', error, args) };
    }
  }
};

export const createBrowserTools = (): Tool[] => [
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserExtractTool,
  browserScreenshotTool,
  browserCloseTool
];
