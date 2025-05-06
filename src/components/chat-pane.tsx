import React, { useState, useRef, FormEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { ChatMessageList } from '@/components/ui/chat/chat-message-list';
import { ChatInput } from '@/components/ui/chat/chat-input';
import {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleTimestamp,
} from '@/components/ui/chat/chat-bubble';
import { cn } from '@/lib/utils';

interface ChatPaneProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'sent' | 'received';
  content: string;
  timestamp: string;
}

export function ChatPane({ isOpen, onClose }: ChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when pane opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = (event?: FormEvent) => {
    event?.preventDefault();
    const text = inputValue.trim();
    if (!text) return;

    const timestamp = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const sentMessage: Message = {
      id: `${Date.now()}-sent`,
      role: 'sent',
      content: text,
      timestamp,
    };
    
    setMessages((prev) => [...prev, sentMessage]);
    setInputValue('');

    // Echo back after a delay
    setTimeout(() => {
      const receivedMessage: Message = {
        id: `${Date.now()}-received`,
        role: 'received',
        content: `You wrote: "${text}"`, // Simple echo logic
        timestamp: new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
      };
      setMessages((prev) => [...prev, receivedMessage]);
    }, 600); // Simulate response delay
  };

  // Base classes for the pane
  const baseClasses = "fixed top-0 right-0 h-screen w-80 bg-card border-l shadow-xl z-40 flex flex-col transition-transform duration-300 ease-in-out transform";
  // Classes to apply based on isOpen state for transition
  const stateClasses = isOpen ? "translate-x-0" : "translate-x-full";

  return (
    <div className={cn(baseClasses, stateClasses)} aria-hidden={!isOpen}>
      {/* Header */}
      <div className="flex justify-between items-center px-4 pt-4 pb-2 border-b">
        <h2 className="text-lg font-semibold text-card-foreground">Chat</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Chat Pane">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4">
        <ChatMessageList smooth>
          {messages.map((msg) => (
            <ChatBubble key={msg.id} variant={msg.role}>
              <ChatBubbleMessage>
                {msg.content}
                <ChatBubbleTimestamp timestamp={msg.timestamp} />
              </ChatBubbleMessage>
            </ChatBubble>
          ))}
        </ChatMessageList>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-4 border-t-2 mt-auto">
        <div className="relative">
          <ChatInput
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Send a message..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        </div>
      </form>
    </div>
  );
} 