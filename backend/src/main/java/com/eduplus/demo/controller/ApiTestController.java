package com.eduplus.demo.controller;

import com.eduplus.demo.dto.ApiTestRequest;
import com.eduplus.demo.dto.ApiTestResponse;
import com.eduplus.demo.dto.OAuthTokenRequest;
import com.eduplus.demo.dto.OAuthTokenResponse;
import com.eduplus.demo.model.DemoConfig;
import com.eduplus.demo.repository.DemoConfigRepository;
import com.eduplus.demo.service.HmacSignatureService;
import com.eduplus.demo.service.OAuthClientService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

@Slf4j
@RestController
@RequestMapping("/api/test")
@RequiredArgsConstructor
public class ApiTestController {

    private final HmacSignatureService hmacService;
    private final OAuthClientService oAuthClientService;
    private final DemoConfigRepository configRepository;
    private final RestTemplate restTemplate;

    @PostMapping("/api-call")
    public ResponseEntity<ApiTestResponse> testApiCall(@RequestBody ApiTestRequest request) {
        String clientId = getConfig("api_client_id");
        String clientSecret = getConfig("api_client_secret");
        String baseUrl = getConfig("eduplus_base_url");

        if (clientId.isBlank() || clientSecret.isBlank()) {
            return ResponseEntity.ok(ApiTestResponse.builder()
                    .error("API credentials not configured")
                    .build());
        }

        String fullUrl = baseUrl + request.getPath();
        String method = request.getMethod() != null ? request.getMethod().toUpperCase() : "GET";
        String authMode = request.getAuthMode() != null ? request.getAuthMode() : "hmac";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ApiTestResponse.ApiTestResponseBuilder responseBuilder = ApiTestResponse.builder();

        if ("simple".equals(authMode)) {
            var simpleHeaders = hmacService.simpleHeaders(clientId, clientSecret);
            simpleHeaders.forEach(headers::set);
            responseBuilder.requestHeaders(simpleHeaders);
        } else {
            var signResult = hmacService.sign(method, request.getPath(), request.getBody(), clientId, clientSecret);
            if (signResult.error() != null) {
                return ResponseEntity.ok(ApiTestResponse.builder()
                        .error("Signing failed: " + signResult.error())
                        .build());
            }
            signResult.headers().forEach(headers::set);
            responseBuilder
                    .requestHeaders(signResult.headers())
                    .stringToSign(signResult.stringToSign())
                    .bodyHash(signResult.bodyHash())
                    .signature(signResult.signature());
        }

        try {
            HttpEntity<String> httpEntity = new HttpEntity<>(request.getBody(), headers);
            ResponseEntity<String> response = restTemplate.exchange(
                    fullUrl, HttpMethod.valueOf(method), httpEntity, String.class);

            responseBuilder
                    .statusCode(response.getStatusCode().value())
                    .responseBody(response.getBody());
        } catch (HttpStatusCodeException e) {
            responseBuilder
                    .statusCode(e.getStatusCode().value())
                    .responseBody(e.getResponseBodyAsString());
        } catch (Exception e) {
            responseBuilder.error("Request failed: " + e.getMessage());
        }

        return ResponseEntity.ok(responseBuilder.build());
    }

    @PostMapping("/oauth-token")
    public ResponseEntity<OAuthTokenResponse> testOAuthToken(@RequestBody OAuthTokenRequest request) {
        String tokenEndpoint = request.getTokenEndpoint();
        if (tokenEndpoint == null || tokenEndpoint.isBlank()) {
            String baseUrl = getConfig("keycloak_base_url");
            String realm = getConfig("keycloak_realm");
            tokenEndpoint = baseUrl + "/realms/" + realm + "/protocol/openid-connect/token";
        }

        return ResponseEntity.ok(oAuthClientService.getToken(
                tokenEndpoint, request.getClientId(), request.getClientSecret()));
    }

    private String getConfig(String key) {
        return configRepository.findByConfigKey(key)
                .map(DemoConfig::getConfigValue)
                .orElse("");
    }
}
