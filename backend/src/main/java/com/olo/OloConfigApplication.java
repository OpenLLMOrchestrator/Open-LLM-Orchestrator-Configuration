package com.olo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
public class OloConfigApplication {

    public static void main(String[] args) {
        // Use UTC for PostgreSQL connection (avoids "invalid value for parameter TimeZone: Asia/Calcutta" on minimal images)
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(OloConfigApplication.class, args);
    }
}
