use crate::services::proxy::{emit_chunk, emit_end, emit_error};
use crate::services::proxy::{ProxyError, ProxyProvider, ProxyResult};
use async_trait::async_trait;
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use serde::Deserialize;
use serde_json::Value;
use tauri::Window;
use tauri_plugin_http::reqwest::{
    self,
    header::{HeaderMap, HeaderValue, CONTENT_TYPE},
};

pub struct AnthropicProvider {
    api_key: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }
}

#[derive(Deserialize, Debug)]
struct AnthropicEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicDelta>,
    #[allow(dead_code)]
    message: Option<Value>,
    usage: Option<Value>,
    error: Option<AnthropicError>,
    #[allow(dead_code)]
    index: Option<u32>,
}

#[derive(Deserialize, Debug)]
struct AnthropicDelta {
    #[serde(rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
}

#[derive(Deserialize, Debug)]
struct AnthropicError {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

#[async_trait]
impl ProxyProvider for AnthropicProvider {
    async fn stream(&self, window: Window, body: Value) -> ProxyResult<()> {
        info!("Starting Anthropic stream request");
        let client = reqwest::Client::new();
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(&self.api_key).map_err(|e| {
                ProxyError::ApiKey(format!("Invalid Anthropic API key format: {}", e))
            })?,
        );

        let response = client
            .post("https://api.anthropic.com/v1/messages")
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
                "Anthropic API request failed with status {}: {}",
                status, error_body
            );
            emit_error(&window, &error_msg)?;
            return Err(ProxyError::Status(status.as_u16()));
        }
        info!("Anthropic API request successful (status: {})", status);

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        debug!("Starting to process Anthropic stream");
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

                                let mut data_line = "";
                                for line in event_data.lines() {
                                    if let Some(stripped) = line.strip_prefix("data: ") {
                                        data_line = stripped;
                                    }
                                }

                                if data_line.is_empty() {
                                    debug!("Skipping event block - no data line found");
                                    continue;
                                }

                                match serde_json::from_str::<AnthropicEvent>(data_line) {
                                    Ok(event) => {
                                        debug!("Parsed event type: {}", event.event_type);
                                        match event.event_type.as_str() {
                                            "message_start" => {
                                                debug!("Processing message_start event");
                                            }
                                            "content_block_delta" => {
                                                if let Some(delta) = event.delta {
                                                    if delta.delta_type.as_deref()
                                                        == Some("text_delta")
                                                    {
                                                        if let Some(text) = delta.text {
                                                            let text_json =
                                                                serde_json::to_string(&text)
                                                                    .map_err(ProxyError::Parse)?;
                                                            emit_chunk(
                                                                &window,
                                                                format!("0:{}\n", text_json),
                                                            )?;
                                                        }
                                                    }
                                                }
                                            }
                                            "message_delta" => {
                                                if let Some(_usage) = event.usage {
                                                    debug!(
                                                        "Message_delta with usage metrics received"
                                                    );
                                                }
                                            }
                                            "message_stop" => {
                                                debug!("Message_stop event received");
                                                if let Some(_usage) = event.usage {
                                                    debug!("Final usage data received");
                                                }
                                            }
                                            "error" => {
                                                if let Some(error_details) = event.error {
                                                    let err_msg = format!(
                                                        "API Error Event: [{}] {}",
                                                        error_details.error_type,
                                                        error_details.message
                                                    );
                                                    error!("{}", err_msg);
                                                    emit_error(&window, &err_msg)?;
                                                }
                                            }
                                            "ping" => {
                                                debug!("Ping event ignored");
                                            }
                                            _ => warn!("Unknown event type: {}", event.event_type),
                                        }
                                    }
                                    Err(e) => {
                                        warn!("Failed to parse data as JSON event: {}", e);
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

        info!("Anthropic stream completed");
        emit_end(&window)?;
        Ok(())
    }
}
