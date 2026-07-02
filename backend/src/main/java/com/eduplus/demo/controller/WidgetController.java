package com.eduplus.demo.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/v1/open/demo-school/widgets")
public class WidgetController {

    private static final int EXPIRES_IN_SECONDS = 300;
    private static final int REFRESH_AFTER_SECONDS = 240;

    private final Map<String, Session> sessionsByRefreshSessionId = new ConcurrentHashMap<>();
    private final Map<String, String> refreshSessionIdsByAccessToken = new ConcurrentHashMap<>();

    @GetMapping("/schema")
    public ResponseEntity<Map<String, Object>> schema() {
        return ResponseEntity.ok(Map.of(
                "schema_version", "1.0",
                "generated_at", Instant.now().toString(),
                "widgets", widgetSchemas()
        ));
    }

    @PostMapping("/auth")
    public ResponseEntity<Map<String, Object>> auth(@RequestBody Map<String, Object> request) {
        String handoffCode = stringValue(request.get("handoff_code"));
        if (handoffCode.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error("INVALID_HANDOFF_CODE"));
        }
        String refreshSessionId = "demo-refresh-" + UUID.randomUUID();
        String accessToken = "demo-widget-token-" + UUID.randomUUID();
        var session = new Session(refreshSessionId, accessToken, Instant.now().plusSeconds(EXPIRES_IN_SECONDS));
        sessionsByRefreshSessionId.put(refreshSessionId, session);
        refreshSessionIdsByAccessToken.put(accessToken, refreshSessionId);
        return ResponseEntity.ok(tokenResponse(accessToken, refreshSessionId));
    }

    @PostMapping("/token/refresh")
    public ResponseEntity<Map<String, Object>> refresh(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> request) {
        String accessToken = bearerToken(authorization);
        if (accessToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error("WIDGET_TOKEN_MISSING"));
        }
        String refreshSessionId = stringValue(request.get("refresh_session_id"));
        String tokenSessionId = refreshSessionIdsByAccessToken.get(accessToken);
        if (!refreshSessionId.equals(tokenSessionId) || !sessionsByRefreshSessionId.containsKey(refreshSessionId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error("WIDGET_REFRESH_EXPIRED"));
        }
        String newAccessToken = "demo-widget-token-" + UUID.randomUUID();
        refreshSessionIdsByAccessToken.remove(accessToken);
        refreshSessionIdsByAccessToken.put(newAccessToken, refreshSessionId);
        sessionsByRefreshSessionId.put(
                refreshSessionId,
                new Session(refreshSessionId, newAccessToken, Instant.now().plusSeconds(EXPIRES_IN_SECONDS))
        );
        return ResponseEntity.ok(tokenResponse(newAccessToken, refreshSessionId));
    }

    @PostMapping("/batch-data")
    public ResponseEntity<Map<String, Object>> batchData(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> request) {
        String accessToken = bearerToken(authorization);
        if (accessToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error("WIDGET_TOKEN_MISSING"));
        }
        if (!refreshSessionIdsByAccessToken.containsKey(accessToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error("WIDGET_TOKEN_EXPIRED"));
        }

        var widgets = new LinkedHashMap<String, Object>();
        Object requestedWidgetKeys = request.get("widget_keys");
        if (requestedWidgetKeys instanceof List<?> widgetKeys) {
            for (Object widgetKey : widgetKeys) {
                String key = stringValue(widgetKey);
                if (!key.isBlank()) {
                    widgets.put(key, widgetData(key));
                }
            }
        }

        return ResponseEntity.ok(Map.of(
                "code", 0,
                "message", "success",
                "widgets", widgets,
                "served_at", Instant.now().toString()
        ));
    }

    private List<Map<String, Object>> widgetSchemas() {
        return List.of(
                object(
                        "widget_key", "demo-school-homework-list",
                        "schema_version", "1.0",
                        "component_version", "1.0.0",
                        "name", "最近作业",
                        "description", "展示近期作业和截止时间",
                        "widget_type", "list-card",
                        "data_source", Map.of(
                                "url", "/v1/open/demo-school/homework/recent",
                                "method", "GET",
                                "refreshInterval", 120
                        ),
                        "fields", Map.of(
                                "itemsPath", "data.items",
                                "item", Map.of(
                                        "id", "homework_id",
                                        "title", "title",
                                        "description", "subject",
                                        "time", "due_at"
                                )
                        ),
                        "default_layout", Map.of("w", 12, "h", 8, "minW", 8, "minH", 5, "maxW", 16, "maxH", 16),
                        "show_refresh", true,
                        "category", "teaching",
                        "applicable_roles", "teacher,student"
                ),
                object(
                        "widget_key", "demo-school-attendance-stat",
                        "schema_version", "1.0",
                        "component_version", "1.0.0",
                        "name", "考勤统计",
                        "description", "展示今日出勤率和异常人数",
                        "widget_type", "stat-card",
                        "data_source", Map.of(
                                "url", "/v1/open/demo-school/attendance/stats",
                                "method", "GET",
                                "refreshInterval", 300
                        ),
                        "fields", Map.of("stat", Map.of(
                                "出勤率", "attendance_rate",
                                "请假人数", "leave_count",
                                "缺勤人数", "absent_count"
                        )),
                        "default_layout", Map.of("w", 6, "h", 4, "minW", 4, "minH", 3, "maxW", 12, "maxH", 6),
                        "show_refresh", true,
                        "category", "statistics",
                        "applicable_roles", "teacher"
                ),
                object(
                        "widget_key", "demo-school-exam-table",
                        "schema_version", "1.0",
                        "component_version", "1.0.0",
                        "name", "考试成绩",
                        "description", "展示最近一次考试成绩概览",
                        "widget_type", "table",
                        "data_source", Map.of(
                                "url", "/v1/open/demo-school/exams/latest-scores",
                                "method", "GET",
                                "refreshInterval", 600
                        ),
                        "fields", Map.of(
                                "itemsPath", "data.rows",
                                "columns", List.of(
                                        Map.of("title", "学生", "dataIndex", "student_name"),
                                        Map.of("title", "科目", "dataIndex", "subject"),
                                        Map.of("title", "分数", "dataIndex", "score"),
                                        Map.of("title", "等级", "dataIndex", "level")
                                )
                        ),
                        "default_layout", Map.of("w", 12, "h", 8, "minW", 8, "minH", 5, "maxW", 18, "maxH", 16),
                        "show_refresh", true,
                        "category", "learning",
                        "applicable_roles", "teacher,parent"
                ),
                object(
                        "widget_key", "demo-school-announcement-timeline",
                        "schema_version", "1.0",
                        "component_version", "1.0.0",
                        "name", "校园公告",
                        "description", "展示近期校园公告时间线",
                        "widget_type", "timeline",
                        "data_source", Map.of(
                                "url", "/v1/open/demo-school/announcements/timeline",
                                "method", "GET",
                                "refreshInterval", 300
                        ),
                        "fields", Map.of(
                                "itemsPath", "data.items",
                                "item", Map.of(
                                        "id", "announcement_id",
                                        "title", "title",
                                        "description", "summary",
                                        "time", "published_at"
                                )
                        ),
                        "default_layout", Map.of("w", 12, "h", 8, "minW", 8, "minH", 5, "maxW", 16, "maxH", 16),
                        "show_refresh", true,
                        "category", "notification",
                        "applicable_roles", "teacher,student,parent"
                )
        );
    }

    private Map<String, Object> object(Object... keyValues) {
        var result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < keyValues.length; i += 2) {
            result.put((String) keyValues[i], keyValues[i + 1]);
        }
        return result;
    }

    private Map<String, Object> widgetData(String widgetKey) {
        return switch (widgetKey) {
            case "demo-school-homework-list" -> Map.of(
                    "code", 0,
                    "data", Map.of("items", List.of(
                            Map.of(
                                    "homework_id", "hw-001",
                                    "title", "数学第三章练习",
                                    "subject", "数学",
                                    "due_at", "2026-07-03 18:00"
                            ),
                            Map.of(
                                    "homework_id", "hw-002",
                                    "title", "语文阅读摘记",
                                    "subject", "语文",
                                    "due_at", "2026-07-04 20:00"
                            )
                    ))
            );
            case "demo-school-attendance-stat" -> Map.of(
                    "code", 0,
                    "data", Map.of(
                            "attendance_rate", 96.8,
                            "leave_count", 3,
                            "absent_count", 1
                    )
            );
            case "demo-school-exam-table" -> Map.of(
                    "code", 0,
                    "data", Map.of("rows", List.of(
                            Map.of(
                                    "student_name", "张三",
                                    "subject", "数学",
                                    "score", 95,
                                    "level", "A"
                            ),
                            Map.of(
                                    "student_name", "李四",
                                    "subject", "语文",
                                    "score", 88,
                                    "level", "B"
                            )
                    ))
            );
            case "demo-school-announcement-timeline" -> Map.of(
                    "code", 0,
                    "data", Map.of("items", List.of(
                            Map.of(
                                    "announcement_id", "ann-001",
                                    "title", "期末家长会通知",
                                    "summary", "本周五 19:00 在线召开期末家长会",
                                    "published_at", "2026-07-01 09:00"
                            ),
                            Map.of(
                                    "announcement_id", "ann-002",
                                    "title", "暑期安全提醒",
                                    "summary", "请关注防溺水、交通与网络安全",
                                    "published_at", "2026-06-30 16:30"
                            )
                    ))
            );
            default -> Map.of(
                    "code", 404,
                    "message", "UNKNOWN_WIDGET",
                    "data", Map.of()
            );
        };
    }

    private Map<String, Object> tokenResponse(String accessToken, String refreshSessionId) {
        return Map.of(
                "access_token", accessToken,
                "token_type", "Bearer",
                "expires_in", EXPIRES_IN_SECONDS,
                "scope", "widget.data.read",
                "refresh_session_id", refreshSessionId,
                "refresh_after", REFRESH_AFTER_SECONDS
        );
    }

    private Map<String, Object> error(String code) {
        return Map.of("code", code, "message", code);
    }

    private String bearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return "";
        }
        return authorization.substring("Bearer ".length()).trim();
    }

    private String stringValue(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    private record Session(String refreshSessionId, String accessToken, Instant expiresAt) {
    }
}
