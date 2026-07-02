package com.eduplus.demo.config;

import com.eduplus.demo.model.DemoConfig;
import com.eduplus.demo.repository.DemoConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Configuration
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final DemoConfigRepository configRepository;

    @Value("${demo.webhook-secret:}")
    private String webhookSecret;

    @Value("${demo.api-client-id:}")
    private String apiClientId;

    @Value("${demo.api-client-secret:}")
    private String apiClientSecret;

    @Value("${demo.eduplus-base-url:http://localhost:9080/api}")
    private String eduplusBaseUrl;

    @Value("${demo.keycloak-base-url:http://localhost:8080}")
    private String keycloakBaseUrl;

    @Value("${demo.keycloak-realm:eduplus}")
    private String keycloakRealm;

    @Override
    public void run(String... args) {
        Map.of(
                "webhook_secret", webhookSecret,
                "api_client_id", apiClientId,
                "api_client_secret", apiClientSecret,
                "eduplus_base_url", eduplusBaseUrl,
                "keycloak_base_url", keycloakBaseUrl,
                "keycloak_realm", keycloakRealm
        ).forEach((key, value) -> {
            if (configRepository.findByConfigKey(key).isEmpty()) {
                var config = new DemoConfig();
                config.setConfigKey(key);
                config.setConfigValue(value);
                configRepository.save(config);
            }
        });
    }
}
