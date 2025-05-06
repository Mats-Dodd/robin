import { useState, useCallback, useEffect } from 'react';
import { handleChatRequest, defaultModel } from '@/lib/ai-provider';

type MessageRole = 'sent' | 'received';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

// Map from our app's message format to the AI API format
type AIMessage = {
  role: string;
  content: string;
};

interface UseAIChatOptions {
  model?: string;
  onError?: (error: Error) => void;
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { model = defaultModel, onError } = options;

  // Convert our message format to the format expected by AI APIs
  const formatMessagesForAI = useCallback((messages: ChatMessage[]): AIMessage[] => {
    return messages.map(msg => ({
      role: msg.role === 'sent' ? 'user' : 'assistant',
      content: msg.content
    }));
  }, []);

  // Handle errors in a consistent way
  const handleError = useCallback((error: Error) => {
    setError(error);
    setIsLoading(false);
    if (onError) {
      onError(error);
    }
    console.error('AI Chat Error:', error);
  }, [onError]);

  // Handle streaming responses
  const handleStreamingResponse = useCallback(async (response: Response, messageId: string) => {
    console.log('Handling streaming response:', response);
    
    if (!response.body) {
      throw new Error('Response has no body');
    }
    
    try {
      // Create a timestamp for the message
      const timestamp = new Date().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // Create a placeholder message for the streaming response
      const aiMessage: ChatMessage = {
        id: messageId,
        role: 'received',
        content: '',
        timestamp,
      };
      
      // Add the initial empty message
      setMessages(prev => [...prev, aiMessage]);
      
      // Set up streaming content handling
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream complete');
          break;
        }
        
        try {
          // Decode the chunk
          const chunk = decoder.decode(value, { stream: true });
          console.log('Received chunk:', chunk);
          
          // Try to parse the chunk as JSON
          const data = JSON.parse(chunk);
          console.log('Parsed chunk data:', data);
          
          if (data && data.content) {
            // Update the message with the new content - APPEND, don't replace
            setMessages(prevMessages => 
              prevMessages.map(msg => 
                msg.id === messageId 
                  ? { ...msg, content: msg.content + data.content } 
                  : msg
              )
            );
          }
        } catch (parseError) {
          console.warn('Error parsing chunk, might be incomplete JSON:', parseError);
          // Continue processing - this might just be an incomplete JSON chunk
        }
      }
    } catch (err) {
      console.error('Error processing stream:', err);
      throw err;
    }
  }, []);

  // Send a message to the AI and handle the response
  const sendMessage = useCallback(async (messageText: string) => {
    const timestamp = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    console.log('Sending message:', messageText);

    // Create and add the user message
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'sent', 
      content: messageText,
      timestamp,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Get all messages including the new one
      const allMessages = [...messages, userMessage];
      const formattedMessages = formatMessagesForAI(allMessages);
      
      console.log('Formatted messages for AI:', formattedMessages);
      
      // Create the request to send to the AI
      const requestBody = {
        messages: formattedMessages,
        model,
      };
      
      console.log('Request body:', requestBody);
      
      const request = new Request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Sending request to handleChatRequest');
      // Send the request to the AI service
      const response = await handleChatRequest(request);
      
      console.log('Received response from handleChatRequest:', response);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response text:', errorText);
        let errorMessage = 'Failed to get response from AI';
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.details || errorMessage;
        } catch (e) {
          // If we can't parse the error as JSON, use the text directly
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      // Generate a unique ID for the assistant message
      const assistantMessageId = `${Date.now()}-assistant`;
      
      // Handle the streaming response
      await handleStreamingResponse(response, assistantMessageId);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [messages, model, formatMessagesForAI, handleError, handleStreamingResponse]);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
  };
} 