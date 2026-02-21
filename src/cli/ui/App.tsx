import React, { useState, useEffect, useRef } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import { VoltClawAgent, type Store } from '../../core/agent.js';
import { MessageList, ChatMessage } from './components/MessageList.js';
import { InputPrompt } from './components/InputPrompt.js';
import { DenseStatus, AgentContext } from './components/DenseStatus.js';

export interface ApprovalBridge {
    requestApproval: (tool: string, args: any) => Promise<boolean>;
}

const ApprovalPrompt = ({ tool, args, onResolve }: { tool: string, args: any, onResolve: (allowed: boolean) => void }) => {
    useInput((input) => {
        if (input.toLowerCase() === 'y') onResolve(true);
        if (input.toLowerCase() === 'n') onResolve(false);
    });

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
            <Text color="yellow" bold>⚠️  Approval Required</Text>
            <Text>Tool: <Text bold color="cyan">{tool}</Text></Text>
            <Text>Args: {JSON.stringify(args, null, 2)}</Text>
            <Box marginTop={1}>
                <Text bold>Allow execution? (Y/n) </Text>
            </Box>
        </Box>
    );
};

export const App = ({ agent, store, approvalBridge, demoMode = false }: { agent?: VoltClawAgent, store?: Store, approvalBridge?: ApprovalBridge, demoMode?: boolean }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const streamingContentRef = useRef('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | undefined>();
  const [approvalRequest, setApprovalRequest] = useState<{ tool: string, args: any, resolve: (b: boolean) => void } | null>(null);

  const [context, setContext] = useState<AgentContext>({
    depth: 0,
    maxDepth: 8,
    budgetUSD: Infinity,
    estCostUSD: 0,
    activeSubtasks: [],
    callCount: 0,
    maxCalls: Infinity
  });

  useInput((input, key) => {
    // Only capture Ctrl shortcuts, pass other input to InputPrompt via its own focus
    if (key.ctrl && input === 'c') {
      exit();
      process.exit(0);
    }
    if (key.ctrl && input === 'l') {
      setMessages([]);
      setStreamingContent('');
      streamingContentRef.current = '';
    }
    if (key.escape) {
        if (isThinking) {
            setIsThinking(false);
            // We can't easily cancel the agent promise from here without an abort controller signal
            // passed down to queryStream, but we can at least stop the UI from blocking.
            // Ideally agent.stop() or pause() could be used but that stops the daemon.
            // For now, UI reset allows user to regain control.
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: '[Interrupted by User]',
                timestamp: Date.now()
            }]);
            setStreamingContent('');
            streamingContentRef.current = '';
        }
    }
  });

  const updateContext = async () => {
        if (!store) return;

        try {
            const sessionResult = store.get('self', true);
            const session = sessionResult instanceof Promise ? await sessionResult : sessionResult;

            if (!session) return;

            setContext(prev => ({
                ...prev,
                depth: session.depth || 0,
                estCostUSD: session.estCostUSD || 0,
                callCount: session.callCount || 0,
                activeSubtasks: Object.entries(session.subTasks || {})
                    .filter(([_, st]) => !st.arrived && !st.error) // Only show actually active tasks
                    .map(([id, st]) => ({
                        id,
                        task: st.task,
                        depth: (session.depth || 0) + 1
                    }))
            }));
        } catch (e) {
            // unexpected error in store access
        }
    };

  const flushStreaming = () => {
      const content = streamingContentRef.current;
      if (content) {
          setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              role: 'assistant',
              content,
              timestamp: Date.now()
          }]);
          streamingContentRef.current = '';
          setStreamingContent('');
      }
  };

  useEffect(() => {
      if (approvalBridge) {
          approvalBridge.requestApproval = async (tool, args) => {
              return new Promise<boolean>((resolve) => {
                  setApprovalRequest({ tool, args, resolve });
                  setIsThinking(false);
              });
          };
      }
  }, [approvalBridge]);

  useEffect(() => {
    if (demoMode) {
        // Simple demo loop
        const runDemo = async () => {
            const now = Date.now();
            // Initial user input
            await new Promise(r => setTimeout(r, 1000));
            setMessages(prev => {
                if (prev.find(m => m.id === 'demo-1')) return prev;
                return [...prev, {
                    id: 'demo-1', role: 'user', content: 'Research recursive agent capabilities.', timestamp: now
                }];
            });

            setIsThinking(true);

            // Simulate tool call
            await new Promise(r => setTimeout(r, 1000));
            setCurrentTool('web_search');
            await new Promise(r => setTimeout(r, 2000));
            setCurrentTool(undefined);

            setMessages(prev => {
                if (prev.find(m => m.id === 'demo-2')) return prev;
                return [...prev, {
                    id: 'demo-2', role: 'tool', tool: 'web_search', content: '{"results": ["VoltClaw is a recursive autonomous agent..."]}', timestamp: Date.now()
                }];
            });

            // Simulate streaming response
            const streamText = "Based on the search results, VoltClaw is highly capable. I will now spawn a sub-agent to explore further.";
            for (const char of streamText) {
                streamingContentRef.current += char;
                setStreamingContent(streamingContentRef.current);
                await new Promise(r => setTimeout(r, 50));
            }
            flushStreaming();

            // Simulate context update
            setContext(prev => ({
                ...prev,
                depth: 1,
                estCostUSD: 0.05,
                callCount: 1,
                activeSubtasks: [{ id: 'sub-123', task: 'Analyze architecture', depth: 1 }]
            }));

            setIsThinking(false);
        };
        runDemo();
        return;
    }

    if (!agent) return;

    const onToolStart = (ctx: any) => {
        flushStreaming();
        setCurrentTool(ctx.tool);
        updateContext();
    };

    const onToolEnd = (ctx: any) => {
        setCurrentTool(undefined);
        if (ctx.result) {
            setMessages(prev => [...prev, {
                id: Date.now().toString() + Math.random(),
                role: 'tool',
                tool: ctx.tool,
                content: typeof ctx.result === 'string' ? ctx.result : JSON.stringify(ctx.result),
                timestamp: Date.now()
            }]);
        }
        updateContext();
        // Force refresh streaming content just in case chunks arrived during tool execution
        flushStreaming();
    };

    agent.on('tool_start', onToolStart);
    agent.on('tool_end', onToolEnd);

    updateContext();

    return () => {};
  }, [agent, demoMode]);

  const handleSubmit = async (input: string) => {
    if (input === 'exit') {
        exit();
        process.exit(0);
        return;
    }

    setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        content: input,
        timestamp: Date.now()
    }]);

    setIsThinking(true);

    if (demoMode) {
        // Echo demo
        setTimeout(() => {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `(Demo Mode) You said: ${input}`,
                timestamp: Date.now()
            }]);
            setIsThinking(false);
        }, 1000);
        return;
    }

    if (!agent) return;

    try {
        const stream = agent.queryStream(input);
        for await (const chunk of stream) {
            streamingContentRef.current += chunk;
            setStreamingContent(streamingContentRef.current);
        }
        flushStreaming();
    } catch (e) {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Error: ${e}`,
            timestamp: Date.now()
        }]);
    } finally {
        setIsThinking(false);
        updateContext();
    }
  };

  return (
    <Box flexDirection="column" width="100%">
        <Box flexDirection="column" flexGrow={1} marginBottom={0}>
            <MessageList messages={messages} streamingContent={streamingContent} />
        </Box>

        {approvalRequest ? (
            <ApprovalPrompt
                tool={approvalRequest.tool}
                args={approvalRequest.args}
                onResolve={(allowed) => {
                    approvalRequest.resolve(allowed);
                    setApprovalRequest(null);
                    setIsThinking(true);
                }}
            />
        ) : (
            <Box flexDirection="column" marginX={0} paddingX={0}>
                <DenseStatus context={context} isThinking={isThinking} />
                <InputPrompt onSubmit={handleSubmit} isThinking={isThinking} />
            </Box>
        )}
    </Box>
  );
};
