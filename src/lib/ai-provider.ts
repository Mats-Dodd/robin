import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { customTauriFetch } from './custom-fetch';


export const anthropicProvider = createAnthropic({
  fetch: customTauriFetch as typeof fetch,
});
export const openaiProvider = createOpenAI({
  compatibility: 'strict',
  fetch: customTauriFetch as typeof fetch,
});


const modelProviderMap: Record<string, 'anthropic' | 'openai'> = {
  'claude-3-5-sonnet': 'anthropic', 
  'claude-': 'anthropic',          
  'gpt-': 'openai',              
};

function getProviderForModel(model: string): 'anthropic' | 'openai' {
  for (const key in modelProviderMap) {
    if (model.startsWith(key)) {
      return modelProviderMap[key];
    }
  }
  console.warn(`Could not determine provider for model: ${model}. Defaulting to anthropic.`);
  return 'anthropic'; 
}


export const defaultModel = 'claude-3-5-sonnet-latest';

export async function handleChatRequest(request: Request): Promise<Response> {
  try {
    console.log('handleChatRequest: Processing request', request.method);

    const body = await request.json();
    console.log('handleChatRequest: Request body parsed', body);

    const { messages } = body;
    const model = body.model || defaultModel;
    const provider = getProviderForModel(model);

    if (!messages || !Array.isArray(messages)) {
      throw new Error('Invalid request: messages array is required');
    }

    console.log('handleChatRequest: Messages extracted', messages);
    console.log(`handleChatRequest: Using model: ${model}, provider: ${provider}`);

    const transformedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    console.log('handleChatRequest: Transformed messages', transformedMessages);

    const apiPayload = JSON.stringify({
      model: model,
      messages: transformedMessages,
      stream: true,
      ...(provider === 'anthropic' && { max_tokens: 1000 }),
    });

    console.log(`handleChatRequest: Prepared API payload for ${provider}`);

    const response = await customTauriFetch('api/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
         provider: provider,
         payload: apiPayload
      }),
    });

    return response;

  } catch (error) {
    console.error('Error processing chat request:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 