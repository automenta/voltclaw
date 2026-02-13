import type { Tool, ToolCallResult } from './types.js';

export const httpGetTool: Tool = {
  name: 'http_get',
  description: 'Make an HTTP GET request to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch'
      },
      headers: {
        type: 'object',
        description: 'Optional headers to include in the request'
      }
    },
    required: ['url']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const url = String(args['url'] ?? '');
    
    if (!url) {
      return { error: 'URL is required' };
    }

    try {
      const headers = args['headers'] as Record<string, string> | undefined;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: headers
      });

      const contentType = response.headers.get('content-type') ?? '';
      let body: string;

      if (contentType.includes('application/json')) {
        body = JSON.stringify(await response.json());
      } else {
        body = await response.text();
      }

      return {
        statusCode: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: body.slice(0, 10000)
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

export const httpPostTool: Tool = {
  name: 'http_post',
  description: 'Make an HTTP POST request to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to post to'
      },
      body: {
        type: 'object',
        description: 'The request body (will be JSON encoded)'
      },
      headers: {
        type: 'object',
        description: 'Optional headers to include in the request'
      }
    },
    required: ['url']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const url = String(args['url'] ?? '');
    
    if (!url) {
      return { error: 'URL is required' };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(args['headers'] as Record<string, string> | undefined)
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(args['body'] ?? {})
      });

      const contentType = response.headers.get('content-type') ?? '';
      let body: string;

      if (contentType.includes('application/json')) {
        body = JSON.stringify(await response.json());
      } else {
        body = await response.text();
      }

      return {
        statusCode: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: body.slice(0, 10000)
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
