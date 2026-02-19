import { z } from 'zod';
import type { Tool, ToolCallResult } from './types.js';
import type { Scheduler } from '../core/scheduler.js';
import { formatToolError } from './errors.js';

const ScheduleTaskSchema = z.object({
  cron: z.string().describe('Cron expression (e.g. "0 0 * * *")'),
  task: z.string().describe('Task description')
});

const CancelTaskSchema = z.object({
  id: z.string().describe('Task ID')
});

export const createSchedulerTools = (scheduler: Scheduler): Tool[] => {
  return [
    {
      name: 'schedule_task',
      description: 'Schedule a recurring task using cron syntax',
      parameters: {
        type: 'object',
        properties: {
          cron: { type: 'string', description: 'Cron expression (e.g. "0 9 * * *" for daily at 9am)' },
          task: { type: 'string', description: 'Description of the task to perform' }
        },
        required: ['cron', 'task']
      },
      execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
        try {
          const { cron, task } = ScheduleTaskSchema.parse(args);
          const id = await scheduler.schedule(cron, task);
          return { status: 'success', id, message: `Task scheduled with ID: ${id}` };
        } catch (error) {
          return { error: formatToolError('schedule_task', error, args) };
        }
      }
    },
    {
      name: 'list_tasks',
      description: 'List all currently scheduled tasks',
      parameters: { type: 'object', properties: {} },
      execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
        try {
          const tasks = await scheduler.list();
          return { status: 'success', tasks };
        } catch (error) {
          return { error: formatToolError('list_tasks', error, args) };
        }
      }
    },
    {
      name: 'cancel_task',
      description: 'Cancel a scheduled task by ID',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The ID of the task to cancel' }
        },
        required: ['id']
      },
      execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
        try {
          const { id } = CancelTaskSchema.parse(args);
          await scheduler.cancel(id);
          return { status: 'success', message: `Task ${id} cancelled` };
        } catch (error) {
          return { error: formatToolError('cancel_task', error, args) };
        }
      }
    }
  ];
};
