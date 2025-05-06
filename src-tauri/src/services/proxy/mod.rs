use async_trait::async_trait;
use dotenv::dotenv;
use log::{debug, error, info};
use serde_json::Value;
use std::env;
use tauri::{Emitter, Window};
use tauri_plugin_http::reqwest;
use thiserror::Error;

// Expose provider modules
mod anthropic;
mod openai;

// Re-export provider structs
pub use anthropic::AnthropicProvider;
pub use openai::OpenAIProvider;

// Event type constants
pub(crate) const EVT_CHUNK: &str = "ai-stream-chunk";
pub(crate) const EVT_ERROR: &str = "ai-stream-error";
pub(crate) const EVT_END: &str = "ai-stream-end";

/// Errors that can occur when working with API proxies
#[derive(Error, Debug)]
pub enum ProxyError {
    #[error("API key error: {0}")]
    ApiKey(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("API returned status code {0}")]
    Status(u16),

    #[error("Failed to parse response: {0}")]
    Parse(#[from] serde_json::Error),

    #[error("Failed to emit event: {0}")]
    Emit(String),
}

/// Result type for proxy operations
pub type ProxyResult<T> = Result<T, ProxyError>;

/// Trait for API providers that can stream responses
#[async_trait]
pub trait ProxyProvider {
    /// Stream a response from the API provider
    async fn stream(&self, window: Window, body: Value) -> ProxyResult<()>;
}

/// Load an API key from environment variables for the given provider
pub fn load_api_key(provider: &str) -> ProxyResult<String> {
    dotenv().ok();
    let key_name = match provider {
        "anthropic" => "ANTHROPIC_API_KEY",
        "openai" => "OPENAI_API_KEY",
        _ => {
            return Err(ProxyError::ApiKey(format!(
                "Unsupported provider: {}",
                provider
            )))
        }
    };

    debug!("Loading {} from environment/dotenv", key_name);

    match env::var(key_name) {
        Ok(key) => {
            let redacted = if key.len() > 10 {
                format!("{}...{}", &key[..5], &key[key.len() - 5..])
            } else {
                "Key too short to redact safely".to_string()
            };
            debug!("{} loaded (redacted: {})", key_name, redacted);
            Ok(key)
        }
        Err(e) => {
            let error_msg = format!("Failed to load {}: {}", key_name, e);
            error!("{}", error_msg);
            Err(ProxyError::ApiKey(error_msg))
        }
    }
}

/// Get a provider implementation based on the provider name
pub fn get_provider(provider: &str) -> ProxyResult<Box<dyn ProxyProvider + Send + Sync>> {
    let api_key = load_api_key(provider)?;

    match provider {
        "anthropic" => Ok(Box::new(AnthropicProvider::new(api_key))),
        "openai" => Ok(Box::new(OpenAIProvider::new(api_key))),
        _ => Err(ProxyError::ApiKey(format!(
            "Unsupported provider: {}",
            provider
        ))),
    }
}

// --- Event Emission Helpers ---

/// Emit an error event to the client
pub(crate) fn emit_error<S: Into<String>>(window: &Window, message: S) -> ProxyResult<()> {
    let msg = message.into();
    error!("Emitting Error: {}", msg);
    window
        .emit(EVT_ERROR, &msg)
        .map_err(|e| ProxyError::Emit(format!("Failed to emit error event: {}", e)))
}

/// Emit a chunk of data to the client
pub(crate) fn emit_chunk<S: Into<String>>(window: &Window, data: S) -> ProxyResult<()> {
    let chunk_data = data.into();
    debug!("Emitting chunk ({} bytes)", chunk_data.len());
    window
        .emit(EVT_CHUNK, &chunk_data)
        .map_err(|e| ProxyError::Emit(format!("Failed to emit chunk event: {}", e)))
}

/// Emit an end event to the client
pub(crate) fn emit_end(window: &Window) -> ProxyResult<()> {
    info!("Emitting stream end event");
    window
        .emit(EVT_END, ())
        .map_err(|e| ProxyError::Emit(format!("Failed to emit end event: {}", e)))
}
