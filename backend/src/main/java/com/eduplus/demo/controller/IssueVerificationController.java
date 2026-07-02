package com.eduplus.demo.controller;

import com.eduplus.demo.model.WebhookEvent;
import com.eduplus.demo.repository.WebhookEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/verify-issues")
@RequiredArgsConstructor
public class IssueVerificationController {

    private final WebhookEventRepository eventRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> verifyIssues() {
        log.info("Running issue verification checks...");

        Map<String, Map<String, Object>> issues = new LinkedHashMap<>();

        issues.put("issue_2", verifyIssue2And6());
        issues.put("issue_3", verifyIssue3());
        issues.put("issue_4", verifyIssue4());
        issues.put("issue_5", verifyIssue5());
        issues.put("issue_6", verifyIssue2And6()); // Same check as #2
        issues.put("issue_7", verifyIssue7());
        issues.put("issue_8", verifyIssue8());
        issues.put("issue_16", verifyIssue16());

        // Build summary
        long passCount = issues.values().stream().filter(i -> "pass".equals(i.get("status"))).count();
        long failCount = issues.values().stream().filter(i -> "fail".equals(i.get("status"))).count();
        long noDataCount = issues.values().stream().filter(i -> "no_data".equals(i.get("status"))).count();
        long manualCount = issues.values().stream().filter(i -> "manual".equals(i.get("status"))).count();

        long totalEvents = eventRepository.count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("issues", issues);
        result.put("summary", Map.of(
                "pass", passCount,
                "fail", failCount,
                "no_data", noDataCount,
                "manual", manualCount
        ));
        result.put("total_events", totalEvents);

        return ResponseEntity.ok(result);
    }

    /**
     * Issue #2 & #6: credential.rotated events must have credentialNewSecret non-null and non-empty
     */
    private Map<String, Object> verifyIssue2And6() {
        List<WebhookEvent> events = eventRepository.findByEventType("credential.rotated");

        if (events.isEmpty()) {
            return buildResult(
                    "credential.rotated 消息体应含 new_secret",
                    "no_data",
                    "No credential.rotated events found",
                    0
            );
        }

        List<String> failures = new ArrayList<>();
        for (WebhookEvent e : events) {
            if (e.getCredentialNewSecret() == null || e.getCredentialNewSecret().isBlank()) {
                failures.add("Event " + e.getEventId() + " missing credentialNewSecret");
            }
        }

        if (failures.isEmpty()) {
            return buildResult(
                    "credential.rotated 消息体应含 new_secret",
                    "pass",
                    "All " + events.size() + " credential.rotated events have new_secret",
                    events.size()
            );
        } else {
            return buildResult(
                    "credential.rotated 消息体应含 new_secret",
                    "fail",
                    String.join("; ", failures),
                    events.size()
            );
        }
    }

