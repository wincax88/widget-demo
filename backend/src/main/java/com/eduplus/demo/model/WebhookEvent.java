package com.eduplus.demo.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "webhook_event")
public class WebhookEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id")
    private String eventId;

    @Column(name = "event_type")
    private String eventType;

    @Column(name = "tenant_code")
    private String tenantCode;

    @Column(name = "tenant_name")
    private String tenantName;

    @Column(name = "app_code")
    private String appCode;

    @Column(name = "subscription_status")
    private String subscriptionStatus;

    @Column(name = "signature_valid")
    private Boolean signatureValid;

    @Column(name = "raw_body", length = 10000)
    private String rawBody;

    @Column(name = "oauth_client_id")
    private String oauthClientId;

    @Column(name = "oauth_client_secret", length = 1024)
    private String oauthClientSecret;

    @Column(name = "oauth_auth_server_url")
    private String oauthAuthServerUrl;

    @Column(name = "oauth_token_endpoint")
    private String oauthTokenEndpoint;

    // Actor fields (Issue #16, #4)
    @Column(name = "actor_user_id")
    private String actorUserId;

    @Column(name = "actor_name")
    private String actorName;

    @Column(name = "actor_type")
    private String actorType;

    // Credential fields (Issue #2, #6)
    @Column(name = "credential_id")
    private Long credentialId;

    @Column(name = "credential_client_id")
    private String credentialClientId;

    @Column(name = "credential_new_secret", length = 1024)
    private String credentialNewSecret;

    @Column(name = "credential_scope_type")
    private String credentialScopeType;

    @Column(name = "received_at")
    private LocalDateTime receivedAt;
}
