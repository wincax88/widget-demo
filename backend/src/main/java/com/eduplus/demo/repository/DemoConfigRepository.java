package com.eduplus.demo.repository;

import com.eduplus.demo.model.DemoConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DemoConfigRepository extends JpaRepository<DemoConfig, Long> {

    Optional<DemoConfig> findByConfigKey(String configKey);
}
