package com.eduplus.demo.controller;

import com.eduplus.demo.model.DemoConfig;
import com.eduplus.demo.model.WebhookEvent;
import com.eduplus.demo.repository.DemoConfigRepository;
import com.eduplus.demo.repository.WebhookEventRepository;
import com.eduplus.demo.service.WebhookVerificationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/webhook")
@RequiredArgsConstructor
public class WebhookController {

    private final WebhookVerificationService verificationService;
    private final WebhookEventRepository eventRepository;
    private final DemoConfigRepository configRepository;
    private final ObjectMapper objectMapper;

    @PostMapping("/eduplus")
    public ResponseEntity<Map<String, Object>> receiveWebhook(
            @RequestHeader(value = "X-EduPlus-Signature", required = false) String signature,
            @RequestHeader(value = "X-EduPlus-Timestamp", required = false) String timestampStr,
            @RequestHeader(value = "X-EduPlus-Event", required = false) String event,
            @RequestBody String rawBody) {

        log.info("Received webhook: event={}", event);

        String secret = configRepository.findByConfigKey("webhook_secret")
                .map(DemoConfig::getConfigValue)
                .orElse("");

        long timestamp = 0;
        try {
            timestamp = Long.parseLong(timestampStr);
        } catch (Exception ignored) {
        }

        boolean signatureValid = false;
        if (!secret.isBlank()) {
            signatureValid = verificationService.verify(secret, signature, timestamp, event, rawBody);
        }

        // Parse and store event
        var webhookEvent = new WebhookEvent();
        webhookEvent.setEventId(event);
        webhookEvent.setEventType(event);
        webhookEvent.setSignatureValid(signatureValid);
        webhookEvent.setRawBody(rawBody);
        webhookEvent.setReceivedAt(LocalDateTime.now());

        try {
            JsonNode json = objectMapper.readTree(rawBody);

            if (json.has("event_id")) {
                webhookEvent.setEventId(json.get("event_id").asText());
            }
            if (json.has("tenant")) {
                JsonNode tenant = json.get("tenant");
                webhookEvent.setTenantCode(tenant.has("code") ? tenant.get("code").asText() : null);
                webhookEvent.setTenantName(tenant.has("name") ? tenant.get("name").asText() : null);
            }
            if (json.has("app")) {
                webhookEvent.setAppCode(json.get("app").has("code") ? json.get("app").get("code").asText() : null);
            }
            if (json.has("subscription")) {
                JsonNode sub = json.get("subscription");
                webhookEvent.setSubscriptionStatus(sub.has("status") ? sub.get("status").asText() : null);
            }
            if (json.has("oauth_client") && !json.get("oauth_client").isNull()) {
                JsonNode oauth = json.get("oauth_client");
                webhookEvent.setOauthClientId(getTextOrNull(oauth, "client_id"));
                webhookEvent.setOauthClientSecret(getTextOrNull(oauth, "client_secret"));
                webhookEvent.setOauthAuthServerUrl(getTextOrNull(oauth, "auth_server_url"));
                webhookEvent.setOauthTokenEndpoint(getTextOrNull(oauth, "token_endpoint"));
            }
            // Actor info (Issue #16, #4)
            if (json.has("actor") && !json.get("actor").isNull()) {
                JsonNode actor = json.get("actor");
                webhookEvent.setActorUserId(getTextOrNull(actor, "user_id"));
                webhookEvent.setActorName(getTextOrNull(actor, "name"));
                webhookEvent.setActorType(getTextOrNull(actor, "type"));
            }
            // Credential info (Issue #2, #6)
            if (json.has("credential") && !json.get("credential").isNull()) {
                JsonNode cred = json.get("credential");
                webhookEvent.setCredentialId(cred.has("id") && !cred.get("id").isNull() ? cred.get("id").asLong() : null);
                webhookEvent.setCredentialClientId(getTextOrNull(cred, "client_id"));
                webhookEvent.setCredentialNewSecret(getTextOrNull(cred, "new_secret"));
                webhookEvent.setCredentialScopeType(getTextOrNull(cred, "scope_type"));
            }
        } catch (Exception e) {
            log.warn("Failed to parse webhook body", e);
        }

        eventRepository.save(webhookEvent);

        log.info("Stored webhook event: id={}, type={}, tenant={}",
                webhookEvent.getEventId(), webhookEvent.getEventType(), webhookEvent.getTenantCode());

        // Return WebhookResponse format
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Event received and stored",
                "data", Map.of(
                        "event_id", webhookEvent.getEventId(),
                        "signature_valid", signatureValid
                )
        ));
    }

    private String getTextOrNull(JsonNode node, String field) {
        if (!node.has(field) || node.get(field).isNull()) {
            return null;
        }
        return node.get(field).asText();
    }
}