    /**
     * Issue #3: subscription.created should come BEFORE credential.created for same tenant
     */
    private Map<String, Object> verifyIssue3() {
        List<WebhookEvent> subCreated = eventRepository.findByEventType("subscription.created");
        List<WebhookEvent> credCreated = eventRepository.findByEventType("credential.created");

        if (subCreated.isEmpty() && credCreated.isEmpty()) {
            return buildResult(
                    "subscription.created 应早于 credential.created",
                    "no_data",
                    "No subscription.created or credential.created events found",
                    0
            );
        }

        if (subCreated.isEmpty() || credCreated.isEmpty()) {
            String missing = subCreated.isEmpty() ? "subscription.created" : "credential.created";
            return buildResult(
                    "subscription.created 应早于 credential.created",
                    "no_data",
                    "Missing " + missing + " events to compare ordering",
                    subCreated.size() + credCreated.size()
            );
        }

        // Group by tenantCode
        Map<String, List<WebhookEvent>> subByTenant = subCreated.stream()
                .filter(e -> e.getTenantCode() != null)
                .collect(Collectors.groupingBy(WebhookEvent::getTenantCode));

        Map<String, List<WebhookEvent>> credByTenant = credCreated.stream()
                .filter(e -> e.getTenantCode() != null)
                .collect(Collectors.groupingBy(WebhookEvent::getTenantCode));

        List<String> failures = new ArrayList<>();
        int pairsChecked = 0;

        for (String tenant : credByTenant.keySet()) {
            List<WebhookEvent> tenantSubs = subByTenant.get(tenant);
            if (tenantSubs == null || tenantSubs.isEmpty()) {
                failures.add("Tenant " + tenant + ": credential.created exists but no subscription.created");
                continue;
            }

            // Find earliest subscription.created and earliest credential.created for this tenant
            var earliestSub = tenantSubs.stream()
                    .min(Comparator.comparing(WebhookEvent::getReceivedAt))
                    .orElse(null);
            var earliestCred = credByTenant.get(tenant).stream()
                    .min(Comparator.comparing(WebhookEvent::getReceivedAt))
                    .orElse(null);

            if (earliestSub != null && earliestCred != null) {
                pairsChecked++;
                if (earliestSub.getReceivedAt().isAfter(earliestCred.getReceivedAt())) {
                    failures.add("Tenant " + tenant + ": credential.created (" +
                            earliestCred.getReceivedAt() + ") came before subscription.created (" +
                            earliestSub.getReceivedAt() + ")");
                }
            }
        }

        if (failures.isEmpty()) {
            return buildResult(
                    "subscription.created 应早于 credential.created",
                    "pass",
                    "All " + pairsChecked + " tenant pairs have correct ordering",
                    subCreated.size() + credCreated.size()
            );
        } else {
            return buildResult(
                    "subscription.created 应早于 credential.created",
                    "fail",
                    String.join("; ", failures),
                    subCreated.size() + credCreated.size()
            );
        }
    }

    /**
     * Issue #4: subscription.created must have oauth_client info and actor info
     */
    private Map<String, Object> verifyIssue4() {
        List<WebhookEvent> events = eventRepository.findByEventType("subscription.created");

        if (events.isEmpty()) {
            return buildResult(
                    "subscription.created 应含 oauth_client 和 actor 信息",
                    "no_data",
                    "No subscription.created events found",
                    0
            );
        }

        List<String> failures = new ArrayList<>();
        for (WebhookEvent e : events) {
            List<String> missing = new ArrayList<>();
            if (e.getOauthClientSecret() == null || e.getOauthClientSecret().isBlank()) {
                missing.add("oauthClientSecret");
            }
            if (e.getActorUserId() == null || e.getActorUserId().isBlank()) {
                missing.add("actorUserId");
            }
            if (e.getActorName() == null || e.getActorName().isBlank()) {
                missing.add("actorName");
            }
            if (!missing.isEmpty()) {
                failures.add("Event " + e.getEventId() + " (tenant=" + e.getTenantCode() +
                        ", app=" + e.getAppCode() + ") missing: " + String.join(", ", missing));
            }
        }

        if (failures.isEmpty()) {
            return buildResult(
                    "subscription.created 应含 oauth_client 和 actor 信息",
                    "pass",
                    "All " + events.size() + " events have oauthClientSecret, actorUserId, actorName",
                    events.size()
            );
        } else {
            return buildResult(
                    "subscription.created 应含 oauth_client 和 actor 信息",
                    "fail",
                    String.join("; ", failures),
                    events.size()
            );
        }
    }

    /**
     * Issue #5: After activating a school, not ALL apps should be subscribed
     */
    private Map<String, Object> verifyIssue5() {
        List<WebhookEvent> events = eventRepository.findByEventType("subscription.created");

        if (events.isEmpty()) {
            return buildResult(
                    "激活学校不应自动订阅所有应用",
                    "no_data",
                    "No subscription.created events found",
                    0
            );
        }

        // Group by tenantCode, count distinct appCode
        Map<String, Set<String>> appsByTenant = events.stream()
                .filter(e -> e.getTenantCode() != null)
                .collect(Collectors.groupingBy(
                        WebhookEvent::getTenantCode,
                        Collectors.mapping(
                                e -> e.getAppCode() != null ? e.getAppCode() : "unknown",
                                Collectors.toSet()
                        )
                ));

        List<String> details = new ArrayList<>();
        for (Map.Entry<String, Set<String>> entry : appsByTenant.entrySet()) {
            details.add("Tenant " + entry.getKey() + ": " + entry.getValue().size() +
                    " apps [" + String.join(", ", entry.getValue()) + "]");
        }

        return buildResult(
                "激活学校不应自动订阅所有应用",
                "manual",
                "Subscription counts per tenant (review manually): " + String.join("; ", details),
                events.size()
        );
    }

