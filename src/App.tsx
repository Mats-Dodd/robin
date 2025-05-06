import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import Editor from "@/components/editor/editor";
import "./index.css";

const App = () => {
  return (
    <SidebarProvider className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-4">
        <SidebarTrigger  />
        <div className="content mx-auto max-w-4xl">
          <Editor />
        </div>
      </main>
    </SidebarProvider>
  );
};

export default App
