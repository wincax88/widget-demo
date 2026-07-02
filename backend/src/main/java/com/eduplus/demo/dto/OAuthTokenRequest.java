package com.eduplus.demo.dto;

import lombok.Data;

@Data
public class OAuthTokenRequest {

    private String clientId;
    private String clientSecret;
    private String tokenEndpoint;
}
