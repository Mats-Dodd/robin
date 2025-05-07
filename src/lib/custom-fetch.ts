import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Store for event listeners
const listeners = new Map();

// Event names from the Rust backend
const EVENT_CHUNK = 'ai-stream-chunk';
const EVENT_ERROR = 'ai-stream-error';
const EVENT_END = 'ai-stream-end';

export async function customTauriFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    console.log('customTauriFetch called with endpoint:', endpoint);
    console.log('customTauriFetch options:', options);
    
    const { method = 'GET', headers = {}, body } = options;
    console.log('Request body raw:', body);
    
    // Parse the request body to extract provider and payload
    let provider = 'anthropic'; // Default provider
    let payload = '{}';
    
    if (body) {
      try {
        // For API calls from the AI provider, the body will contain provider and payload
        const bodyData = JSON.parse(body as string);
        console.log('Parsed body data:', bodyData);
        
        if (bodyData.provider && bodyData.payload) {
          provider = bodyData.provider;
          payload = bodyData.payload;
          console.log('Extracted provider:', provider);
          console.log('Extracted payload:', payload);
        } else {
          // If not in expected format, use the entire body as payload
          payload = body as string;
          console.log('Using body as payload, no provider/payload structure found');
        }
      } catch (parseError) {
        console.error('Error parsing body:', parseError);
        payload = body as string;
        console.log('Using raw body as payload due to parse error');
      }
    } else {
      console.log('No body provided in request');
    }
    
    console.log('Invoking stream_api_request with:', { provider, payload });
    
    // Create a unique ID for this request
    const requestId = Date.now().toString();
    
    // Create a ReadableStream for streaming response
    const stream = new ReadableStream({
      start(controller) {
        console.log(`Setting up event listeners for: ${EVENT_CHUNK}, ${EVENT_ERROR}, ${EVENT_END}`);
        
        // Listen for chunk events from the AI provider
        const chunkUnlisten = listen(EVENT_CHUNK, (event) => {
          console.log(`Received ${EVENT_CHUNK} event:`, event);
          
          if (event.payload) {
            try {
              // Parse the Anthropic format: "0:{JSON}\n"

              
              const chunkStr = String(event.payload);
              console.log(`Raw chunk data:`, chunkStr);
              
              // Extract the JSON part - Format is "0:\"text content\"\n"
              let content = chunkStr;
              
              if (chunkStr.includes(':') && chunkStr.includes('\n')) {
                // It's in the expected format, extract the content
                const colonIndex = chunkStr.indexOf(':');
                const newlineIndex = chunkStr.lastIndexOf('\n');
                
                if (colonIndex !== -1 && newlineIndex !== -1) {
                  // Extract the JSON part between the colon and newline
                  content = chunkStr.substring(colonIndex + 1, newlineIndex).trim();
                  console.log(`Extracted content from format:`, content);
                  
                  try {
                    // The content should be a JSON string with quotes
                    const parsed = JSON.parse(content);
                    console.log(`Parsed content:`, parsed);
                    content = parsed; // This should be the actual text
                  } catch (jsonErr) {
                    console.warn(`Failed to parse extracted content as JSON:`, jsonErr);
                    // Just use the raw extracted content
                  }
                }
              }
              
              // Create a response packet with the content
              const data = JSON.stringify({ content });
              console.log(`Formatted response data:`, data);
              controller.enqueue(new TextEncoder().encode(data));
            } catch (err) {
              console.error(`Error processing stream data:`, err);
            }
          } else {
            console.log(`Received ${EVENT_CHUNK} event with empty payload`);
          }
        });
        
        // Listen for the stream end event
        const endUnlisten = listen(EVENT_END, (event) => {
          console.log(`Received ${EVENT_END} event:`, event);
          console.log('Stream complete, closing controller');
          controller.close();
          
          // Clean up listeners
          Promise.all([chunkUnlisten, endUnlisten, errorUnlisten]).then(fns => {
            fns.forEach(fn => fn());
            listeners.delete(requestId);
          });
        });
        
        // Listen for error events
        const errorUnlisten = listen(EVENT_ERROR, (event) => {
          console.error(`Received ${EVENT_ERROR} event:`, event);
          const errorMessage = event.payload 
            ? String(event.payload)
            : 'Unknown error from AI provider';
          
          controller.error(new Error(errorMessage));
          
          // Clean up listeners
          Promise.all([chunkUnlisten, endUnlisten, errorUnlisten]).then(fns => {
            fns.forEach(fn => fn());
            listeners.delete(requestId);
          });
        });
        
        // Store the unlisteners for cleanup
        listeners.set(requestId, [chunkUnlisten, endUnlisten, errorUnlisten]);
        
        // Invoke Tauri command to start streaming
        console.log('About to invoke stream_api_request command');
        invoke('stream_api_request', {
          provider,
          payload
        }).then(result => {
          console.log('stream_api_request completed successfully:', result);
        }).catch((error) => {
          console.error('Error invoking stream_api_request:', error);
          controller.error(new Error(String(error)));
          
          // Clean up listeners on error
          Promise.all([chunkUnlisten, endUnlisten, errorUnlisten]).then(fns => {
            fns.forEach(fn => fn());
            listeners.delete(requestId);
          }).catch(e => console.error('Error cleaning up listeners:', e));
        });
      },
      cancel() {
        console.log('Stream cancelled, cleaning up listeners');
        // Clean up listeners on cancel
        if (listeners.has(requestId)) {
          const unlistenFns = listeners.get(requestId);
          Promise.all(unlistenFns).then(fns => {
            fns.forEach(fn => fn());
            listeners.delete(requestId);
          }).catch(e => console.error('Error cleaning up listeners on cancel:', e));
        }
      }
    });
    
    // Return a response with the stream
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.error('Error in customTauriFetch:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 