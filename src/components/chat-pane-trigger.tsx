import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface ChatPaneTriggerProps {
  onClick: () => void;
}

export function ChatPaneTrigger({ onClick }: ChatPaneTriggerProps) {
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={onClick} 
      aria-label="Toggle Chat Pane"
    >
      <MessageSquare className="h-5 w-5" />
    </Button>
  );
} 