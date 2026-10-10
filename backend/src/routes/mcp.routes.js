import { Router } from 'express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { auth } from '../middleware/auth.js';
import { generatePersonalizedQuestion, getUserPerformance } from '../services/practice.service.js';

const router = Router();

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: error.message || 'Roundwise practice tool failed.' }],
  };
}

router.use(auth);

router.post('/', async (req, res, next) => {
  const server = new McpServer({ name: 'roundwise-practice', version: '1.0.0' });

  server.registerTool(
    'get_user_performance',
    {
      description: 'Summarize the authenticated user’s completed interview scores and recurring weak areas by topic.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(await getUserPerformance(req.user.id));
      } catch (error) {
        console.error('MCP get_user_performance failed:', error);
        return toolError(new Error('Could not retrieve interview performance.'));
      }
    },
  );

  server.registerTool(
    'generate_question',
    {
      description: 'Generate an interview question in the same style as the user’s past sessions, targeted to their weakest topic and recorded weak areas. Omit topic to use the recommended weak topic.',
      inputSchema: z.object({
        topic: z.string().optional(),
        role: z.string().optional(),
        difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
        focus_area: z.string().optional(),
      }),
    },
    async ({ topic, role, difficulty, focus_area }) => {
      try {
        return textResult(await generatePersonalizedQuestion(req.user.id, {
          topic,
          role,
          difficulty,
          focusArea: focus_area,
        }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    next(error);
  }
});

export default router;