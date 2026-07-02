package com.eduplus.demo.repository;

import com.eduplus.demo.model.WebhookEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WebhookEventRepository extends JpaRepository<WebhookEvent, Long> {

    List<WebhookEvent> findAllByOrderByReceivedAtDesc();

    Optional<WebhookEvent> findFirstByOauthClientIdIsNotNullOrderByReceivedAtDesc();

    List<WebhookEvent> findByEventTypeOrderByReceivedAtDesc(String eventType);

    List<WebhookEvent> findByEventTypeAndTenantCodeOrderByReceivedAtDesc(String eventType, String tenantCode);

    List<WebhookEvent> findByEventType(String eventType);

    long countByEventType(String eventType);
}
