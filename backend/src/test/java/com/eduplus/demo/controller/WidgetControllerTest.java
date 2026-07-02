package com.eduplus.demo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class WidgetControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void schemaDiscoveryReturnsFourWidgetTypes() throws Exception {
        mockMvc.perform(get("/v1/open/demo-school/widgets/schema"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schema_version").value("1.0"))
                .andExpect(jsonPath("$.widgets.length()").value(4))
                .andExpect(jsonPath("$.widgets[*].widget_key", containsInAnyOrder(
                        "demo-school-homework-list",
                        "demo-school-attendance-stat",
                        "demo-school-exam-table",
                        "demo-school-announcement-timeline"
                )))
                .andExpect(jsonPath("$.widgets[*].widget_type", containsInAnyOrder(
                        "list-card",
                        "stat-card",
                        "table",
                        "timeline"
                )));
    }

    @Test
    void authAndRefreshReturnWidgetAccessTokens() throws Exception {
        MvcResult authResult = mockMvc.perform(post("/v1/open/demo-school/widgets/auth")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "handoff_code": "demo-handoff-code",
                                  "idempotency_key": "idem-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").isNotEmpty())
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.expires_in").value(300))
                .andExpect(jsonPath("$.scope").value("widget.data.read"))
                .andExpect(jsonPath("$.refresh_session_id").isNotEmpty())
                .andExpect(jsonPath("$.refresh_after").value(240))
                .andReturn();

        JsonNode auth = objectMapper.readTree(authResult.getResponse().getContentAsString());
        String accessToken = auth.get("access_token").asText();
        String refreshSessionId = auth.get("refresh_session_id").asText();

        mockMvc.perform(post("/v1/open/demo-school/widgets/token/refresh")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "grant_type": "eduplus_widget_token_refresh",
                                  "refresh_session_id": "%s"
                                }
                                """.formatted(refreshSessionId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").isNotEmpty())
                .andExpect(jsonPath("$.access_token").value(org.hamcrest.Matchers.not(accessToken)))
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.expires_in").value(300))
                .andExpect(jsonPath("$.scope").value("widget.data.read"))
                .andExpect(jsonPath("$.refresh_session_id").value(refreshSessionId))
                .andExpect(jsonPath("$.refresh_after").value(240));
    }

    @Test
    void batchDataRejectsMissingToken() throws Exception {
        mockMvc.perform(post("/v1/open/demo-school/widgets/batch-data")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "widget_keys": ["demo-school-homework-list"]
                                }
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("WIDGET_TOKEN_MISSING"));
    }

    @Test
    void batchDataReturnsMockDataForFourWidgets() throws Exception {
        String accessToken = issueAccessToken();

        mockMvc.perform(post("/v1/open/demo-school/widgets/batch-data")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "widget_keys": [
                                    "demo-school-homework-list",
                                    "demo-school-attendance-stat",
                                    "demo-school-exam-table",
                                    "demo-school-announcement-timeline"
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.widgets.demo-school-homework-list.code").value(0))
                .andExpect(jsonPath("$.widgets.demo-school-homework-list.data.items.length()").value(2))
                .andExpect(jsonPath("$.widgets.demo-school-attendance-stat.data.attendance_rate").value(96.8))
                .andExpect(jsonPath("$.widgets.demo-school-exam-table.data.rows.length()").value(2))
                .andExpect(jsonPath("$.widgets.demo-school-announcement-timeline.data.items.length()").value(2));
    }

    private String issueAccessToken() throws Exception {
        MvcResult authResult = mockMvc.perform(post("/v1/open/demo-school/widgets/auth")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "handoff_code": "demo-handoff-code",
                                  "idempotency_key": "idem-batch"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(authResult.getResponse().getContentAsString())
                .get("access_token")
                .asText();
    }
}
