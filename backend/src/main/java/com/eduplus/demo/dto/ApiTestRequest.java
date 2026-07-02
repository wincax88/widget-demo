package com.eduplus.demo.dto;

import lombok.Data;

@Data
public class ApiTestRequest {

    private String method;
    private String path;
    private String body;
    private String authMode;
}
