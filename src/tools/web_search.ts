import { chromium, type Browser } from 'playwright';
import { z } from 'zod';
import type { Tool, ToolCallResult } from './types.js';
import { formatToolError } from './errors.js';

const SearchSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(5).describe('Number of results to return')
});

export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Number of results (default: 5)' }
    },
    required: ['query']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    let browser: Browser | null = null;
    try {
      const { query, limit } = SearchSchema.parse(args);

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // DuckDuckGo HTML version is lighter and easier to scrape
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      await page.goto(url);

      // Wait for results container
      await page.waitForSelector('.result');

      const results = await page.$$eval('.result', (elements, limit) => {
        return elements.slice(0, limit).map(el => {
          const titleEl = el.querySelector('.result__title a');
          const snippetEl = el.querySelector('.result__snippet');
          const url = titleEl?.getAttribute('href');

          return {
            title: titleEl?.textContent?.trim() || '',
            url: url || '',
            snippet: snippetEl?.textContent?.trim() || ''
          };
        });
      }, limit);

      return { status: 'success', results };
    } catch (error) {
      return { error: formatToolError('web_search', error, args) };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};
