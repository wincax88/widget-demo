package com.eduplus.demo.controller;

import com.eduplus.demo.dto.ConfigDto;
import com.eduplus.demo.model.DemoConfig;
import com.eduplus.demo.repository.DemoConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/config")
@RequiredArgsConstructor
public class ConfigController {

    private final DemoConfigRepository configRepository;

    @GetMapping
    public ResponseEntity<ConfigDto> getConfig() {
        var dto = new ConfigDto();
        dto.setWebhookSecret(getValue("webhook_secret"));
        dto.setApiClientId(getValue("api_client_id"));
        dto.setApiClientSecret(getValue("api_client_secret"));
        dto.setEduplusBaseUrl(getValue("eduplus_base_url"));
        dto.setKeycloakBaseUrl(getValue("keycloak_base_url"));
        dto.setKeycloakRealm(getValue("keycloak_realm"));
        return ResponseEntity.ok(dto);
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> updateConfig(@RequestBody ConfigDto dto) {
        setValue("webhook_secret", dto.getWebhookSecret());
        setValue("api_client_id", dto.getApiClientId());
        setValue("api_client_secret", dto.getApiClientSecret());
        setValue("eduplus_base_url", dto.getEduplusBaseUrl());
        setValue("keycloak_base_url", dto.getKeycloakBaseUrl());
        setValue("keycloak_realm", dto.getKeycloakRealm());
        return ResponseEntity.ok(Map.of("success", true));
    }

    private String getValue(String key) {
        return configRepository.findByConfigKey(key)
                .map(DemoConfig::getConfigValue)
                .orElse("");
    }

    private void setValue(String key, String value) {
        if (value == null) return;
        var config = configRepository.findByConfigKey(key)
                .orElseGet(() -> {
                    var c = new DemoConfig();
                    c.setConfigKey(key);
                    return c;
                });
        config.setConfigValue(value);
        configRepository.save(config);
    }
}
