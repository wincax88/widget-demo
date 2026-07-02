package com.eduplus.demo.service;

import com.eduplus.demo.dto.OAuthTokenResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestTemplate;

/**
 * Exchange OAuth client_credentials for an access token from Keycloak.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OAuthClientService {

    private final RestTemplate restTemplate;

    @SuppressWarnings("unchecked")
    public OAuthTokenResponse getToken(String tokenEndpoint, String clientId, String clientSecret) {
        try {
            var params = new LinkedMultiValueMap<String, String>();
            params.add("grant_type", "client_credentials");
            params.add("client_id", clientId);
            params.add("client_secret", clientSecret);

            var headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            var request = new HttpEntity<>(params, headers);
            ResponseEntity<String> response = restTemplate.exchange(
                    tokenEndpoint, HttpMethod.POST, request, String.class);

            // Parse manually to preserve raw response
            String raw = response.getBody();
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var json = mapper.readTree(raw);

            return OAuthTokenResponse.builder()
                    .accessToken(json.has("access_token") ? json.get("access_token").asText() : null)
                    .tokenType(json.has("token_type") ? json.get("token_type").asText() : null)
                    .expiresIn(json.has("expires_in") ? json.get("expires_in").asInt() : null)
                    .scope(json.has("scope") ? json.get("scope").asText() : null)
                    .rawResponse(raw)
                    .build();
        } catch (Exception e) {
            log.error("OAuth token exchange failed", e);
            return OAuthTokenResponse.builder()
                    .error(e.getMessage())
                    .build();
        }
    }
}
