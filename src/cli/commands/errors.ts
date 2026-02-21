import { FileErrorQueue } from '../../core/error-queue.js';
import { loadConfig } from '../config.js';

export async function errorsCommand(subcommand: string, id?: string): Promise<void> {
  const config = await loadConfig();
  const errorsConfig = config.errors;

  if (!errorsConfig || errorsConfig.type !== 'file' || !errorsConfig.path) {
    console.error('Error Queue is not configured or not file-based.');
    return;
  }

  const errorQueue = new FileErrorQueue(errorsConfig.path);

  switch (subcommand) {
    case 'list': {
      const items = await errorQueue.list();
      if (items.length === 0) {
        console.log('Error Queue is empty.');
      } else {
        console.log(`Found ${items.length} failed operations:`);
        for (const item of items) {
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
        console.log('Error Queue is already empty.');
        return;
      }
      await errorQueue.clear();
      console.log(`Cleared ${items.length} items from Error Queue.`);
      break;
    }
    default:
      console.log('Usage: voltclaw errors <list|show|delete|clear> [id]');
      break;
  }
}
