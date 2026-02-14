import inquirer from 'inquirer';
import { generateNewKeyPair, resolveToHex, getPublicKeyFromSecret, nip19 } from '../../channels/nostr/index.js';
import { Workspace } from '../../core/workspace.js';
import { loadConfig, loadOrGenerateKeys, CONFIG_FILE, KEYS_FILE, VOLTCLAW_DIR, type CLIConfig } from '../config.js';
import fs from 'fs/promises';
import path from 'path';

export async function configureCommand(): Promise<void> {
  console.log('Welcome to VoltClaw Configuration Wizard\n');

  // Ensure VoltClaw dir exists
  await fs.mkdir(VOLTCLAW_DIR, { recursive: true });

  const currentConfig = await loadConfig();

  // 1. LLM Configuration
  const llmAnswers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select LLM Provider:',
      choices: ['ollama', 'openai', 'anthropic'],
      default: currentConfig.llm.provider
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter Model Name:',
      default: (answers: any) => {
        if (answers.provider === 'ollama') return 'llama3.2';
        if (answers.provider === 'openai') return 'gpt-4o';
        if (answers.provider === 'anthropic') return 'claude-3-5-sonnet-20241022';
        return 'gpt-4o';
      }
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter Base URL (optional):',
      default: 'http://localhost:11434',
      when: (answers: any) => answers.provider === 'ollama'
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter API Key:',
      when: (answers: any) => answers.provider !== 'ollama',
      mask: '*'
    }
  ] as any);

  // 2. Channel Configuration (Nostr)
  const channelAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'relays',
      message: 'Enter Nostr Relays (comma separated):',
      default: currentConfig.relays.join(', ')
    }
  ] as any);

  // 3. Identity Configuration
  let keys = { publicKey: '', secretKey: '', npub: '', nsec: '' };
  try {
    const existing = await fs.readFile(KEYS_FILE, 'utf-8');
    const parsed = JSON.parse(existing);
    keys = { ...parsed, npub: resolveToHex(parsed.publicKey), nsec: resolveToHex(parsed.secretKey) }; // approximate, re-encoding needed really but config stores hex
  } catch {
      // no keys
  }

  const identityChoice = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Identity Management:',
      choices: [
        { name: 'Keep existing identity', value: 'keep', disabled: !keys.secretKey },
        { name: 'Generate new identity', value: 'generate' },
        { name: 'Import private key (nsec/hex)', value: 'import' }
      ]
    }
  ] as any);

  if (identityChoice.action === 'generate') {
    keys = await generateNewKeyPair();
    console.log(`Generated new identity: ${keys.npub}`);
  } else if (identityChoice.action === 'import') {
    const importAnswer = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Enter private key (nsec or hex):',
        mask: '*'
      }
    ] as any);
    const hex = resolveToHex(importAnswer.key);
    // basic validation
    if (hex.length !== 64) {
        console.error('Invalid key length. Using generated key instead.');
        keys = await generateNewKeyPair();
    } else {
        try {
            keys.secretKey = hex;
            keys.publicKey = getPublicKeyFromSecret(hex);
            keys.nsec = nip19.nsecEncode(Uint8Array.from(Buffer.from(hex, 'hex')));
            keys.npub = nip19.npubEncode(keys.publicKey);
            console.log(`Imported identity: ${keys.npub}`);
        } catch (error) {
            console.error('Failed to import key:', error);
            console.log('Generating new identity instead.');
            keys = await generateNewKeyPair();
        }
    }
  }

  // Save Config & Keys
  const newConfig: CLIConfig = {
    ...currentConfig,
    relays: channelAnswers.relays.split(',').map((r: string) => r.trim()).filter((r: string) => r),
    llm: {
      provider: llmAnswers.provider,
      model: llmAnswers.model,
      baseUrl: llmAnswers.baseUrl,
      apiKey: llmAnswers.apiKey
    }
  };

  await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
  if (keys.secretKey) {
      // If we imported, we might miss publicKey.
      // But start command derives it.
      await fs.writeFile(KEYS_FILE, JSON.stringify({
          publicKey: keys.publicKey,
          secretKey: keys.secretKey
      }, null, 2));
  }

  console.log('Configuration saved.');

  // 4. Workspace Configuration
  const workspace = new Workspace();
  await workspace.ensureExists();

  const workspaceAnswers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'editSoul',
      message: 'Do you want to edit the Agent SOUL (Persona)?',
      default: false
    },
    {
      type: 'confirm',
      name: 'editUser',
      message: 'Do you want to edit the User Profile?',
      default: false
    }
  ] as any);

  if (workspaceAnswers.editSoul) {
    const soulContent = await workspace.loadFile('SOUL.md');
    const newSoul = await inquirer.prompt([
      {
        type: 'editor',
        name: 'content',
        message: 'Edit SOUL.md',
        default: soulContent
      }
    ] as any);
    await workspace.saveFile('SOUL.md', newSoul.content);
  }

  if (workspaceAnswers.editUser) {
    const userContent = await workspace.loadFile('USER.md');
    const newUser = await inquirer.prompt([
      {
        type: 'editor',
        name: 'content',
        message: 'Edit USER.md',
        default: userContent
      }
    ] as any);
    await workspace.saveFile('USER.md', newUser.content);
  }

  console.log('Workspace updated.');
  console.log('Setup complete! Run `voltclaw start` to begin.');
}
