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
import { useAIChat } from '@/hooks/useAIChat';

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
  const { messages, sendMessage, isLoading } = useAIChat();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [width, setWidth] = useState(320); // Initial width (equivalent to w-80)
  const [isResizing, setIsResizing] = useState(false);
  const minWidth = 280; // Minimum width in pixels
  const maxWidth = 600; // Maximum width in pixels

  // Focus input when pane opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle mouse events for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width (window width - mouse position)
      const newWidth = window.innerWidth - e.clientX;
      
      // Apply constraints
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleSend = (event?: FormEvent) => {
    event?.preventDefault();
    const text = inputValue.trim();
    if (!text) return;

    // Send the message using our AI chat hook
    sendMessage(text);
    setInputValue('');
  };

  // Base classes for the pane - removing fixed positioning and transforms
  const baseClasses = "h-screen bg-card border-l shadow-xl flex flex-col overflow-hidden"; // Added overflow-hidden
  // Removed stateClasses related to translate-x

  // Add transition for width
  const transitionClasses = "transition-all duration-300 ease-in-out"; 

  return (
    <div 
      className={cn(baseClasses, transitionClasses)} // Apply base and transition classes
      aria-hidden={!isOpen}
      // Conditionally set width based on isOpen
      style={{ width: isOpen ? `${width}px` : '0px', 
               borderLeftWidth: isOpen ? '1px' : '0px' // Hide border when closed
             }} 
    >
      {/* Resize Handle - Only show when open */}
      {isOpen && (
        <div 
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-primary/20"
          onMouseDown={() => setIsResizing(true)}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-center px-4 pt-4 pb-2 border-b">
        <h2 className="text-lg font-semibold text-card-foreground">AI Chat</h2>
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
            placeholder={isLoading ? "AI is thinking..." : "Send a message..."}
            disabled={isLoading}
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