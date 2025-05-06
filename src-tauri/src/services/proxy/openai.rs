use crate::services::proxy::{emit_chunk, emit_end, emit_error};
use crate::services::proxy::{ProxyError, ProxyProvider, ProxyResult};
use async_trait::async_trait;
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Window;
use tauri_plugin_http::reqwest::{
    self,
    header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
};

pub struct OpenAIProvider {
    api_key: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }
}

#[derive(Deserialize, Debug)]
struct OpenAIChatCompletionChunk {
    id: String,
    #[allow(dead_code)]
    object: String,
    #[allow(dead_code)]
    created: u64,
    #[allow(dead_code)]
    model: String,
    #[allow(dead_code)]
    system_fingerprint: Option<String>,
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize, Debug)]
struct OpenAIChoice {
    #[allow(dead_code)]
    index: u32,
    delta: OpenAIDelta,
    #[allow(dead_code)]
    logprobs: Option<Value>,
    finish_reason: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
struct OpenAIDelta {
    role: Option<String>,
    content: Option<String>,
}

#[async_trait]
impl ProxyProvider for OpenAIProvider {
    async fn stream(&self, window: Window, body: Value) -> ProxyResult<()> {
        info!("Starting OpenAI stream request");
        let client = reqwest::Client::new();
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))
                .map_err(|e| ProxyError::ApiKey(format!("Invalid OpenAI API key format: {}", e)))?,
        );

        let response = client
            .post("https://api.openai.com/v1/chat/completions")
            .headers(headers)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read error body".to_string());
            let error_msg = format!(
                "OpenAI API request failed with status {}: {}",
                status, error_body
            );
            emit_error(&window, &error_msg)?;
            return Err(ProxyError::Status(status.as_u16()));
        }
        info!("OpenAI API request successful (status: {})", status);

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        debug!("Starting to process OpenAI stream");
        while let Some(item) = stream.next().await {
            match item {
                Ok(chunk) => {
                    debug!("Received raw bytes chunk: {} bytes", chunk.len());
                    match String::from_utf8(chunk.to_vec()) {
                        Ok(chunk_string) => {
                            buffer.push_str(&chunk_string);

                            while let Some(pos) = buffer.find("\n\n") {
                                let event_data = buffer[..pos].trim().to_string();
                                buffer = buffer[pos + 2..].to_string(); // Skip "\n\n"

                                for line in event_data.lines() {
                                    if let Some(json_str) = line.strip_prefix("data: ") {
                                        if json_str.trim() == "[DONE]" {
                                            debug!("OpenAI [DONE] signal received");
                                            continue;
                                        }

                                        match serde_json::from_str::<OpenAIChatCompletionChunk>(
                                            json_str,
                                        ) {
                                            Ok(chunk_event) => {
                                                debug!(
                                                    "Processing chunk event ID: {}",
                                                    chunk_event.id
                                                );

                                                for choice in chunk_event.choices {
                                                    if let Some(content) = choice.delta.content {
                                                        if !content.is_empty() {
                                                            let text_json =
                                                                serde_json::to_string(&content)
                                                                    .map_err(ProxyError::Parse)?;
                                                            emit_chunk(
                                                                &window,
                                                                format!("0:{}\n", text_json),
                                                            )?;
                                                        }
                                                    }

                                                    if let Some(reason) = choice.finish_reason {
                                                        debug!(
                                                            "Choice finished with reason: {}",
                                                            reason
                                                        );
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                warn!("Failed to parse chunk event: {}", e);
                                                emit_error(
                                                    &window,
                                                    format!("Failed to parse OpenAI JSON: {}", e),
                                                )?;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            let error_msg = format!("Failed to decode chunk as UTF-8: {}", e);
                            error!("{}", error_msg);
                            emit_error(&window, &error_msg)?;
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("Error reading stream chunk: {}", e);
                    error!("{}", error_msg);
                    emit_error(&window, &error_msg)?;
                    return Err(ProxyError::Http(e));
                }
            }
        }

        info!("OpenAI stream completed");
        emit_end(&window)?;
        Ok(())
    }
}
