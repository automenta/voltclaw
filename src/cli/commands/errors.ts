import { FileErrorQueue } from '../../core/error-queue.js';
import { loadConfig } from '../config.js';

export async function errorCommand(subcommand: string, id?: string): Promise<void> {
  const config = await loadConfig();
  const errorConfig = config.errors;

  if (!errorConfig || errorConfig.type !== 'file' || !errorConfig.path) {
    console.error('Error queue is not configured or not file-based.');
    return;
  }

  const errorQueue = new FileErrorQueue(errorConfig.path);

  switch (subcommand) {
    case 'list': {
      const items = await errorQueue.list();
      if (items.length === 0) {
        console.log('Error queue is empty.');
      } else {
        console.log(`Found ${items.length} failed operations:`);
        for (const item of items) {
          // item is FailedOperation
          console.log(`- [${item.id}] ${item.tool} (${item.timestamp.toISOString()})`);
          console.log(`  Error: ${item.error.slice(0, 100)}...`);
        }
      }
      break;
    }
    case 'show': {
      if (!id) {
        console.error('Usage: voltclaw errors show <id>');
        return;
      }
      const item = await errorQueue.get(id);
      if (!item) {
        console.error(`Error item not found: ${id}`);
        return;
      }
      console.log(JSON.stringify(item, null, 2));
      break;
    }
    case 'delete': {
      if (!id) {
        console.error('Usage: voltclaw errors delete <id>');
        return;
      }
      const item = await errorQueue.get(id);
      if (!item) {
        console.error(`Error item not found: ${id}`);
        return;
      }
      await errorQueue.remove(id);
      console.log(`Deleted error item: ${id}`);
      break;
    }
    case 'clear': {
      const items = await errorQueue.list();
      if (items.length === 0) {
        console.log('Error queue is already empty.');
        return;
      }
      await errorQueue.clear();
      console.log(`Cleared ${items.length} items from error queue.`);
      break;
    }
    default:
      console.log('Usage: voltclaw errors <list|show|delete|clear> [id]');
      break;
  }
}
