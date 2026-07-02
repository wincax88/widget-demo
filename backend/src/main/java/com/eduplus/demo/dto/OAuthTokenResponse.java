package com.eduplus.demo.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class OAuthTokenResponse {

    private String accessToken;
    private String tokenType;
    private Integer expiresIn;
    private String scope;
    private String rawResponse;
    private String error;
}
