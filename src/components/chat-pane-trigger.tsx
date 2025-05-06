import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

interface ChatPaneTriggerProps {
  onClick: () => void;
}

export function ChatPaneTrigger({ onClick }: ChatPaneTriggerProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClick} 
          aria-label="Toggle Chat Pane"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Toggle Chat (Cmd+I)</p>
      </TooltipContent>
    </Tooltip>
  );
} 