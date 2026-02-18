package com.olo.web;

import lombok.Data;

@Data
public class EngineConfigUpsertRequest {
    private String name;
    private String configJson;
}
