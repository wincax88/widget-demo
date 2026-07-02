package com.eduplus.demo.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class ApiTestResponse {

    private int statusCode;
    private String responseBody;
    private Map<String, String> requestHeaders;
    private String stringToSign;
    private String bodyHash;
    private String signature;
    private String error;
}
