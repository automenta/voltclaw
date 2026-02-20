/**
 * LCM Integration Demo
 * 
 * This file demonstrates how to use the Lossless Context Management (LCM)
 * features in VoltClaw alongside the existing RLM paradigm.
 */

import { VoltClawAgent } from './core/agent.js';
import { ContextReferenceManager } from './core/lcm-context.js';
import { HierarchicalContext, createContextChain } from './core/hierarchical-context.js';

// ============================================================================
// Example 1: Basic Context Reference Usage
// ============================================================================

async function example1_basicContextReference(agent: VoltClawAgent) {
  console.log('=== Example 1: Basic Context Reference ===\n');

  const session = agent.getStore().get('self', true);
  const contextManager = new ContextReferenceManager(agent.memory, session);

  // Set up some shared context (RLM-style)
  session.sharedData = session.sharedData || {};
  session.sharedData['project'] = 'VoltClaw';
  session.sharedData['goal'] = 'LCM Integration';
  session.sharedData['files'] = ['src/core/agent.ts', 'src/core/types.ts'];

  // Create a context reference (LCM-style)
  const refId = await contextManager.createReference({
    keys: ['project', 'goal', 'files'],
    expiresIn: 3600000, // 1 hour
    tags: ['demo', 'example']
  });

  console.log(`Created context reference: ${refId}`);

  // Use the reference in a sub-agent call (much more efficient than copying!)
  const result = await agent.executeTool('call', {
    task: 'Analyze the project structure',
    summary: `Context Reference: ${refId}`,
    schema: { type: 'object', properties: { analysis: { type: 'string' } } }
  });

  console.log('Sub-agent result:', result);

  // Later, resolve the reference if needed
  const context = await contextManager.resolveReference(refId);
  console.log('Resolved context:', context);

  // Clean up when done
  contextManager.deleteReference(refId);
}

// ============================================================================
// Example 2: Hierarchical Context Inheritance
// ============================================================================

async function example2_hierarchicalContext(agent: VoltClawAgent) {
  console.log('\n=== Example 2: Hierarchical Context Inheritance ===\n');

  // Create root context with project-level information
  const rootContext = new HierarchicalContext();
  rootContext.set('project', 'VoltClaw');
  rootContext.set('version', '2.0.0');
  rootContext.set('goal', 'Implement LCM integration');
  rootContext.set('constraints', ['TypeScript', 'Node.js', 'SQLite']);

  // Create child context for specific subtask
  const childContext = rootContext.createChild();
  childContext.set('subtask', 'Create context reference manager');
  childContext.set('files', ['lcm-context.ts', 'hierarchical-context.ts']);

  // Child can access both local and inherited data
  console.log('Project (inherited):', childContext.get('project'));
  console.log('Version (inherited):', childContext.get('version'));
  console.log('Subtask (local):', childContext.get('subtask'));
  console.log('Files (local):', childContext.get('files'));

  // Get all accessible keys
  console.log('\nAll keys:', Array.from(childContext.getAllKeys()));

  // Visualize the hierarchy
  console.log('\nContext hierarchy:');
  console.log(childContext.visualize());

  // Create another level of nesting
  const grandchildContext = childContext.createChild();
  grandchildContext.set('implementation', 'ContextReferenceManager class');
  grandchildContext.set('status', 'complete');

  console.log('\nGrandchild context:');
  console.log('Project (inherited):', grandchildContext.get('project'));
  console.log('Subtask (inherited):', grandchildContext.get('subtask'));
  console.log('Implementation (local):', grandchildContext.get('implementation'));
}

// ============================================================================
// Example 3: Context Chain for Recursive Operations
// ============================================================================

async function example3_contextChain(agent: VoltClawAgent) {
  console.log('\n=== Example 3: Context Chain for Recursive Operations ===\n');

  // Create a context chain
  const chain = createContextChain();

  // Set up root context
  chain.root.set('task', 'Analyze codebase');
  chain.root.set('rootDir', '/home/me/voltclaw');
  chain.root.set('patterns', ['**/*.ts']);

  // Extend chain for each level of recursion
  const level1 = extendChain(chain);
  level1.set('subtask', 'Analyze core module');
  level1.set('directory', 'src/core');

  const level2 = extendChain(level1);
  level2.set('subtask', 'Analyze agent.ts');
  level2.set('file', 'src/core/agent.ts');

  // Each level inherits from parent
  console.log('Level 2 has access to:');
  console.log('  - task:', level2.get('task')); // inherited from root
  console.log('  - directory:', level2.get('directory')); // inherited from level1
  console.log('  - file:', level2.get('file')); // local to level2

  // Get full context at any level
  const fullContext = level2.getAll();
  console.log('\nFull context at level 2:', fullContext);
}

// ============================================================================
// Example 4: RLM-LCM Hybrid Pattern
// ============================================================================

async function example4_hybridPattern(agent: VoltClawAgent) {
  console.log('\n=== Example 4: RLM-LCM Hybrid Pattern ===\n');

  const session = agent.getStore().get('self', true);
  const contextManager = new ContextReferenceManager(agent.memory, session);

  // Set up shared data (RLM pattern)
  session.sharedData = session.sharedData || {};
  session.sharedData['requirements'] = 'Build LCM integration';
  session.sharedData['examples'] = [
    'Context references',
    'Hierarchical contexts',
    'Context compression'
  ];

  // Create context reference (LCM pattern)
  const refId = await contextManager.createReference({
    keys: ['requirements', 'examples'],
    tags: ['rlm-lcm-hybrid']
  });

  // Use rlm_map with context inheritance
  // Each parallel call gets the context reference automatically
  const items = ['Feature 1', 'Feature 2', 'Feature 3'];
  
  // This would use the enhanced rlm_map that passes context references
  // const results = await rlm_map(items, async (item) => ({
  //   task: `Implement ${item}`,
  //   contextRef: refId  // All calls share the same context!
  // }));

  console.log('Context reference for parallel operations:', refId);
  console.log('All parallel calls can access shared context efficiently');
}

