import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getParamValue, getAuthValue } from '@chatmcp/sdk/utils/index.js';
import { RestServerTransport } from '@chatmcp/sdk/server/rest.js';
import request from './request.js';
import { z } from 'zod';

const obj2JsonSchema = (obj: any) => {
  return zodToJsonSchema(z.object(obj), {
    strictUnions: true,
  });
};

const API_KEY = getParamValue('ghiblio_art_api_key') || '';
const MODE = getParamValue('mode') || 'stdio';
const PORT = getParamValue('port') || 9593;
const ENDPOINT = getParamValue('endpoint') || '/rest';

// 任务的检测次数
const TASK_CHECK_TIMES: Record<string, number> = {};
// 默认查询任务状态间隔为10秒
const CHECK_TASK_DURATION = 10000;

// 创建MCP服务器
const server = new Server({
  name: 'server-ghiblio-art',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [{
    name: 'image_generate',
    description: '使用ChatGPT 4o生成图片',
    inputSchema: obj2JsonSchema({
      filesUrl: z.array(z.string().describe('用户上传的参考图片')).max(5).optional(),
      prompt: z.string().describe('图片生成提示词，用于描述你希望4o image生成的内容。filesUrl和prompt至少需要提供一个').optional(),
      size: z.string().describe('图片尺寸比例，可选值：1:1，3:2, 2:3').optional(),
    }),
  }, {
    name: 'image_generate_check_task',
    description: '查询图片生成任务进度',
    inputSchema: obj2JsonSchema({
      taskId: z.string().describe('任务ID'),
    }),
  }, {
    name: 'image_generate_remains',
    description: '查询用户剩余的画图次数',
    inputSchema: { type: 'object' },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async req => {
  try {
    const apiKey = API_KEY || getAuthValue(req, 'API_KEY');
    const { name, arguments: args = {} } = req.params;

    switch (name) {
      case 'image_generate': {
        const { filesUrl, prompt, size } = args;
        const { errorCode, errorMessage, data } = await request<any>(apiKey, 'generate', { filesUrl, prompt, size, source: 'mcp' }, 'POST');

        let text: string = `图片生成失败，失败原因：${errorMessage}`;
        if (errorCode === 0) {
          text = `图片生成任务已创建，任务ID: ${data.taskId}。\n请调用 image_generate_check_task 工具查询任务进度，持续查询任务进度, 直到成功。`;
        }

        console.info('图片生成任务创建结果：' + text);

        return {
          content: [{ type: 'text', text }],
          isError: false,
        };
      }
      case 'image_generate_check_task': {
        const { taskId } = args as any;
        const now = Date.now();
        // 每次调用接口查询，轮询间隔时间逐渐减少
        const checkTimes = TASK_CHECK_TIMES[taskId] = (TASK_CHECK_TIMES[taskId] || 0) + 1;
        let duration = Math.max(2000, CHECK_TASK_DURATION - (checkTimes - 1) * 2500);
        console.info(`查询任务进度，任务ID：${taskId}，查询次数：${checkTimes}，轮询间隔：${duration}ms`);

        const message: string = await new Promise(async function getTaskInfo(resolve) {
          const { data: { status, response, errorMessage } } = await request<any>(apiKey, 'task_info?taskId=' + taskId + '&t=' + Date.now());

          // 任务完成
          if (status === 'SUCCESS') {
            delete TASK_CHECK_TIMES[taskId];
            resolve(`任务 ${taskId} 已完成。\n图片地址：` + response.resultUrls.join('、') + '\n请使用Markdown格式显示图片，例如：![图片描述](图片地址)');
          } else if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_FAILED') {
            delete TASK_CHECK_TIMES[taskId];
            const reasonMap: any = { CREATE_TASK_FAILED: '创建任务失败', GENERATE_FAILED: '生成失败' };
            resolve(`任务 ${taskId} 失败。\n失败原因：` + (errorMessage || reasonMap[status]));
          } else {
            // 超过25秒，先返回，避免MCP超时
            if (Date.now() - now > 1000 * 25) {
              return resolve(`图片生成任务未完成，任务ID: ${taskId}。\n请继续调用 image_generate_check_task 工具查询任务进度，持续查询任务进度，直到成功。`);
            }
            // 轮询查询任务进度
            setTimeout(() => getTaskInfo(resolve), duration);
          }
        });

        console.info(`任务进度返回，任务ID：${taskId}，查询结果：${message}`);

        return {
          content: [{ type: 'text', text: message }],
          isError: false,
        };
      }
      case 'image_generate_remains': {
        const { data: remains } = await request<any>(apiKey, 'remains');
        return {
          content: [{ type: 'text', text: `用户剩余的画图次数为：${remains}` }],
          isError: false,
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
});

async function runServer() {
  if (MODE === 'rest') {
    const transport = new RestServerTransport({ port: PORT, endpoint: ENDPOINT });
    await server.connect(transport);
    await transport.startServer();
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Ghiblio-art MCP Server running on stdio');
}

runServer().catch((error) => {
  console.error('Fatal error in runServer():', error);
  process.exit(1);
});
