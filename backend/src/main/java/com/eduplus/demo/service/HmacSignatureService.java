package com.eduplus.demo.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Sign outgoing API requests to EduPlus /v1/open/* endpoints.
 *
 * Mirrors: api-signature-examples.md
 * Algorithm:
 *   string_to_sign = "{method}\n{path}\n{timestamp}\n{nonce}\n{body_hash}"
 *   signature = Base64(HMAC-SHA256(client_secret, string_to_sign))
 */
@Slf4j
@Service
public class HmacSignatureService {

    public SignResult sign(String method, String path, String body, String clientId, String clientSecret) {
        try {
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
            String nonce = UUID.randomUUID().toString();
            String bodyHash = (body != null && !body.isEmpty()) ? sha256Hex(body) : "";

            String stringToSign = String.join("\n", method.toUpperCase(), path, timestamp, nonce, bodyHash);

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(clientSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = Base64.getEncoder().encodeToString(
                    mac.doFinal(stringToSign.getBytes(StandardCharsets.UTF_8)));

            var headers = new LinkedHashMap<String, String>();
            headers.put("X-Client-Id", clientId);
            headers.put("X-Timestamp", timestamp);
            headers.put("X-Nonce", nonce);
            headers.put("X-Signature", signature);
            if (!bodyHash.isEmpty()) {
                headers.put("X-Body-Hash", bodyHash);
            }

            return new SignResult(headers, stringToSign, bodyHash, signature, null);
        } catch (Exception e) {
            log.error("Failed to sign request", e);
            return new SignResult(Map.of(), "", "", "", e.getMessage());
        }
    }

    public Map<String, String> simpleHeaders(String clientId, String clientSecret) {
        return Map.of("X-API-Key", clientId + ":" + clientSecret);
    }

    private String sha256Hex(String input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    public record SignResult(
            Map<String, String> headers,
            String stringToSign,
            String bodyHash,
            String signature,
            String error
    ) {}
}
