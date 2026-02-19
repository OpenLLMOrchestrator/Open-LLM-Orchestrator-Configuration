package com.olo.web;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * Returns 503 and a single WARN log when Redis is unavailable instead of 500 and ERROR stack traces.
 */
@Slf4j
@RestControllerAdvice
public class RedisExceptionHandler {

    @ExceptionHandler({
            org.springframework.data.redis.RedisConnectionFailureException.class,
            DataAccessResourceFailureException.class
    })
    public ResponseEntity<Map<String, String>> handleRedisConnectionFailure(Exception e) {
        log.warn("Redis unavailable: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Redis unavailable", "message", e.getMessage() != null ? e.getMessage() : "Connection refused"));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRedisUnavailable(RuntimeException e) {
        if ("Redis unavailable".equals(e.getMessage()) || e.getCause() instanceof org.springframework.data.redis.RedisConnectionFailureException) {
            log.warn("Redis unavailable: {}", e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Redis unavailable", "message", e.getMessage() != null ? e.getMessage() : "Connection refused"));
        }
        throw e;
    }
}