// ============================================================================
// Example 5: Context Compression for Large Data
// ============================================================================

async function example5_contextCompression(agent: VoltClawAgent) {
  console.log('\n=== Example 5: Context Compression for Large Data ===\n');

  const session = agent.getStore().get('self', true);
  const contextManager = new ContextReferenceManager(agent.memory, session, {
    enableCompression: true,
    compressionThreshold: 500 // Compress values > 500 chars
  });

  // Set up large context data
  const largeCode = `
    // This is a large code file that would consume many tokens
    ${'console.log("test");\n'.repeat(100)}
  `;

  session.sharedData = session.sharedData || {};
  session.sharedData['code'] = largeCode;
  session.sharedData['summary'] = 'Large code file';

  // Create reference with automatic compression
  const refId = await contextManager.createReference({
    keys: ['code', 'summary'],
    compress: true
  });

  const stats = contextManager.getStats();
  console.log('Context reference created:', refId);
  console.log('Total references:', stats.totalReferences);
  console.log('Total accesses:', stats.totalAccesses);

  // Resolve and decompress
  const context = await contextManager.resolveReference(refId, {
    decompress: true
  });
  console.log('Resolved context summary:', context.summary);
  console.log('Code length:', context.code.length, 'chars');
}

// ============================================================================
// Example 6: Cross-Session Context Sharing
// ============================================================================

async function example6_crossSessionSharing(agent: VoltClawAgent) {
  console.log('\n=== Example 6: Cross-Session Context Sharing ===\n');

  const session = agent.getStore().get('self', true);
  const contextManager = new ContextReferenceManager(agent.memory, session);

  // Store important context in long-term memory
  const projectContext = {
    architecture: 'RLM + LCM hybrid',
    keyFeatures: [
      'Context references',
      'Hierarchical inheritance',
      'Lossless compression'
    ],
    decisions: [
      'Use SQLite for persistence',
      'Support both RLM and LCM patterns',
      'Maintain backward compatibility'
    ]
  };

  // Store in memory with tags for later retrieval
  await agent.memory.storeMemory(
    JSON.stringify(projectContext),
    'long-term',
    ['project-context', 'architecture', 'voltclaw'],
    9 // Very high importance
  );

  // Create a reference that can be used across sessions
  const refId = await contextManager.createReference({
    keys: ['architecture', 'keyFeatures', 'decisions'],
    expiresIn: 7200000, // 2 hours
    tags: ['cross-session', 'project-knowledge']
  });

  console.log('Cross-session context reference:', refId);
  console.log('This reference can be resolved in future sessions');

  // In a future session, you could resolve this reference
  // const context = await contextManager.resolveReference(refId);
}

// ============================================================================
// Example 7: Performance Comparison
// ============================================================================

async function example7_performanceComparison(agent: VoltClawAgent) {
  console.log('\n=== Example 7: Performance Comparison ===\n');

  const session = agent.getStore().get('self', true);
  const contextManager = new ContextReferenceManager(agent.memory, session);

  // Simulate large context
  const largeContext = {
    files: Array(10).fill(null).map((_, i) => ({
      name: `file_${i}.ts`,
      content: 'console.log("test");\n'.repeat(50)
    })),
    decisions: Array(20).fill(null).map((_, i) => `Decision ${i}: Important context`),
    requirements: Array(15).fill(null).map((_, i) => `Requirement ${i}: Detailed spec`)
  };

  session.sharedData = session.sharedData || {};
  Object.assign(session.sharedData, largeContext);

  // RLM approach: Copy full context
  const rlmContextSize = JSON.stringify(largeContext).length;
  console.log('RLM approach (full context copy):');
  console.log(`  Context size: ${rlmContextSize.toLocaleString()} characters`);
  console.log(`  Estimated tokens: ~${Math.ceil(rlmContextSize / 4).toLocaleString()}`);

  // LCM approach: Pass reference
  const refId = await contextManager.createReference({
    keys: ['files', 'decisions', 'requirements']
  });
  const lcmContextSize = refId.length + 20; // Reference ID + overhead
  console.log('\nLCM approach (context reference):');
  console.log(`  Context size: ${lcmContextSize} characters`);
  console.log(`  Estimated tokens: ~${Math.ceil(lcmContextSize / 4)}`);

  // Calculate savings
  const savings = ((1 - lcmContextSize / rlmContextSize) * 100).toFixed(2);
  console.log(`\nToken savings: ${savings}%`);
  console.log(`Efficiency gain: ${(rlmContextSize / lcmContextSize).toFixed(1)}x`);
}

// ============================================================================
// Main Demo Runner
// ============================================================================

export async function runLCMDemo(agent: VoltClawAgent) {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        VoltClaw LCM Integration Demo                      ║');
  console.log('╔═══════════════════════════════════════════════════════════╗\n');

  try {
    await example1_basicContextReference(agent);
    await example2_hierarchicalContext(agent);
    await example3_contextChain(agent);
    await example4_hybridPattern(agent);
    await example5_contextCompression(agent);
    await example6_crossSessionSharing(agent);
    await example7_performanceComparison(agent);

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║        Demo Complete!                                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Helper function used in examples
function extendChain(chain: { tip: any }): any {
  const child = chain.tip.createChild();
  return child;
}
