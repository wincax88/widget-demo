use axum::{
    Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TenantInfo {
    id: Option<i64>,
    code: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppInfo {
    id: Option<i64>,
    code: Option<String>,
    name: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SubscriptionInfo {
    id: Option<i64>,
    status: Option<String>,
    #[serde(rename = "type")]
    sub_type: Option<String>,
    status_reason: Option<String>,
    starts_at: Option<String>,
    expires_at: Option<String>,
    subscribed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlanInfo {
    id: Option<i64>,
    code: Option<String>,
    name: Option<String>,
    features: Option<Vec<String>>,
    limits: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OAuthClientInfo {
    client_id: Option<String>,
    client_secret: Option<String>,
    auth_server_url: Option<String>,
    token_endpoint: Option<String>,
    userinfo_endpoint: Option<String>,
    jwks_uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ActorInfo {
    user_id: Option<String>,
    name: Option<String>,
    #[serde(rename = "type")]
    actor_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CredentialInfo {
    id: Option<i64>,
    client_id: Option<String>,
    scope_type: Option<String>,
    revoked_reason: Option<String>,
    previous_secret_expires_at: Option<String>,
    new_secret: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebhookPayload {
    event: Option<String>,
    event_id: Option<String>,
    timestamp: Option<i64>,
    tenant: Option<TenantInfo>,
    app: Option<AppInfo>,
    subscription: Option<SubscriptionInfo>,
    plan: Option<PlanInfo>,
    previous_plan: Option<PlanInfo>,
    oauth_client: Option<OAuthClientInfo>,
    actor: Option<ActorInfo>,
    credential: Option<CredentialInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredEvent {
    received_at: String,
    delivery_id: String,
    event_type: String,
    signature_valid: bool,
    payload: WebhookPayload,
    raw_body: String,
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct AppState {
    events: Arc<Mutex<Vec<StoredEvent>>>,
    webhook_secret: Arc<Mutex<String>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            events: Arc::new(Mutex::new(Vec::new())),
            webhook_secret: Arc::new(Mutex::new("test-secret".to_string())),
        }
    }
}

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

fn verify_hmac(secret: &str, timestamp: &str, event: &str, body: &str, signature: &str) -> bool {
    // signature format: "sha256={hex}"
    let expected_hex = match signature.strip_prefix("sha256=") {
        Some(h) => h,
        None => return false,
    };

    let payload = format!("{}.{}.{}", timestamp, event, body);
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    let result = hex::encode(mac.finalize().into_bytes());

    result == expected_hex
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn receive_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    let signature = headers
        .get("X-EduPlus-Signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let timestamp = headers
        .get("X-EduPlus-Timestamp")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let event_type = headers
        .get("X-EduPlus-Event")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");
    let delivery_id = headers
        .get("X-EduPlus-Delivery-Id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    let secret = state.webhook_secret.lock().unwrap().clone();
    let sig_valid = verify_hmac(&secret, timestamp, event_type, &body, signature);

    let now: DateTime<Utc> = Utc::now();

    let payload: WebhookPayload = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[{}] JSON parse error: {}", now.to_rfc3339(), e);
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"success": false, "error": format!("invalid JSON: {}", e)})),
            );
        }
    };

    let stored = StoredEvent {
        received_at: now.to_rfc3339(),
        delivery_id: delivery_id.to_string(),
        event_type: event_type.to_string(),
        signature_valid: sig_valid,
        payload,
        raw_body: body,
    };

    println!(
        "[{}] Received event: {} (delivery={}, sig_valid={})",
        now.to_rfc3339(),
        event_type,
        delivery_id,
        sig_valid
    );

    state.events.lock().unwrap().push(stored);

    (StatusCode::OK, Json(serde_json::json!({"success": true})))
}

async fn list_events(State(state): State<AppState>) -> impl IntoResponse {
    let events = state.events.lock().unwrap();
    let mut sorted: Vec<&StoredEvent> = events.iter().collect();
    sorted.reverse(); // newest first
    Json(serde_json::json!({
        "count": sorted.len(),
        "events": sorted,
    }))
}

async fn events_by_type(
    State(state): State<AppState>,
    Path(event_type): Path<String>,
) -> impl IntoResponse {
    let events = state.events.lock().unwrap();
    let filtered: Vec<&StoredEvent> = events
        .iter()
        .filter(|e| e.event_type == event_type)
        .rev()
        .collect();
    Json(serde_json::json!({
        "count": filtered.len(),
        "event_type": event_type,
        "events": filtered,
    }))
}

async fn clear_events(State(state): State<AppState>) -> impl IntoResponse {
    let mut events = state.events.lock().unwrap();
    let count = events.len();
    events.clear();
    Json(serde_json::json!({
        "cleared": count,
        "success": true,
    }))
}

async fn get_config(State(state): State<AppState>) -> impl IntoResponse {
    let secret = state.webhook_secret.lock().unwrap().clone();
    let masked = if secret.len() > 4 {
        format!("{}****", &secret[..4])
    } else {
        "****".to_string()
    };
    Json(serde_json::json!({
        "webhook_secret": masked,
        "port": 3099,
    }))
}

#[derive(Deserialize)]
struct ConfigUpdate {
    webhook_secret: String,
}

async fn set_config(
    State(state): State<AppState>,
    Json(payload): Json<ConfigUpdate>,
) -> impl IntoResponse {
    let mut secret = state.webhook_secret.lock().unwrap();
    *secret = payload.webhook_secret;
    Json(serde_json::json!({"success": true}))
}

// ---------------------------------------------------------------------------
// Issue verification
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
struct IssueCheck {
    title: String,
    status: String, // "pass", "fail", "no_data", "manual"
    details: String,
}

async fn verify_issues(State(state): State<AppState>) -> impl IntoResponse {
    let events = state.events.lock().unwrap();

    let mut issues: HashMap<String, IssueCheck> = HashMap::new();

    // --- Issue #2 / #6: credential.rotated must contain non-null non-empty new_secret ---
    {
        let rotated: Vec<&StoredEvent> = events
            .iter()
            .filter(|e| e.event_type == "credential.rotated")
            .collect();

        if rotated.is_empty() {
            let check = IssueCheck {
                title: "credential.rotated 消息体应含 new_secret".to_string(),
                status: "no_data".to_string(),
                details: "尚未收到 credential.rotated 事件".to_string(),
            };
            issues.insert("issue_2".to_string(), check.clone());
            issues.insert(
                "issue_6".to_string(),
                IssueCheck {
                    title: "credential.rotated 含 new_secret".to_string(),
                    ..check
                },
            );
        } else {
            let mut all_ok = true;
            let mut details = Vec::new();
            for ev in &rotated {
                let has_secret = ev
                    .payload
                    .credential
                    .as_ref()
                    .and_then(|c| c.new_secret.as_ref())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_secret {
                    all_ok = false;
                    details.push(format!(
                        "delivery={} 缺少 new_secret",
                        ev.delivery_id
                    ));
                }
            }
            let status = if all_ok { "pass" } else { "fail" };
            let detail_str = if all_ok {
                format!("共 {} 条 credential.rotated 事件均包含 new_secret", rotated.len())
            } else {
                details.join("; ")
            };
            issues.insert(
                "issue_2".to_string(),
                IssueCheck {
                    title: "credential.rotated 消息体应含 new_secret".to_string(),
                    status: status.to_string(),
                    details: detail_str.clone(),
                },
            );
            issues.insert(
                "issue_6".to_string(),
                IssueCheck {
                    title: "credential.rotated 含 new_secret".to_string(),
                    status: status.to_string(),
                    details: detail_str,
                },
            );
        }
    }

    // --- Issue #3: subscription.created timestamp <= credential.created timestamp for same tenant ---
    {
        let sub_created: Vec<&StoredEvent> = events
            .iter()
            .filter(|e| e.event_type == "subscription.created")
            .collect();
        let cred_created: Vec<&StoredEvent> = events
            .iter()
            .filter(|e| e.event_type == "credential.created")
            .collect();

        if sub_created.is_empty() || cred_created.is_empty() {
            issues.insert(
                "issue_3".to_string(),
                IssueCheck {
                    title: "凭证创建与订阅事件顺序正确".to_string(),
                    status: "no_data".to_string(),
                    details: format!(
                        "subscription.created: {} 条, credential.created: {} 条",
                        sub_created.len(),
                        cred_created.len()
                    ),
                },
            );
        } else {
            let mut all_ok = true;
            let mut details = Vec::new();
            for cred_ev in &cred_created {
                let cred_tenant_id = cred_ev
                    .payload
                    .tenant
                    .as_ref()
                    .and_then(|t| t.id);
                let cred_ts = cred_ev.payload.timestamp.unwrap_or(i64::MAX);

                if let Some(tid) = cred_tenant_id {
                    // find matching subscription.created for same tenant
                    let matching_sub = sub_created.iter().find(|s| {
                        s.payload
                            .tenant
                            .as_ref()
                            .and_then(|t| t.id)
                            == Some(tid)
                    });
                    if let Some(sub_ev) = matching_sub {
                        let sub_ts = sub_ev.payload.timestamp.unwrap_or(0);
                        if sub_ts > cred_ts {
                            all_ok = false;
                            details.push(format!(
                                "tenant_id={}: subscription.created(ts={}) > credential.created(ts={})",
                                tid, sub_ts, cred_ts
                            ));
                        }
                    }
                }
            }
            let status = if all_ok { "pass" } else { "fail" };
            let detail_str = if all_ok {
                "订阅事件时间戳 <= 凭证创建事件时间戳".to_string()
            } else {
                details.join("; ")
            };
            issues.insert(
                "issue_3".to_string(),
                IssueCheck {
                    title: "凭证创建与订阅事件顺序正确".to_string(),
                    status: status.to_string(),
                    details: detail_str,
                },
            );
        }
    }

    // --- Issue #4: subscription.created must have oauth_client and actor ---
    {
        let sub_created: Vec<&StoredEvent> = events
            .iter()
            .filter(|e| e.event_type == "subscription.created")
            .collect();

        if sub_created.is_empty() {
            issues.insert(
                "issue_4".to_string(),
                IssueCheck {
                    title: "subscription.created 含 oauth_client 和 actor".to_string(),
                    status: "no_data".to_string(),
                    details: "尚未收到 subscription.created 事件".to_string(),
                },
            );
        } else {
            let mut all_ok = true;
            let mut details = Vec::new();
            for ev in &sub_created {
                let has_oauth = ev
                    .payload
                    .oauth_client
                    .as_ref()
                    .map(|o| o.client_secret.as_ref().map(|s| !s.is_empty()).unwrap_or(false))
                    .unwrap_or(false);
                let has_actor = ev
                    .payload
                    .actor
                    .as_ref()
                    .map(|a| {
                        a.user_id.as_ref().map(|s| !s.is_empty()).unwrap_or(false)
                            && a.name.as_ref().map(|s| !s.is_empty()).unwrap_or(false)
                    })
                    .unwrap_or(false);

                if !has_oauth {
                    all_ok = false;
                    details.push(format!("delivery={} 缺少 oauth_client.client_secret", ev.delivery_id));
                }
                if !has_actor {
                    all_ok = false;
                    details.push(format!("delivery={} 缺少 actor.user_id 或 actor.name", ev.delivery_id));
                }
            }
            let status = if all_ok { "pass" } else { "fail" };
            let detail_str = if all_ok {
                format!("共 {} 条 subscription.created 事件均包含 oauth_client 和 actor", sub_created.len())
            } else {
                details.join("; ")
            };
            issues.insert(
                "issue_4".to_string(),
                IssueCheck {
                    title: "subscription.created 含 oauth_client 和 actor".to_string(),
                    status: status.to_string(),
                    details: detail_str,
                },
            );
        }
    }

    // --- Issue #5: activation should NOT subscribe all apps ---
    {
        let sub_created: Vec<&StoredEvent> = events
            .iter()
            .filter(|e| e.event_type == "subscription.created")
            .collect();

        if sub_created.is_empty() {
            issues.insert(
                "issue_5".to_string(),
                IssueCheck {
                    title: "激活学校不应订阅全部应用".to_string(),
                    status: "no_data".to_string(),
                    details: "尚未收到 subscription.created 事件".to_string(),
                },
            );
        } else {
            // Group by tenant, count distinct app codes per tenant
            let mut tenant_apps: HashMap<i64, Vec<String>> = HashMap::new();
            for ev in &sub_created {
                if let (Some(tid), Some(app)) = (
                    ev.payload.tenant.as_ref().and_then(|t| t.id),
                    ev.payload.app.as_ref().and_then(|a| a.code.clone()),
                ) {
                    tenant_apps.entry(tid).or_default().push(app);
                }
            }

            let mut details = Vec::new();
            let mut suspicious = false;
            for (tid, apps) in &tenant_apps {
                let mut unique_apps: Vec<&String> = apps.iter().collect();
                unique_apps.sort();
                unique_apps.dedup();
                let count = unique_apps.len();
                details.push(format!("tenant_id={}: {} 个不同应用被订阅", tid, count));
                // If more than 3 apps subscribed at once it's suspicious
                if count > 3 {
                    suspicious = true;
                }
            }

            let status = if suspicious { "fail" } else { "pass" };
            issues.insert(
                "issue_5".to_string(),
                IssueCheck {
                    title: "激活学校不应订阅全部应用".to_string(),
                    status: status.to_string(),
                    details: details.join("; "),
                },
            );
        }
    }

    // --- Issue #7: redirect_uri (manual) ---
    issues.insert(
        "issue_7".to_string(),
        IssueCheck {
            title: "登录跳转 redirect_uri 有效".to_string(),
            status: "manual".to_string(),
            details: "需要浏览器测试".to_string(),
        },
    );

    // --- Issue #8: subscription.suspended and subscription.reactivated ---
    {
        let has_suspended = events.iter().any(|e| e.event_type == "subscription.suspended");
        let has_reactivated = events.iter().any(|e| e.event_type == "subscription.reactivated");

        if !has_suspended && !has_reactivated {
            issues.insert(
                "issue_8".to_string(),
                IssueCheck {
                    title: "停止/恢复学校发送通知".to_string(),
                    status: "no_data".to_string(),
                    details: "尚未收到 subscription.suspended 或 subscription.reactivated 事件".to_string(),
                },
            );
        } else {
            let mut details = Vec::new();
            if has_suspended {
                details.push("已收到 subscription.suspended");
            }
            if has_reactivated {
                details.push("已收到 subscription.reactivated");
            }
            let status = if has_suspended && has_reactivated {
                "pass"
            } else {
                "fail"
            };
            issues.insert(
                "issue_8".to_string(),
                IssueCheck {
                    title: "停止/恢复学校发送通知".to_string(),
                    status: status.to_string(),
                    details: details.join("; "),
                },
            );
        }
    }

    // --- Issue #16: actor.name should be reasonable ---
    {
        let sub_created: Vec<&StoredEvent> = events
            .iter()
            .filter(|e| e.event_type == "subscription.created")
            .collect();

        if sub_created.is_empty() {
            issues.insert(
                "issue_16".to_string(),
                IssueCheck {
                    title: "actor 信息与 Token 一致".to_string(),
                    status: "no_data".to_string(),
                    details: "尚未收到 subscription.created 事件".to_string(),
                },
            );
        } else {
            let mut all_ok = true;
            let mut details = Vec::new();
            for ev in &sub_created {
                if let Some(actor) = &ev.payload.actor {
                    let name = actor.name.as_deref().unwrap_or("");
                    if name.is_empty() {
                        all_ok = false;
                        details.push(format!("delivery={} actor.name 为空", ev.delivery_id));
                    }
                    // Check for reversed name pattern: lowercase letters followed by space then lowercase
                    // e.g. "dmin a" instead of "admin"
                    let parts: Vec<&str> = name.split_whitespace().collect();
                    if parts.len() == 2 {
                        let p0 = parts[0];
                        let p1 = parts[1];
                        // Heuristic: if second part is very short (1-2 chars) and first part
                        // looks like a suffix, it might be reversed
                        if p1.len() <= 2
                            && p0.chars().all(|c| c.is_ascii_lowercase())
                            && p1.chars().all(|c| c.is_ascii_lowercase())
                        {
                            all_ok = false;
                            details.push(format!(
                                "delivery={} actor.name=\"{}\" 疑似姓名颠倒",
                                ev.delivery_id, name
                            ));
                        }
                    }
                } else {
                    all_ok = false;
                    details.push(format!("delivery={} 缺少 actor", ev.delivery_id));
                }
            }
            let status = if all_ok { "pass" } else { "fail" };
            let detail_str = if all_ok {
                format!("共 {} 条事件 actor.name 均正常", sub_created.len())
            } else {
                details.join("; ")
            };
            issues.insert(
                "issue_16".to_string(),
                IssueCheck {
                    title: "actor 信息与 Token 一致".to_string(),
                    status: status.to_string(),
                    details: detail_str,
                },
            );
        }
    }

    // Summary
    let mut pass = 0u32;
    let mut fail = 0u32;
    let mut no_data = 0u32;
    let mut manual = 0u32;
    for check in issues.values() {
        match check.status.as_str() {
            "pass" => pass += 1,
            "fail" => fail += 1,
            "no_data" => no_data += 1,
            "manual" => manual += 1,
            _ => {}
        }
    }

    Json(serde_json::json!({
        "issues": issues,
        "summary": {
            "pass": pass,
            "fail": fail,
            "no_data": no_data,
            "manual": manual,
        }
    }))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/webhook/eduplus", post(receive_webhook))
        .route("/api/events", get(list_events))
        .route("/api/events", delete(clear_events))
        .route("/api/events/by-type/{event_type}", get(events_by_type))
        .route("/api/verify-issues", get(verify_issues))
        .route("/api/config", get(get_config))
        .route("/api/config", post(set_config))
        .layer(cors)
        .with_state(state);

    let addr = "0.0.0.0:3099";
    println!("Webhook receiver listening on http://{}", addr);
    println!("  POST /webhook/eduplus    - 接收 webhook 事件");
    println!("  GET  /api/events         - 查看所有事件");
    println!("  GET  /api/events/by-type/{{event_type}} - 按类型过滤");
    println!("  DELETE /api/events       - 清空事件");
    println!("  GET  /api/verify-issues  - 验证 GitHub issue 修复");
    println!("  GET  /api/config         - 查看配置");
    println!("  POST /api/config         - 更新 webhook secret");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

