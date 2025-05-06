import { useState, useEffect } from 'react';
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ChatPane } from "@/components/chat-pane";
import { ChatPaneTrigger } from "@/components/chat-pane-trigger";
import Editor from "@/components/editor/editor";
import "./index.css";

const App = () => {
  const [isChatPaneOpen, setIsChatPaneOpen] = useState(false);

  const toggleChatPane = () => setIsChatPaneOpen(prev => !prev);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'i' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleChatPane();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleChatPane]);

  return (
    <SidebarProvider className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b pb-2 sticky top-0 bg-background z-10">
          <SidebarTrigger />
          <h1 className="text-xl font-semibold mx-4 flex-grow">Loro Editor</h1>
          <ChatPaneTrigger onClick={toggleChatPane} />
        </div>
        <div className="content mx-auto max-w-4xl">
          <Editor />
        </div>
      </main>
      
      <ChatPane isOpen={isChatPaneOpen} onClose={toggleChatPane} />
    </SidebarProvider>
  );
};

export default App
