package com.eduplus.demo.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.HmacAlgorithms;
import org.apache.commons.codec.digest.HmacUtils;
import org.springframework.stereotype.Service;

/**
 * Verify incoming webhook signatures from EduPlus.
 *
 * Mirrors: WebhookServiceImpl.generateSignature()
 * Algorithm: payload = "{timestamp}.{event}.{requestBody}" -> HmacSHA256Hex(secret, payload)
 * Header format: X-EduPlus-Signature: sha256={hex_signature}
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookVerificationService {

    public boolean verify(String webhookSecret, String signatureHeader, long timestamp, String event, String rawBody) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.warn("Webhook secret not configured, skipping verification");
            return false;
        }

        if (signatureHeader == null || !signatureHeader.startsWith("sha256=")) {
            log.warn("Invalid signature header format: {}", signatureHeader);
            return false;
        }

        String receivedSignature = signatureHeader.substring("sha256=".length());
        String expectedSignature = generateSignature(webhookSecret, timestamp, event, rawBody);

        boolean valid = expectedSignature.equals(receivedSignature);
        log.info("Webhook signature verification: valid={}, event={}", valid, event);
        return valid;
    }

    public String generateSignature(String secret, long timestamp, String event, String requestBody) {
        String payload = String.format("%d.%s.%s", timestamp, event, requestBody);
        return new HmacUtils(HmacAlgorithms.HMAC_SHA_256, secret).hmacHex(payload);
    }
}
