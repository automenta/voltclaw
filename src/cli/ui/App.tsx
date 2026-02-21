import React, { useState, useEffect, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { VoltClawAgent } from '../../core/agent.js';
import { MessageList, ChatMessage } from './components/MessageList.js';
import { InputPrompt } from './components/InputPrompt.js';
import { StatusLine } from './components/StatusLine.js';
import { ContextVisualizer, AgentContext } from './components/ContextVisualizer.js';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

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

export const App = ({ agent, approvalBridge }: { agent: VoltClawAgent, approvalBridge?: ApprovalBridge }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const streamingContentRef = useRef('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | undefined>();
  const [approvalRequest, setApprovalRequest] = useState<{ tool: string, args: any, resolve: (b: boolean) => void } | null>(null);

  const [context, setContext] = useState<AgentContext>({
    depth: 0,
    maxDepth: 4,
    budgetUSD: 0.75,
    estCostUSD: 0,
    activeSubtasks: [],
    callCount: 0,
    maxCalls: 25
  });

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      process.exit(0);
    }
  });

  const updateContext = () => {
        const session = agent.getStore().get('self', true);
        setContext(prev => ({
            ...prev,
            depth: session.depth || 0,
            estCostUSD: session.estCostUSD || 0,
            callCount: session.callCount || 0,
            activeSubtasks: Object.entries(session.subTasks || {}).map(([id, st]) => ({
                id,
                task: st.task,
                depth: (session.depth || 0) + 1
            }))
        }));
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
    };

    agent.on('tool_start', onToolStart);
    agent.on('tool_end', onToolEnd);

    updateContext();

    return () => {};
  }, [agent]);

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

    try {
        for await (const chunk of agent.queryStream(input)) {
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
    <Box flexDirection="column" padding={1} width="100%">
        <Box justifyContent="center" marginBottom={1}>
            <Gradient name="cyan">
                <BigText text="VoltClaw" font="tiny" />
            </Gradient>
        </Box>

        <ContextVisualizer context={context} />

        <Box flexDirection="column" flexGrow={1}>
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
            <>
                <StatusLine isThinking={isThinking} currentTool={currentTool} />
                <InputPrompt onSubmit={handleSubmit} isThinking={isThinking} />
            </>
        )}
    </Box>
  );
};