    /**
     * Issue #7: Manual browser test required
     */
    private Map<String, Object> verifyIssue7() {
        return buildResult(
                "需要浏览器手动测试",
                "manual",
                "This issue requires manual browser testing",
                0
        );
    }

    /**
     * Issue #8: Stop/resume school should trigger subscription.suspended and subscription.reactivated
     */
    private Map<String, Object> verifyIssue8() {
        long suspendedCount = eventRepository.countByEventType("subscription.suspended");
        long reactivatedCount = eventRepository.countByEventType("subscription.reactivated");

        if (suspendedCount == 0 && reactivatedCount == 0) {
            return buildResult(
                    "停用/恢复学校应触发 suspended/reactivated 事件",
                    "no_data",
                    "No subscription.suspended or subscription.reactivated events found",
                    0
            );
        }

        List<String> missing = new ArrayList<>();
        if (suspendedCount == 0) {
            missing.add("subscription.suspended");
        }
        if (reactivatedCount == 0) {
            missing.add("subscription.reactivated");
        }

        if (missing.isEmpty()) {
            return buildResult(
                    "停用/恢复学校应触发 suspended/reactivated 事件",
                    "pass",
                    "Found " + suspendedCount + " suspended and " + reactivatedCount + " reactivated events",
                    suspendedCount + reactivatedCount
            );
        } else {
            return buildResult(
                    "停用/恢复学校应触发 suspended/reactivated 事件",
                    "fail",
                    "Missing event types: " + String.join(", ", missing) +
                            " (suspended=" + suspendedCount + ", reactivated=" + reactivatedCount + ")",
                    suspendedCount + reactivatedCount
            );
        }
    }

    /**
     * Issue #16: subscription.created actor.name should be valid (not garbled/reversed)
     */
    private Map<String, Object> verifyIssue16() {
        List<WebhookEvent> events = eventRepository.findByEventType("subscription.created");

        if (events.isEmpty()) {
            return buildResult(
                    "subscription.created actor.name 不应被反转或乱码",
                    "no_data",
                    "No subscription.created events found",
                    0
            );
        }

        List<String> failures = new ArrayList<>();
        for (WebhookEvent e : events) {
            String name = e.getActorName();
            if (name == null) {
                failures.add("Event " + e.getEventId() + ": actorName is null");
            } else if (name.isBlank() || name.length() <= 1) {
                failures.add("Event " + e.getEventId() + ": actorName is blank or too short: '" + name + "'");
            } else if (looksGarbled(name)) {
                failures.add("Event " + e.getEventId() + ": actorName looks garbled: '" + name + "'");
            }
        }

        if (failures.isEmpty()) {
            Set<String> names = events.stream()
                    .map(WebhookEvent::getActorName)
                    .collect(Collectors.toSet());
            return buildResult(
                    "subscription.created actor.name 不应被反转或乱码",
                    "pass",
                    "All " + events.size() + " events have valid actorName. Names seen: " + names,
                    events.size()
            );
        } else {
            return buildResult(
                    "subscription.created actor.name 不应被反转或乱码",
                    "fail",
                    String.join("; ", failures),
                    events.size()
            );
        }
    }

    /**
     * Heuristic to detect garbled/reversed names like "dmin a" (reversed "a dmin" from "admin")
     */
    private boolean looksGarbled(String name) {
        // Check for patterns that look like reversed names
        // "dmin a" is "a dmin" reversed at word level (from "admin" split weirdly)
        if (name.matches(".*\\b[a-z]\\s[a-z]+min\\b.*")) {
            return true;
        }
        // Check if name starts with a lowercase single char followed by space (suspicious pattern)
        if (name.matches("^[a-z]\\s+\\w+$") && name.length() < 10) {
            return true;
        }
        return false;
    }

    private Map<String, Object> buildResult(String title, String status, String details, long eventsChecked) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", title);
        result.put("status", status);
        result.put("details", details);
        result.put("events_checked", eventsChecked);
        return result;
    }
}
