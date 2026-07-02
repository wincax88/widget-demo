package com.eduplus.demo.controller;

import com.eduplus.demo.model.WebhookEvent;
import com.eduplus.demo.repository.WebhookEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
public class EventController {

    private final WebhookEventRepository eventRepository;

    @GetMapping
    public ResponseEntity<List<WebhookEvent>> listEvents() {
        return ResponseEntity.ok(eventRepository.findAllByOrderByReceivedAtDesc());
    }

    @GetMapping("/latest-oauth")
    public ResponseEntity<Map<String, String>> getLatestOAuth() {
        return eventRepository.findFirstByOauthClientIdIsNotNullOrderByReceivedAtDesc()
                .map(e -> ResponseEntity.ok(Map.of(
                        "client_id", e.getOauthClientId() != null ? e.getOauthClientId() : "",
                        "client_secret", e.getOauthClientSecret() != null ? e.getOauthClientSecret() : "",
                        "auth_server_url", e.getOauthAuthServerUrl() != null ? e.getOauthAuthServerUrl() : "",
                        "token_endpoint", e.getOauthTokenEndpoint() != null ? e.getOauthTokenEndpoint() : ""
                )))
                .orElse(ResponseEntity.ok(Map.of()));
    }

    @GetMapping("/by-type/{eventType}")
    public ResponseEntity<List<WebhookEvent>> listByType(@PathVariable String eventType) {
        return ResponseEntity.ok(eventRepository.findByEventTypeOrderByReceivedAtDesc(eventType));
    }

    @GetMapping("/by-type/{eventType}/tenant/{tenantCode}")
    public ResponseEntity<List<WebhookEvent>> listByTypeAndTenant(
            @PathVariable String eventType, @PathVariable String tenantCode) {
        return ResponseEntity.ok(
                eventRepository.findByEventTypeAndTenantCodeOrderByReceivedAtDesc(eventType, tenantCode));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Object>> clearEvents() {
        eventRepository.deleteAll();
        return ResponseEntity.ok(Map.of("success", true));
    }
}
