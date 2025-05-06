use rmcp::{model::CallToolRequestParam, transport::TokioChildProcess, ServiceExt};
use std::borrow::Cow;
use std::sync::{Arc, Mutex};
use tauri::{Manager, Runtime, State};
use tokio::process::Command;

use crate::services::mcp::{
    McpError, ServiceManager, ServiceResponse, ToolCallResponse, ToolsResponse,
};

type ServiceState<'a> = State<'a, Arc<Mutex<ServiceManager>>>;

#[tauri::command]
pub async fn start_service<R: Runtime>(
    app: tauri::AppHandle<R>,
    service_name: String,
    executable: String,
    args: Vec<String>,
) -> Result<ServiceResponse, String> {
    let result = async {
        let child_process =
            TokioChildProcess::new(Command::new(executable).args(args)).map_err(McpError::from)?;

        let service = ().serve(child_process).await.map_err(McpError::from)?;

        let server_info = service.peer_info();
        println!("Server info for {}: {:?}", service_name, server_info);

        let service_manager = app.state::<Arc<Mutex<ServiceManager>>>();
        {
            let mut state = service_manager.lock()?;
            state.add_service(service_name.clone(), service);
        }

        Ok(ServiceResponse {
            success: true,
            message: format!("Service {} started successfully", service_name),
        })
    }
    .await;

    result.map_err(|e: McpError| e.to_string())
}

#[tauri::command]
pub async fn list_tools(
    service_state: ServiceState<'_>,
    service_name: String,
) -> Result<ToolsResponse, String> {
    let result = async {
        let peer = {
            let state = service_state.lock()?;
            let server = state
                .get_service(&service_name)
                .ok_or_else(|| McpError::ServiceNotFound(service_name.clone()))?;
            server.peer().clone()
        };

        let tools = peer.list_all_tools().await.map_err(McpError::from)?;

        let tools_count = tools.len();
        println!("Found {} tools for {}", tools_count, service_name);

        Ok(ToolsResponse {
            success: true,
            tools,
            message: format!("Found {} tools", tools_count),
        })
    }
    .await;

    result.map_err(|e: McpError| e.to_string())
}

#[tauri::command]
pub async fn call_tool(
    service_state: ServiceState<'_>,
    service_name: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<ToolCallResponse, String> {
    let result = async {
        let args = match arguments {
            serde_json::Value::Object(map) => Some(map),
            _ => {
                return Err(McpError::InvalidArguments(
                    "Arguments must be a valid JSON object".to_string(),
                ))
            }
        };

        let peer = {
            let state = service_state.lock()?;
            let server = state
                .get_service(&service_name)
                .ok_or_else(|| McpError::ServiceNotFound(service_name.clone()))?;
            server.peer().clone()
        };

        let tool_result = peer
            .call_tool(CallToolRequestParam {
                name: Cow::Owned(tool_name.clone()),
                arguments: args,
            })
            .await
            .map_err(McpError::from)?;

        println!("Tool {} called successfully.", tool_name);

        Ok(ToolCallResponse {
            success: true,
            result: Some(tool_result),
            message: format!("Tool {} called successfully", tool_name),
        })
    }
    .await;

    result.map_err(|e: McpError| e.to_string())
}

#[tauri::command]
pub fn get_services(service_state: ServiceState<'_>) -> Result<Vec<String>, String> {
    let result = (|| {
        let state = service_state.lock()?;
        Ok(state.list_services())
    })();

    result.map_err(|e: McpError| e.to_string())
}

#[tauri::command]
pub async fn stop_service(
    service_state: ServiceState<'_>,
    service_name: String,
) -> Result<ServiceResponse, String> {
    let maybe_service = {
        let mut service_manager = service_state
            .lock()
            .map_err(|e| McpError::LockError(e.to_string()))?;
        service_manager.remove_service(&service_name)
    };

    if let Some(service) = maybe_service {
        match service.cancel().await {
            Ok(_) => Ok(ServiceResponse {
                success: true,
                message: format!("Service {} stopped successfully", service_name),
            }),
            Err(e) => Err(McpError::from(e).to_string()),
        }
    } else {
        Ok(ServiceResponse {
            success: false,
            message: format!("Service {} not found", service_name),
        })
    }
}
