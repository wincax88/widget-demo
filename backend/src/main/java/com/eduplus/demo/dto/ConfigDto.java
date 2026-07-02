package com.eduplus.demo.dto;

import lombok.Data;

@Data
public class ConfigDto {

    private String webhookSecret;
    private String apiClientId;
    private String apiClientSecret;
    private String eduplusBaseUrl;
    private String keycloakBaseUrl;
    private String keycloakRealm;
}
