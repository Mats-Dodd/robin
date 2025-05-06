use crate::services::proxy::get_provider;
use log::info;
use serde_json::Value;
use tauri::Window;

#[tauri::command]
pub async fn stream_api_request(
    window: Window,
    provider: String,
    payload: String,
) -> Result<(), String> {
    info!("Received stream request for provider: {}", provider);

    let body_json: Value = match serde_json::from_str(&payload) {
        Ok(json) => json,
        Err(e) => {
            let err_msg = format!("Failed to parse payload into JSON: {}", e);
            return Err(err_msg);
        }
    };

    let provider_impl = match get_provider(&provider) {
        Ok(p) => p,
        Err(e) => return Err(e.to_string()),
    };

    match provider_impl.stream(window, body_json).await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
